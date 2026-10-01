import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { D1Database } from '@cloudflare/workers-types';
import { database } from './helpers/database';
import { WorldStore, Conflict } from '../src/server/store';
import { AUTOSAVE_MS, LiveWorldStore } from '../src/server/live-store';
import { applyCommand, type Command } from '../src/server/world';
import { readObserver } from '../src/server/observation';
import { streamWorld } from '../src/server/history';
import { Simulation } from '../src/sim/engine';
const same = (a: unknown, b: unknown, message?: string) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), message);
const fresh = (db: D1Database, build?: string) => new LiveWorldStore({ prepare: db.prepare.bind(db), batch: db.batch.bind(db) } as D1Database, build);
async function command(s: LiveWorldStore, action: Command['action'], now: number) {
  const current = await s.read(), c = { id: crypto.randomUUID(), revision: current.revision, action };
  if (action.type === 'sync') return (await s.sync(c, now)).world;
  const next = await applyCommand(current, c, now);
  await s.commit(next.world, next.events, c.id, c.id, [], { action, at: now });
  return next.world;
}
async function setup(build?: string) {
  const db = database(), s = new LiveWorldStore(db, build), now = 1_800_000_000_000;
  await s.init(now); await command(s, { type: 'ai-mode', mode: 'off' }, now);
  await command(s, { type: 'play', running: true }, now);
  return { db, s, now };
}

test('ordinary sync writes only one clock row; cold workers reproduce live state and pending archive', async () => {
  const { db, s, now } = await setup();
  const original = await new WorldStore(db).read();
  const originalRows = await db.prepare('SELECT * FROM snapshots').all();
  let world = original;
  for (let i = 1; i <= 15; i++) {
    world = await command(s, { type: 'sync' }, now + i * 2000);
    same(await fresh(db).read(), world, `cold replay ${i}`);
  }
  assert.ok(world.state.tick > original.state.tick);
  same((await new WorldStore(db).read()).state, original.state);
  same(await db.prepare('SELECT * FROM snapshots').all(), originalRows);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM world_live').first<{ n: number }>())!.n, 1);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM commands').first<{ n: number }>())!.n, 2);
  const reader = fresh(db), live = await reader.read();
  const full = await reader.export(live.epoch);
  assert.equal(full.events.length, live.meta.eventCount);
  Simulation.load(JSON.stringify(full));
  const stream = await streamWorld(reader, live).json() as typeof full;
  same(stream, full);
  const observed = await readObserver(reader, live, new URLSearchParams({ epoch: live.epoch, from: '0' }));
  assert.ok(observed.total > 0);
  const newest = full.events.at(-1)!;
  assert.equal((await reader.archive().prepare('SELECT body FROM events WHERE epoch=? AND id=?').bind(live.epoch, newest.id).first<{ body: string }>())!.body, JSON.stringify(newest));
});

test('five minute autosave and immediate user save archive all pending events exactly once', async () => {
  const { db, s, now } = await setup();
  let saves = 0, beforeRevision = (await s.read()).revision;
  for (let i = 1; i <= 150; i++) {
    const world = await command(s, { type: 'sync' }, now + i * 2000);
    if (world.revision > beforeRevision) { saves++; beforeRevision = world.revision; }
  }
  assert.ok(saves >= 1 && saves <= 3, `bounded safety saves: ${saves}`);
  let current = await s.read();
  assert.ok(now + AUTOSAVE_MS - (current.meta.savedAt ?? 0) < AUTOSAVE_MS);
  current = await command(s, { type: 'play', running: false }, now + AUTOSAVE_MS + 1);
  assert.equal(current.live, undefined);
  same(await new WorldStore(db).read(), current);
  const full = await new WorldStore(db).export(current.epoch);
  assert.equal(full.events.length, current.meta.eventCount);
  assert.equal(new Set(full.events.map(e => e.id)).size, full.events.length);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM command_inputs').first<{ n: number }>())!.n, 3);
});

