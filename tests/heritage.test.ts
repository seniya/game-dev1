import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Simulation } from '../src/sim/engine';
import { ecologyDay, societyDay, cropMultiplier, accord, setCouncil } from '../src/sim/heritage';
import { balance, createEconomy, holdings } from '../src/sim/economy';
import { city, urbanBalance, startFreight, advanceFreight } from '../src/sim/urban';
import { compactWorld, applyCommand } from '../src/server/world';
import { WorldStore } from '../src/server/store';
import { streamWorld, readHistory } from '../src/server/history';
import { historyContext, validateHistorySelection, familyTree } from '../src/sim/history';
import { appendEvent } from '../src/sim/social';
import { database } from './helpers/database';
import { processAI } from '../src/server/ai';
import worker from '../src/server/worker';
const valid = (w: unknown) => Simulation.load(JSON.stringify(w));
const cmd = (revision: number, action: Parameters<typeof applyCommand>[1]['action']) => ({ id: randomUUID(), revision, action });

test('v4 migration preserves owned resources and events; new ecology does not invent livestock or past history', () => {
  const old: any = new Simulation().snapshot(); old.version = 4; delete old.heritage;
  const w = valid(old).snapshot(); assert.equal(w.version, 6); assert.deepEqual(holdings(w), holdings(old)); assert.deepEqual(w.events, old.events);
  assert.equal(w.heritage.habitats[0].livestock, 0); assert.equal(w.heritage.since, w.tick);
});
test('seasonal harvest depletion, fallow recovery, feed and livestock output obey all stock ledgers', () => {
  const w = new Simulation().snapshot(), h = w.heritage.habitats[0], c = city(w, 'v0');
  c.goods.grain = 20; w.urban.ledger.opening.grain = 20; w.tick = 144; w.weather = 'rain';
  h.harvest = 1000; const before = h.soil; ecologyDay(w); assert.ok(h.soil < before); assert.ok(c.goods.grain < 20);
  const depleted = h.soil; ecologyDay(w); assert.ok(h.soil > depleted); assert.equal(h.harvest, 0);
  const spring = cropMultiplier(w, 'v0'); w.tick = 9 * 144; assert.ok(cropMultiplier(w, 'v0') < spring);
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0)); valid(w);
});
test('livestock loss under drought and lack of caretakers is accounted and cannot become negative', () => {
  const w = new Simulation().snapshot(), h = w.heritage.habitats[0]; h.pasture = 0; w.weather = 'drought';
  for (let i = 0; i < 5; i++) { w.tick += 144; ecologyDay(w); }
  assert.equal(h.livestock, 0); assert.equal(h.lost, 2); assert.equal(h.opening + h.born - h.lost, h.livestock); valid(w);
});
test('resident assemblies use health needs, preserve currency and record policy causes; opt-out holds manual policy', () => {
  const w = new Simulation().snapshot(); w.tick = 432;
  for (const n of w.npcs) w.urban.citizens[n.id].disease = 8;
  const before = holdings(w); societyDay(w); assert.equal(city(w, 'v0').priority, 'clinic');
  const policy = w.events.find(e => e.id === city(w, 'v0').policyEventId)!;
  assert.equal(policy.causeId, w.heritage.councils[0].lastEventId); assert.deepEqual(holdings(w), before);
  setCouncil(w, 'v0', false); city(w, 'v0').priority = 'road'; w.tick += 432; societyDay(w); assert.equal(city(w, 'v0').priority, 'road'); valid(compactWorld(w));
});
test('scarcity creates resource disputes, stops new freight, and does not confiscate goods already in transit', () => {
  const w = new Simulation(42, 72).snapshot(), r = accord(w, 'v0', 'v1')!;
  const a = city(w, 'v0'); a.goods.grain = 30; w.urban.ledger.opening.grain = 30;
  assert.equal(startFreight(w, 'v0', 'v1', 'grain'), true); const money = holdings(w).coins;
  r.status = 'dispute'; assert.equal(startFreight(w, 'v0', 'v1', 'stone'), false);
  while (w.urban.freight.length) { w.tick++; advanceFreight(w); }
  assert.equal(holdings(w).coins, money); assert.equal(r.deliveries, 1); assert.ok(r.deliveryEventId); valid(w);
  for (const n of w.npcs) n.inventory.food = 0;
  w.storage.food = 0; w.market.food = 0; for (const v of w.civilization.settlements) { v.storage.food = 0; v.market.food = 0; }
  w.economy = createEconomy(w); r.tension = 55; w.tick = 432; societyDay(w); assert.equal(r.status, 'dispute'); assert.ok(r.lastEventId); valid(w);
});
test('cooperation emerges from deliveries and reduces funded transport fees', () => {
  const w = new Simulation(42, 72).snapshot(), r = accord(w, 'v0', 'v1')!; r.deliveries = 3;
  r.deliveryEventId = appendEvent(w, { kind: 'freight', importance: 45, description: '실제 인도 검증용 기록' }).id;
  w.tick = 432; societyDay(w); assert.equal(r.status, 'cooperation');
  city(w, 'v0').goods.ore = 20; w.urban.ledger.opening.ore = 20;
  const neutral = structuredClone(w); accord(neutral, 'v0', 'v1')!.status = 'neutral';
  assert.ok(startFreight(w, 'v0', 'v1', 'ore')); assert.ok(startFreight(neutral, 'v0', 'v1', 'ore'));
  assert.ok(w.urban.freight[0].fee <= neutral.urban.freight[0].fee); assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); valid(w);
});
test('ecology, councils and diplomacy are deterministic across detail and checkpoint continuation', () => {
  let sim = new Simulation(17, 72); sim.setLLM(false); sim.step(432);
  const full = sim.snapshot(), restored = valid(compactWorld(full));
  sim.step(144); restored.step(144); assert.deepEqual(sim.snapshot().heritage, restored.snapshot().heritage); assert.deepEqual(sim.snapshot().npcs, restored.snapshot().npcs); valid(compactWorld(restored.snapshot()));
});
test('tampered livestock, duplicated councils and missing diplomatic evidence are rejected', () => {
  for (const mutate of [(w: any) => w.heritage.habitats[0].livestock++, (w: any) => w.heritage.councils.push(w.heritage.councils[0]), (w: any) => w.heritage.accords[0].lastEventId = 'missing']) {
    const w = new Simulation(42, 72).snapshot(); mutate(w); assert.throws(() => valid(w));
  }
});
test('history selection rejects invented IDs, repeated evidence, extra text and commands', () => {
  const w = new Simulation().snapshot(); ecologyDay(w); const c = historyContext(w.events, 'ecology'), id = c.cards[0].id;
  assert.deepEqual(validateHistorySelection({ evidence: [id] }, c), [id]);
  for (const value of [{ evidence: ['invented'] }, { evidence: [id, id] }, { evidence: [id], text: 'fabrication' }, { evidence: [], command: 'change wealth' }]) assert.equal(validateHistorySelection(value, c), null);
  assert.equal(familyTree(w, w.npcs[0].id)[0].id, w.npcs[0].id);
});
test('stream export pins committed state and watermark across a concurrent reset without loading the full archive', async () => {
  const db = database(), store = new WorldStore(db); await store.init(0); const original = await store.read();
  const response = streamWorld(store, original), reader = response.body!.getReader(), first = await reader.read();
  const result = await applyCommand(original, cmd(original.revision, { type: 'reset', seed: 7 }), 0);
  await store.commit(result.world, result.events, 'reset', randomUUID());
  let body = new TextDecoder().decode(first.value); while (true) { const { done, value } = await reader.read(); if (done) break; body += new TextDecoder().decode(value); }
  const restored = valid(JSON.parse(body)).snapshot(); assert.equal(restored.seed, original.state.seed); assert.equal(restored.events.length, original.meta.eventCount);
  assert.equal(response.headers.get('Content-Disposition')?.startsWith('attachment'), true);
});
test('history archive paginates old records by topic, city, person and dates without inferring hidden causes', async () => {
  const db = database(), store = new WorldStore(db); await store.init(0); let w = await store.read();
  const events = Array.from({ length: 85 }, (_, i) => appendEvent(w.state, { kind: 'inheritance', actorId: 'npc0', importance: 55, description: `재산 이전 ${i}`, data: { settlementId: 'v0', amount: i } }));
  w = { ...w, revision: w.revision + 1, meta: { ...w.meta, eventCount: w.meta.eventCount + events.length } }; await store.commit(w, events, 'history', randomUUID());
  const page = await readHistory(store, w, new URLSearchParams({ topic: 'economy', settlement: 'v0', npc: 'npc0', from: '0' }));
  assert.equal(page.events.length, 40); assert.ok(page.next); const next = await readHistory(store, w, new URLSearchParams({ topic: 'economy', before: String(page.next) }));
  assert.equal(next.events.length, 40); assert.equal(new Set([...page.events, ...next.events].map(e => e.id)).size, 80);
  assert.ok(page.events.every(e => !e.causeId)); await assert.rejects(readHistory(store, w, new URLSearchParams({ topic: 'invalid' })));
});
test('stream export rejects incomplete archives instead of returning a valid-looking truncated save', async () => {
  const db = database(), store = new WorldStore(db); await store.init(0); const w = await store.read();
  await db.batch([db.prepare('DELETE FROM events WHERE epoch=?').bind(w.epoch)]);
  await assert.rejects(streamWorld(store, w).text());
});
test('history model uses shared audit/budget, validates evidence, and never calls an API in off or Chrome mode', async () => {
  const db = database(), store = new WorldStore(db); await store.init(0); let world = await store.read();
  const sim = valid(world.state); sim.step(144); const state = sim.snapshot(), events = state.events.filter(e => !world.state.events.some(x => x.id === e.id));
  world = { ...world, revision: 1, state: compactWorld(state), meta: { ...world.meta, eventCount: world.meta.eventCount + events.length, aiMode: 'remote', aiGeneration: 'test' } }; await store.commit(world, events, 'seed', randomUUID());
  const changed = await applyCommand(world, cmd(1, { type: 'history-ai', topic: 'ecology' }), 0); await store.commit(changed.world, changed.events, 'request', randomUUID());
  let calls = 0; const transport = async (_input: unknown, init?: RequestInit) => {
    calls++; const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ evidence: [context.cards[0].id] }) } }] });
  };
  const env = { LLM_BASE_URL: 'https://example.test/v1', LLM_MODEL: 'fixture', LLM_DAILY_LIMIT: '1' };
  await processAI(store, env, transport as typeof fetch, Date.now());
  const applied = await store.read(); assert.equal(calls, 1); assert.ok(applied.state.events.some(e => e.data.history === true)); assert.equal(applied.meta.history, undefined);
  assert.equal((await db.prepare("SELECT status FROM ai_jobs WHERE kind='history'").first<{ status: string }>())!.status, 'applied');
  for (const mode of ['off', 'chrome'] as const) {
    const before = await store.read(), result = await applyCommand(before, cmd(before.revision, { type: 'ai-mode', mode }), Date.now()); await store.commit(result.world, result.events, mode, randomUUID());
    await processAI(store, env, transport as typeof fetch); assert.equal(calls, 1);
    await assert.rejects(applyCommand(result.world, cmd(result.world.revision, { type: 'history-ai', topic: 'ecology' }), Date.now()));
  }
});
test('v4 checkpoints with queued deltas migrate before the next commit and restore identically', async () => {
  const { stateChange } = await import('../src/server/journal');
  const db = database(), store = new WorldStore(db); await store.init(0); const initial = await store.read();
  const legacy: any = structuredClone(initial.state); legacy.version = 4; delete legacy.heritage;
  const after = structuredClone(legacy); after.tick++;
  await db.batch([db.prepare('DELETE FROM snapshots'), db.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind(initial.epoch, 0, JSON.stringify(legacy)), db.prepare('UPDATE world SET revision=1 WHERE id=1'), db.prepare('UPDATE world_checkpoints SET head_revision=1'), db.prepare('INSERT INTO world_changes VALUES(?,?,?,?)').bind(initial.epoch, 1, 0, JSON.stringify(stateChange(legacy, after)))]);
  const fresh = new WorldStore(db), migrated = await fresh.read(); assert.equal(migrated.state.version, 6);
  const next = await applyCommand(migrated, cmd(migrated.revision, { type: 'council', settlementId: 'v0', enabled: false }), 0); await fresh.commit(next.world, next.events, 'migration', randomUUID());
  assert.deepEqual(await new WorldStore(db).read(), next.world); assert.equal((await db.prepare('SELECT count(*) AS n FROM world_changes').first<{ n: number }>())!.n, 0);
});

