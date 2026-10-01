import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './helpers/database';
import { LiveWorldStore } from '../src/server/live-store';
import { WorldStore } from '../src/server/store';
import { applyCommand, compactWorld, type Command } from '../src/server/world';
import { uploadRequest, prepareUpload, splitText, hashText } from '../src/server/uploads';
import { startReplay, exportReplay, verifyReplay } from '../src/server/replay';
import { Simulation } from '../src/sim/engine';
import { balance } from '../src/sim/economy';
import { buildPosition, landQuote } from '../src/sim/frontier';
import { expressionContext, validateExpression } from '../src/llm/expression';
import { expressionAPI } from '../src/server/expressions';
import { operationsStatus, recordRequest } from '../src/server/operations';
import worker from '../src/server/worker';
const now = Date.now();
async function setup() {
  const db = database(),
    s = new LiveWorldStore(db);
  await s.init(now);
  return { db, s };
}
async function send(s: LiveWorldStore, action: Command['action'], at = now) {
  const w = await s.read(),
    c = { id: crypto.randomUUID(), revision: w.revision, action };
  const next = await applyCommand(w, c, at);
  await s.commit(next.world, next.events, c.id, c.id, [], { action, at });
  return next.world;
}

test('chunk upload resumes identical parts, verifies bytes/hash and atomically applies a 10MB+ archive', async () => {
  const { db, s } = await setup(),
    w = await s.read(),
    state = new Simulation(7, 12).snapshot();
  // Valid event descriptions are capped at 1000 characters. This archive exceeds 10MB in UTF-8.
  for (let i = 0; i < 3800; i++)
    state.events.push({
      id: `archive-${i}`,
      tick: state.tick,
      kind: 'weather',
      participants: [],
      importance: 1,
      description: '가'.repeat(950),
      data: {},
    });
  const text = JSON.stringify(state),
    bytes = new TextEncoder().encode(text).length;
  assert.ok(bytes > 10_000_000);
  const start = (await uploadRequest(s, 'owner', { type: 'start', hash: await hashText(text), bytes }, now)) as {
    id: string;
    next: number;
  };
  const chunks = splitText(text);
  for (let part = 0; part < chunks.length; part++)
    await uploadRequest(s, 'owner', { type: 'part', id: start.id, part, text: chunks[part] }, now);
  await uploadRequest(s, 'owner', { type: 'part', id: start.id, part: 0, text: chunks[0] }, now);
  await assert.rejects(
    uploadRequest(s, 'owner', { type: 'part', id: start.id, part: 0, text: 'different' }, now),
    /다릅니다/,
  );
  await assert.rejects(uploadRequest(s, 'guest', { type: 'validate', id: start.id }, now), /없거나/);
  const resume = (await uploadRequest(s, 'owner', { type: 'start', hash: await hashText(text), bytes }, now)) as {
    id: string;
    next: number;
  };
  assert.equal(resume.id, start.id);
  assert.equal(resume.next, chunks.length);
  await uploadRequest(s, 'owner', { type: 'validate', id: start.id }, now);
  assert.equal((await s.read()).epoch, w.epoch);
  const current = await s.read(),
    commandId = crypto.randomUUID();
  const next = await prepareUpload(s, current, 'owner', start.id, commandId, now);
  await s.commit(next.world, next.events, commandId, commandId, next.extra, {
    action: { type: 'import-upload', upload: start.id },
    at: now,
  });
  assert.equal((await s.read()).meta.eventCount, state.events.length);
  assert.equal((await s.read()).meta.backupEpoch, w.epoch);
  assert.deepEqual((await s.export(start.id)).events, state.events);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM upload_events').first<{ n: number }>())!.n, 0);
  await assert.rejects(prepareUpload(s, await s.read(), 'owner', start.id, crypto.randomUUID(), now), /다시/);
});

