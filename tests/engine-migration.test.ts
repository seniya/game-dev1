import test from 'node:test';
import assert from 'node:assert/strict';
import { database } from './helpers/database';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { compactWorld, type StoredWorld } from '../src/server/world';
import { LegacySimulation, LegacyCoordinator, LegacyMock } from '../src/server/legacy-v021';
import { Simulation } from '../src/sim/engine';
import type { WorldState } from '../src/sim/types';
const OLD = '5809ccf28f7e3e9d2f897f7a23c03ecfe41c0de21b98432a7776949f4ac4d2f2';
async function pending(corrupt = false, mode: 'off' | 'mock' | 'chrome' = 'off') {
  const db = database(),
    store = new WorldStore(db);
  await store.init(Date.now());
  const saved = await store.read();
  const sim = LegacySimulation.load(JSON.stringify(saved.state));
  sim.setLLM(mode !== 'off');
  saved.state = sim.snapshot() as unknown as WorldState;
  saved.meta.aiMode = mode;
  await db.batch([
    db.prepare('DELETE FROM snapshots WHERE epoch=?').bind(saved.epoch),
    ...store.snapshotStatements(saved.epoch, saved.state),
    db.prepare('UPDATE world SET meta=? WHERE id=1').bind(JSON.stringify(saved.meta)),
  ]);
  const coordinator = new LegacyCoordinator(sim, new LegacyMock());
  for (let i = 0; i < 160; i++) {
    sim.step(1, undefined);
    if (mode === 'mock' && sim.pending) await coordinator.drain();
  }
  const state = sim.snapshot() as unknown as WorldState,
    ids = new Set(saved.state.events.map((e) => e.id)),
    events = state.events.filter((e) => !ids.has(e.id));
  const meta = {
    ...saved.meta,
    eventCount: saved.meta.eventCount + events.length + (corrupt ? 1 : 0),
    running: true,
    lastSeen: Date.now(),
    clock: Date.now(),
  };
  await db.batch([
    db
      .prepare('INSERT INTO world_live VALUES(1,?,1,?)')
      .bind(
        saved.revision,
        JSON.stringify({
          build: OLD,
          epoch: saved.epoch,
          ticks: 160,
          meta,
          started: Date.now(),
          id: crypto.randomUUID(),
        }),
      ),
  ]);
  return { db, saved, state, events, meta };
}
test('exact published old engine confirms pending events once before applying new rules, across concurrent readers', async () => {
  const { db, saved, state, events } = await pending();
  const [a, b] = await Promise.all([new LiveWorldStore(db, 'v022').read(), new LiveWorldStore(db, 'v022').read()]);
  assert.equal(a.revision, saved.revision + 1);
  assert.equal(a.revision, b.revision);
  assert.deepEqual(a.state, JSON.parse(JSON.stringify(compactWorld(state))));
  assert.equal(a.state.frontier, undefined);
  assert.equal(a.meta.eventCount, saved.meta.eventCount + events.length);
  assert.equal(a.meta.running, true);
  assert.equal(a.meta.aiMode, 'off');
  assert.equal(await db.prepare('SELECT * FROM world_live').first(), null);
  assert.equal(
    (await db.prepare('SELECT count(*) AS n FROM events WHERE epoch=?').bind(a.epoch).first<{ n: number }>())!.n,
    a.meta.eventCount,
  );
  const reread = await new LiveWorldStore(db, 'v022').read();
  assert.deepEqual(reread, a);
  const next = Simulation.load(JSON.stringify(a.state));
  next.step(144);
  assert.ok(next.snapshot().frontier);
});
test('old-engine replay mismatch preserves checkpoint and clock instead of committing invented progress', async () => {
  const { db, saved } = await pending(true);
  const clock = await db.prepare('SELECT * FROM world_live').first();
  await assert.rejects(new LiveWorldStore(db, 'v022').read(), /사건 수/);
  assert.deepEqual(await new WorldStore(db).read(), saved);
  assert.deepEqual(await db.prepare('SELECT * FROM world_live').first(), clock);
});

for (const mode of ['mock', 'chrome'] as const)
  test(`previous ${mode} progress keeps its exact accepted decisions and events`, async () => {
    const { db, state } = await pending(false, mode);
    const recovered = await new LiveWorldStore(db, 'v022').read();
    assert.deepEqual(recovered.state, JSON.parse(JSON.stringify(compactWorld(state))));
    assert.equal(recovered.meta.aiMode, mode);
  });