test('question-based recollection sends only the speaker’s relevant memories and rejects unsupported topics', async () => {
  const { recollections } = await import('../src/sim/recollection'); const { dialogueInput } = await import('../src/server/model');
  const { commandSchema } = await import('../src/server/world');
  const w = new Simulation().snapshot(), speaker = w.npcs[0], listener = w.npcs[1];
  const memory = { id: 'm10000', type: 'social' as const, importance: 70, emotionalImpact: 40, createdAt: 36, relatedNpcIds: [listener.id], relatedLocationIds: [], sourceEventId: 'e10001', repetitions: 1, description: '이웃에게 식량을 나눴다.' };
  speaker.memories = [memory, { ...memory, id: 'm10002', sourceEventId: 'e10003', description: '자녀가 태어났다.' }];
  listener.memories = [{ ...memory, sourceEventId: 'private-event', description: '사적으로 숨긴 사건' }];
  const memories = recollections(speaker.memories, listener.id, 'support'); assert.equal(memories.length, 1);
  const input = JSON.stringify(dialogueInput({ speaker, listener, memories, topic: 'support' })); assert.ok(!input.includes('private-event')); assert.ok(!input.includes('자녀가'));
  assert.equal(recollections(speaker.memories, listener.id, 'family').length, 1);
  assert.equal(commandSchema.safeParse(cmd(0, { type: 'dialogue', speakerId: speaker.id, listenerId: listener.id, topic: 'support' })).success, true);
  assert.equal(commandSchema.safeParse({ id: randomUUID(), revision: 0, action: { type: 'dialogue', speakerId: speaker.id, listenerId: listener.id, topic: 'hidden_secrets' } }).success, false);
});