test('corrupt, oversized, incomplete and stale uploads cannot change a world', async () => {
  const { s } = await setup(),
    text = new Simulation().save(),
    bytes = new TextEncoder().encode(text).length;
  await assert.rejects(
    uploadRequest(s, 'owner', { type: 'start', hash: 'a'.repeat(64), bytes: 24_000_001 }, now),
    /24MB/,
  );
  const u = (await uploadRequest(s, 'owner', { type: 'start', hash: 'a'.repeat(64), bytes }, now)) as { id: string };
  await assert.rejects(uploadRequest(s, 'owner', { type: 'validate', id: u.id }, now), /완료/);
  const chunks = splitText(text);
  for (let part = 0; part < chunks.length; part++)
    await uploadRequest(s, 'owner', { type: 'part', id: u.id, part, text: chunks[part] }, now);
  await assert.rejects(uploadRequest(s, 'owner', { type: 'validate', id: u.id }, now), /해시/);
  const before = await send(s, { type: 'reset', seed: 123 });
  await assert.rejects(uploadRequest(s, 'owner', { type: 'validate', id: u.id }, now), /교체/);
  assert.deepEqual(await s.read(), before);
});

test('confirmed replay includes pending progress, commands and approved expressions; rejects tampering', async () => {
  const { db, s } = await setup();
  await send(s, { type: 'step', ticks: 144 });
  await startReplay(db, await new WorldStore(db).read(), now);
  await send(s, { type: 'ai-mode', mode: 'mock' });
  await send(s, { type: 'play', running: true });
  const before = await s.read();
  await s.sync({ id: crypto.randomUUID(), revision: before.revision, action: { type: 'sync' } }, now + 2000);
  assert.equal((await exportReplay(db)).frames.length, 2);
  await send(s, { type: 'play', running: false }, now + 2100);
  const w = await s.read(),
    n = w.state.npcs.find((n) => n.alive && n.memories.length)!;
  assert.ok(n);
  await expressionAPI(s, 'owner', { npcId: n.id, kind: 'reflection', question: '어떤 기억이 남았어?' }, {}, now + 2200);
  const bundle = await exportReplay(db),
    result = await verifyReplay(bundle, true),
    current = await new WorldStore(db).read();
  assert.ok(result.engineChecks >= 3);
  assert.deepEqual(result.world.state, current.state);
  assert.ok(bundle.frames.some((f) => JSON.stringify(f.accepted).includes('expression')));
  const bad = structuredClone(bundle);
  (bad.frames[0].accepted as { action: unknown }).action = { type: 'reset', seed: 5 };
  await assert.rejects(verifyReplay(bad), /손상/);
  const broken = structuredClone(bundle);
  broken.frames.pop();
  await assert.rejects(verifyReplay(broken), /최종/);
});

test('positioned construction and land trading preserve money, wood, residence and inherited ownership rules', () => {
  const sim = new Simulation(),
    before = sim.snapshot(),
    v = before.civilization.settlements[0];
  let position: { x: number; y: number } | undefined;
  for (let y = 0; y < before.height && !position; y++)
    for (let x = 0; x < before.width && !position; x++) if (buildPosition(before, v.id, { x, y })) position = { x, y };
  assert.ok(position);
  const id = sim.build(v.id, 'home', position),
    w = sim.snapshot();
  assert.deepEqual(w.buildings.find((b) => b.id === id)!.position, position);
  assert.equal(w.storage.wood, before.storage.wood - 12);
  assert.throws(() => sim.build(v.id, 'home', position), /목재|부지/);
  const buyer = w.npcs.find((n) => n.alive && n.identity.age >= 18 && n.wealth >= 20)!;
  assert.ok(buyer);
  sim.tradeLand(id, buyer.id, landQuote(w, id).price);
  const after = sim.snapshot();
  assert.deepEqual(after.buildings.find((b) => b.id === id)!.ownerIds, [buyer.id]);
  assert.equal(after.npcs.find((n) => n.id === buyer.id)!.homeId, buyer.homeId);
  assert.deepEqual(balance(after), balance(before));
  assert.throws(() => sim.tradeLand(id, buyer.id, 20), /조건/);
  assert.deepEqual(Simulation.load(sim.save()).snapshot(), after);
});

