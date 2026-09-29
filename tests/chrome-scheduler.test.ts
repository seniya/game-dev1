import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './helpers/database';
import { WorldStore } from '../src/server/store';
import { applyCommand, compactWorld, type StoredWorld } from '../src/server/world';
import { claimChrome, processChrome, submitChrome } from '../src/server/chrome';
import { chromeSchedule } from '../src/server/chrome-schedule';
import { chromeCandidates, chromeResponseConstraint, chromeContext, renderChromeResult, validateChromeResult, CHROME_REST_MS, CHROME_LEASE_MS, type ChromeLease } from '../src/llm/chrome-contract';
import { socialEvent } from '../src/sim/social';
import { Simulation } from '../src/sim/engine';

async function edit(store: WorldStore, change: (w: StoredWorld) => void) {
  const w = await store.read(), old = new Set(w.state.events.map(e => e.id));
  change(w); w.revision++;
  const events = w.state.events.filter(e => !old.has(e.id)); w.meta.eventCount += events.length;
  await store.commit(w, events, 'fixture edit', crypto.randomUUID());
}
function add(w: StoredWorld, npcIndex = 0, kind: 'scarcity' | 'share' | 'project' = 'scarcity', importance = 75) {
  w.state.llm.gateKeys = []; w.state.llm.dailyByNpc = {}; w.state.llm.dailyTotal = 0;
  const npc = w.state.npcs[npcIndex]; npc.needs.hunger = 80; npc.goals = [];
  return socialEvent(w.state, { kind, actorId: npc.id, importance, description: 'fixture' });
}
async function fixture(count = 1, now = 1000) {
  const store = new WorldStore(database()); await store.init(now);
  const initial = await store.read();
  const next = await applyCommand(initial, { id: crypto.randomUUID(), revision: initial.revision, action: { type: 'ai-mode', mode: 'chrome' } }, now);
  await store.commit(next.world, next.events, 'fixture mode', crypto.randomUUID());
  await edit(store, w => { for (let i = 0; i < count; i++) { w.state.tick += 144; add(w); } });
  await processChrome(store, now); return store;
}
function output(lease: ChromeLease) {
  const { context, expires: _expires, ...envelope } = lease;
  return { ...envelope, output: JSON.stringify(chromeCandidates(context)[0]) };
}

test('collect ten same-resident events once, cap related facts and preserve source history and exact settlement', async () => {
  const store = await fixture(10);
  const before = await store.read(), sources = before.state.llm.queue.map(q => q.eventId);
  assert.equal(before.state.llm.queue.length, 10);
  assert.equal(await claimChrome(store, 60_999), null);
  const lease = (await claimChrome(store, 61_000))!; assert.ok(lease);
  assert.equal(lease.context.related?.length, 2);
  const batch = await store.db.prepare('SELECT requests FROM chrome_batches WHERE job=?').bind(lease.id).first<{ requests: string }>();
  assert.equal(JSON.parse(batch!.requests).length, 10);
  const result = output(lease);
  const replay = Simulation.load(JSON.stringify(before.state)), value = validateChromeResult(result.output, lease.context);
  replay.applyInterpretation(before.state.llm.queue[0].id, renderChromeResult(value, lease.context), { model: 'chrome-built-in', evidence: value.goals.flatMap(g => g.evidence) });
  replay.closeChromeRequests(before.state.llm.queue.slice(1).map(q => q.id), 'merged', before.state.llm.queue[0].id);
  assert.equal((await submitChrome(store, result, 62_000)).state, 'applied');
  const after = await store.read();
  assert.deepEqual(after.state, compactWorld(replay.snapshot()));
  assert.equal(after.state.llm.queue.length, 0); assert.equal(after.state.llm.completed, 1);
  assert.ok(after.state.events.some(e => e.data.reason === 'merged' && (e.data.requestIds as string[]).length === 9));
  for (const source of sources) assert.ok(await store.db.prepare('SELECT id FROM events WHERE id=?').bind(source).first());
  await submitChrome(store, result, 62_001); assert.deepEqual(await store.read(), after);
  assert.doesNotThrow(() => Simulation.load(JSON.stringify(after.state)));
  assert.equal((await chromeSchedule(store.db, 62_001)).dailyCalls, 1);
});

test('new arrivals never extend the collection deadline or change a leased batch', async () => {
  const store = await fixture();
  await edit(store, w => { add(w); });
  await processChrome(store, 60_000);
  const lease = (await claimChrome(store, 61_000))!; assert.ok(lease);
  const hash = lease.hash;
  await edit(store, w => { add(w); });
  await processChrome(store, 61_100);
  assert.equal((await store.db.prepare('SELECT hash FROM chrome_jobs WHERE id=?').bind(lease.id).first<{ hash: string }>())!.hash, hash);
  await submitChrome(store, output(lease), 62_000);
  assert.equal((await store.read()).state.llm.queue.length, 1);
  // The newly chosen goal makes later duplicate work unnecessary; no extra inference.
  await edit(store, w => { w.state.npcs[0].goals.push({ id: 'remaining', kind: 'expand_farm', reason: 'already planned', createdAt: w.state.tick }); });
  assert.equal(await claimChrome(store, 122_000), null);
  assert.equal((await store.read()).state.llm.queue.length, 0);
});