test('concurrent live clocks and checkpoints fail atomically instead of overwriting progress', async () => {
  const { db, s, now } = await setup();
  const stale = fresh(db), before = await stale.read();
  const action = { type: 'experiment', kind: 'food' } as const;
  const c = { id: crypto.randomUUID(), revision: before.revision, action };
  const next = await applyCommand(before, c, now + 2000);
  await command(s, { type: 'sync' }, now + 2000);
  const latest = await fresh(db).read();
  await assert.rejects(stale.commit(next.world, next.events, c.id, c.id, [], { action, at: now + 2000 }), Conflict);
  same(await fresh(db).read(), latest);
  assert.equal(await db.prepare('SELECT id FROM commands WHERE id=?').bind(c.id).first(), null);
  const id = crypto.randomUUID();
  const result = await Promise.allSettled([fresh(db), fresh(db)].map(store => store.sync({ id, revision: latest.revision, action: { type: 'sync' } }, now + 4000)));
  assert.ok(result.some(r => r.status === 'fulfilled'));
  const head = await fresh(db).read();
  assert.equal(head.state.tick, latest.state.tick + 3);
});

test('reset saves live predecessor, retains only immediate backup and never loses current archive', async () => {
  const { db, s, now } = await setup();
  await command(s, { type: 'sync' }, now + 2000);
  const old = await s.read(), full = await s.export(old.epoch);
  const reset = await command(s, { type: 'reset', seed: 123 }, now + 2001);
  same(await s.export(reset.meta.backupEpoch!), full);
  const second = await command(s, { type: 'reset', seed: 7 }, now + 2002);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM snapshots WHERE epoch=?').bind(old.epoch).first<{ n: number }>())!.n, 0);
  assert.equal((await s.export(second.epoch)).events.length, second.meta.eventCount);
  assert.equal((await s.export(second.meta.backupEpoch!)).seed, 123);
});

test('new engine build discards only unsaved progress, never replays with different rules', async () => {
  const { db, s, now } = await setup('old-build');
  const saved = await new WorldStore(db).read();
  await command(s, { type: 'sync' }, now + 2000);
  const upgraded = fresh(db, 'new-build');
  const restored = await upgraded.read();
  same(restored.state, saved.state);
  assert.equal(restored.meta.aiGeneration, 'new-build', 'leases citing discarded events must be invalidated');
  const next = await command(upgraded, { type: 'sync' }, now + 4000);
  assert.ok(next.state.tick > saved.state.tick);
  assert.equal(next.live, undefined, 'the new generation is checkpointed on the first sync');
  same(await fresh(db, 'new-build').read(), next);
});

test('retention removes expired operational logs while retaining active AI and recent budgets', async () => {
  const { db, s, now } = await setup();
  await db.batch([
    db.prepare("INSERT INTO commands VALUES('old','hash',0)"),
    db.prepare("INSERT INTO command_inputs VALUES('old','{\"type\":\"save\"}',?)").bind(now - 31 * 86400000),
    db.prepare("INSERT INTO chrome_calls VALUES('old-call','job','old',?,'done')").bind(now - 8 * 86400000),
    db.prepare("INSERT INTO chrome_calls VALUES('today','job','today',?,'done')").bind(now),
    db.prepare("INSERT INTO chrome_jobs(id,epoch,generation,request,context,hash,status,created,updated) VALUES('pending','initial','g','q','{}','hash','pending',0,0)"),
  ]);
  await command(s, { type: 'save' }, now + 1);
  assert.equal(await db.prepare("SELECT * FROM commands WHERE id='old'").first(), null);
  assert.equal(await db.prepare("SELECT * FROM chrome_calls WHERE token='old-call'").first(), null);
  assert.ok(await db.prepare("SELECT * FROM chrome_calls WHERE token='today'").first());
  assert.ok(await db.prepare("SELECT * FROM chrome_jobs WHERE id='pending'").first());
});

for (const mode of ['mock', 'chrome'] as const) test(`cold replay agrees after long ${mode} progress and an AI-style commit flushes pending events`, async () => {
  const { db, s, now } = await setup();
  await command(s, { type: 'ai-mode', mode }, now);
  let live = await s.read();
  for (let i = 1; i <= 120; i++) {
    live = await command(s, { type: 'sync' }, now + i * 2000);
    if (i % 30 === 0) same(await fresh(db).read(), live);
  }
  const actor = fresh(db), current = await actor.read();
  await actor.commit({ ...current, revision: current.revision + 1 }, [], 'ai:test', 'ai:test');
  const saved = await new WorldStore(db).read();
  same(saved.state, live.state);
  assert.equal((await actor.export(saved.epoch)).events.length, live.meta.eventCount);
});