test('wildlife is bounded, saves reproduce births/deaths/resource effects, and engine evidence compacts', () => {
  const sim = new Simulation();
  sim.setLLM(false);
  sim.step(144 * 10);
  const w = sim.snapshot();
  assert.ok(w.frontier);
  assert.ok(w.events.some((e) => e.data.wildlife === true));
  assert.ok(w.frontier.animals.length <= 96);
  for (const h of w.frontier.habitats)
    assert.equal(
      h.opening + h.born - h.lost,
      w.frontier.animals.filter((a) => a.settlementId === h.settlementId).length,
    );
  const resumed = Simulation.load(JSON.stringify(compactWorld(w)));
  sim.step(144);
  resumed.step(144);
  const a = sim.snapshot(),
    b = resumed.snapshot();
  assert.deepEqual(a.frontier, b.frontier);
  assert.deepEqual(balance(a), { food: 0, wood: 0, coins: 0 });
  assert.doesNotThrow(() => Simulation.load(JSON.stringify(compactWorld(b))));
});

test('expressions cannot invent citations, hide hearsay, run while off, or survive an AI generation change', async () => {
  const { s } = await setup();
  await send(s, { type: 'step', ticks: 144 });
  const w = await s.read(),
    n = w.state.npcs.find((n) => n.alive && n.memories.length)!;
  const context = expressionContext(w.state, { npcId: n.id, kind: 'dialogue', question: '안녕?' });
  assert.throws(() => validateExpression({ text: '모르는 일', evidence: ['invented'] }, context), /근거/);
  assert.throws(
    () =>
      validateExpression(
        { text: '확실한 사실이야', evidence: [context.memories[0].id] },
        { ...context, memories: [{ ...context.memories[0], hearsay: true }] },
      ),
    /소문/,
  );
  await send(s, { type: 'ai-mode', mode: 'off' });
  await assert.rejects(
    expressionAPI(s, 'owner', { npcId: n.id, kind: 'dialogue', question: '안녕?' }, {}, now),
    /모드/,
  );
  await send(s, { type: 'ai-mode', mode: 'chrome' });
  const lease = (await expressionAPI(
    s,
    'owner',
    { npcId: n.id, kind: 'reflection', question: '생각이 궁금해' },
    {},
    now,
  )) as { id: string; token: string; context: typeof context };
  await send(s, { type: 'ai-mode', mode: 'off' });
  await assert.rejects(
    expressionAPI(
      s,
      'owner',
      {
        id: lease.id,
        token: lease.token,
        output: JSON.stringify({ text: '기억하고 있어', evidence: [lease.context.memories[0].id] }),
      },
      {},
      now,
    ),
    /바뀌었습니다/,
  );
});