test('invalid or late history model results cannot survive rejection or an explicit mode change', async () => {
  for (const scenario of ['invalid', 'stale'] as const) {
    const db = database(), store = new WorldStore(db); await store.init(0); const original = await store.read();
    const state = structuredClone(original.state); ecologyDay(state); const events = state.events.slice(original.state.events.length);
    const ready = { ...original, state, revision: 1, meta: { ...original.meta, eventCount: original.meta.eventCount + events.length, aiMode: 'remote' as const, aiGeneration: 'history-test', history: { id: randomUUID(), topic: 'ecology' as const } } };
    await store.commit(ready, events, 'prepare', randomUUID());
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>(r => { entered = r; }), hold = new Promise<void>(r => { release = r; });
    const transport: typeof fetch = async (_input, init) => {
      const context = JSON.parse(JSON.parse(String(init?.body)).messages[1].content); entered(); if (scenario === 'stale') await hold;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(scenario === 'invalid' ? { evidence: ['unrecorded'] } : { evidence: [context.cards[0].id] }) } }] });
    };
    const pending = processAI(store, { LLM_BASE_URL: 'https://example.test/v1', LLM_MODEL: 'fixture' }, transport);
    await started;
    if (scenario === 'stale') { const current = await store.read(), result = await applyCommand(current, cmd(current.revision, { type: 'ai-mode', mode: 'off' }), Date.now()); await store.commit(result.world, result.events, 'off', randomUUID()); release(); }
    await pending; const world = await store.read(); assert.ok(!world.state.events.some(e => e.data.history)); assert.equal(world.meta.history, undefined);
    const job = await db.prepare("SELECT status,error FROM ai_jobs WHERE kind='history'").first<{ status: string; error: string }>();
    assert.equal(job!.status, scenario === 'stale' ? 'stale' : 'failed'); if (scenario === 'invalid') assert.equal(job!.error, 'invalid_history_evidence');
  }
});