test('cooldown survives restart, reset and concurrent tabs; abandoned attempts rest after expiry', async () => {
  const store = await fixture(), first = (await claimChrome(store, 61_000))!;
  await submitChrome(store, { ...output(first), output: 'not json' }, 70_000);
  await edit(store, w => { add(w, 1); }); await processChrome(store, 70_000);
  const restarted = new WorldStore(store.db); await restarted.init(80_000);
  assert.equal(await claimChrome(restarted, 129_999), null);
  const leases = await Promise.all([claimChrome(store, 130_000), claimChrome(restarted, 130_000)]);
  assert.equal(leases.filter(Boolean).length, 1);
  const current = await store.read(), reset = await applyCommand(current, { id: crypto.randomUUID(), revision: current.revision, action: { type: 'reset', seed: 8 } }, 131_000);
  await store.commit(reset.world, reset.events, 'reset', crypto.randomUUID());
  assert.equal((await chromeSchedule(store.db, 131_000)).nextAt, 130_000 + CHROME_LEASE_MS + CHROME_REST_MS);
  const orphan = await fixture(); await claimChrome(orphan, 61_000);
  assert.equal(await claimChrome(orphan, 61_000 + CHROME_LEASE_MS), null);
  assert.ok(await claimChrome(orphan, 61_000 + CHROME_LEASE_MS + CHROME_REST_MS));
});

test('rolling hourly budget spans UTC midnight and reservations include failed calls', async () => {
  const store = await fixture(1, 86_300_000);
  for (let i = 0; i < 6; i++) await store.db.batch([store.db.prepare('INSERT INTO chrome_calls VALUES(?,?,?,?,?)').bind(`old${i}`, 'old', '1970-01-01', 86_340_000 + i, 'invalid_output')]);
  assert.equal((await chromeSchedule(store.db, 86_400_001)).dailyCalls, 0);
  assert.equal((await chromeSchedule(store.db, 86_400_001)).reason, 'hourly_limit');
  assert.equal(await claimChrome(store, 86_400_001), null);
  assert.equal(await claimChrome(store, 89_939_999), null);
  assert.ok(await claimChrome(store, 89_940_000));
  assert.equal((await chromeSchedule(store.db, 89_940_000)).hourlyCalls, 6);
  // Migrated v0.5 usage can exceed the new cap; report the true count.
  const legacy = await fixture();
  for (let i = 0; i < 7; i++) await legacy.db.batch([legacy.db.prepare('INSERT INTO chrome_calls VALUES(?,?,?,?,?)').bind(`legacy${i}`, 'old', '1970-01-01', 1000 + i, 'applied')]);
  const upgraded = await chromeSchedule(legacy.db, 2000);
  assert.equal(upgraded.hourlyCalls, 7);
  assert.equal(upgraded.nextAt, 1001 + 3_600_000);

});

test('resolved scarcity and completed facilities skip inference; state changes during inference skip application', async () => {
  const store = await fixture();
  await edit(store, w => { w.state.npcs[0].needs.hunger = 20; });
  assert.equal(await claimChrome(store, 61_000), null);
  assert.equal((await store.read()).state.llm.queue.length, 0);
  assert.equal((await chromeSchedule(store.db, 61_000)).dailyCalls, 0);
  const live = await fixture(), lease = (await claimChrome(live, 61_000))!;
  await edit(live, w => { w.state.npcs[0].needs.hunger = 20; });
  assert.equal((await submitChrome(live, output(lease), 62_000)).state, 'skipped');
  assert.equal((await live.read()).state.llm.completed, 0);
  const facilities = await fixture();
  await edit(facilities, w => { w.state.llm.queue = []; add(w, 0, 'project'); for (const b of w.state.buildings) b.level = 4; });
  await processChrome(facilities, 2000);
  assert.equal((await facilities.read()).state.llm.queue.length, 0);
});

test('priorities can bypass FIFO, residents stay isolated and every generated candidate satisfies validation', async () => {
  const store = await fixture();
  await edit(store, w => { add(w, 1, 'share', 100); });
  await processChrome(store, 1000);
  const lease = (await claimChrome(store, 61_000))!;
  assert.equal(lease.context.npcId, 'npc1');
  const w = (await store.read()).state, privateId = w.llm.queue.find(q => q.npcId === 'npc0')!.eventId;
  assert.ok(!JSON.stringify(lease.context).includes(`"${privateId}"`));
  for (const q of w.llm.queue) {
    const context = chromeContext(w, q.id)!;
    const schema = chromeResponseConstraint(context);
    assert.ok(schema.enum.length);
    for (const response of schema.enum) assert.deepEqual(validateChromeResult(JSON.stringify(response), context), response);
  }
  const aged = await fixture();
  await edit(aged, world => { add(world, 1, 'share', 100); });
  await processChrome(aged, 2_400_000);
  assert.equal((await claimChrome(aged, 2_460_000))!.context.npcId, 'npc0', 'aging prevents indefinite preference for newer high-priority residents');
});

test('validation records bounded specific reasons without storing arbitrary rejected model output', async () => {
  for (const [raw, expected] of [['not json private secret', 'invalid_json'], ['{"goals":[]}', 'invalid_shape']] as const) {
    const store = await fixture(), lease = (await claimChrome(store, 61_000))!;
    const result = await submitChrome(store, { ...output(lease), output: raw }, 62_000);
    assert.equal(result.status, 422); assert.equal(result.reason, expected);
    const saved = await store.db.prepare('SELECT result FROM chrome_jobs WHERE id=?').bind(lease.id).first<{ result: string }>();
    assert.equal(JSON.parse(saved!.result).reason, expected); assert.ok(!saved!.result.includes('private secret'));
  }
  const store = await fixture(), lease = (await claimChrome(store, 61_000))!;
  const result = chromeCandidates(lease.context)[0]; result.goals[0].evidence = ['wrong'];
  assert.equal((await submitChrome(store, { ...output(lease), output: JSON.stringify(result) }, 62_000)).reason, 'missing_trigger');
});