test('operational samples warn without database writes and participant access stays restricted', async () => {
  const { db } = await setup();
  for (let i = 0; i < 20; i++) recordRequest('/api/command', 2500, i < 2 ? 503 : 200);
  const status = await operationsStatus(db);
  assert.equal(status.p95Ms, 2500);
  assert.equal(status.databaseBytes, null);
  assert.ok(status.warnings.length >= 2);
  const env = {
    DB: db,
    SITE_OWNER_EMAIL: 'owner@example.test',
    ASSETS: { fetch: () => new Response('asset') },
  } as never;
  const call = (who: string, path: string, body?: unknown) =>
    worker.fetch(
      new Request(`https://world.test/api/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'oai-authenticated-user-id': who,
          'oai-authenticated-user-email': `${who}@example.test`,
          Origin: 'https://world.test',
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  await call('owner', 'world');
  assert.equal((await call('guest', 'operations')).status, 403);
  assert.equal((await call('guest', 'uploads', { type: 'start' })).status, 403);
  assert.equal((await call('guest', 'replay', { type: 'start' })).status, 403);
  assert.equal((await call('guest', 'expressions', {})).status, 403);
});

test('Chrome expression consumes shared budgets, commits once, and cannot expose another residents memory', async () => {
  const { db, s } = await setup();
  await send(s, { type: 'step', ticks: 144 });
  await send(s, { type: 'ai-mode', mode: 'chrome' });
  const w = await s.read(),
    n = w.state.npcs.find((n) => n.alive && n.memories.length)!;
  const request = { npcId: n.id, kind: 'dialogue', question: '무엇이 기억나?' };
  const lease = (await expressionAPI(s, 'owner', request, {}, now)) as {
    id: string;
    token: string;
    context: ReturnType<typeof expressionContext>;
  };
  await assert.rejects(expressionAPI(s, 'owner', request, {}, now + 1), /한도/);
  const output = {
    id: lease.id,
    token: lease.token,
    output: JSON.stringify({ text: '그 기억을 떠올리고 있어.', evidence: [lease.context.memories[0].id] }),
  };
  await assert.rejects(expressionAPI(s, 'guest', output, {}, now + 2), /실행권/);
  await expressionAPI(s, 'owner', output, {}, now + 3);
  const result = await s.read();
  await expressionAPI(s, 'owner', output, {}, now + 4);
  assert.equal((await s.read()).revision, result.revision);
  assert.equal(
    (await db.prepare('SELECT count(*) AS n FROM chrome_calls WHERE job=?').bind(lease.id).first<{ n: number }>())!.n,
    1,
  );
  assert.deepEqual(result.state.npcs, w.state.npcs);
  const event = result.state.events.find((e) => e.data.requestId === lease.id)!;
  assert.equal(event.data.expression, 'dialogue');
  assert.deepEqual(event.data.evidence, [lease.context.memories[0].id]);
});

test('staged upload lost validation lease recovers, expiry cleans data and failed concurrent apply preserves world', async () => {
  const { db, s } = await setup(),
    text = new Simulation().save(),
    hash = await hashText(text),
    bytes = new TextEncoder().encode(text).length;
  const u = (await uploadRequest(s, 'owner', { type: 'start', hash, bytes }, now)) as { id: string };
  for (const [part, body] of splitText(text).entries())
    await uploadRequest(s, 'owner', { type: 'part', id: u.id, part, text: body }, now);
  await db.batch([
    db.prepare("UPDATE uploads SET status='validating',validation_until=? WHERE id=?").bind(now + 100, u.id),
  ]);
  await assert.rejects(uploadRequest(s, 'owner', { type: 'validate', id: u.id }, now), /검증 중/);
  const resumed = (await uploadRequest(s, 'owner', { type: 'start', hash, bytes }, now + 101)) as { id: string };
  assert.equal(resumed.id, u.id);
  await uploadRequest(s, 'owner', { type: 'validate', id: u.id }, now + 101);
  const old = new LiveWorldStore(db),
    before = await old.read(),
    id = crypto.randomUUID(),
    staged = await prepareUpload(old, before, 'owner', u.id, id, now + 102);
  await send(s, { type: 'experiment', kind: 'food' }, now + 103);
  const changed = await s.read();
  await assert.rejects(
    old.commit(staged.world, [], id, id, staged.extra, {
      action: { type: 'import-upload', upload: u.id },
      at: now + 104,
    }),
  );
  assert.deepEqual(await s.read(), changed);
  assert.equal(
    (await db.prepare('SELECT status FROM uploads WHERE id=?').bind(u.id).first<{ status: string }>())!.status,
    'ready',
  );
  await send(s, { type: 'save' }, now + 86_400_001);
  assert.equal(await db.prepare('SELECT id FROM uploads WHERE id=?').bind(u.id).first(), null);
});

test('import rejects wildlife ID collisions and settlement population overflow', () => {
  const sim = new Simulation();
  sim.step(144);
  const state = sim.snapshot();
  state.frontier!.animals[0].id = state.npcs[0].id;
  assert.throws(() => Simulation.load(JSON.stringify(state)), /야생동물 ID/);
  const other = sim.snapshot(),
    animal = other.frontier!.animals[0];
  for (let i = 0; i < 7; i++) other.frontier!.animals.push({ ...animal, id: `wild-${other.nextId++}` });
  other.frontier!.habitats[0].born += 7;
  assert.throws(() => Simulation.load(JSON.stringify(other)), /지역 상한/);
});
