import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import worker from '../src/server/worker';
import { Simulation } from '../src/sim/engine';
import { applyCommand, compactWorld, initialWorld, type Command, type WorldView } from '../src/server/world';
import { WorldStore } from '../src/server/store';

// Executes the actual D1 SQL with SQLite transactions, including rollback of a failed CAS.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  class Statement {
    values: (string | number)[] = [];
    constructor(readonly sql: string) {}
    bind(...values: (string | number)[]) { this.values = values; return this; }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async all() { return { results: sqlite.prepare(this.sql).all(...this.values), success: true, meta: {} }; }
  }
  const db = {
    prepare(sql: string) { return new Statement(sql); },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(s => ({ results: sqlite.prepare(s.sql).all(...s.values), success: true, meta: {} }));
        sqlite.exec('COMMIT'); return result;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  } as unknown as D1Database;
  return db;
}
function harness() {
  const db = database(), env = { DB: db, ASSETS: { fetch: () => new Response('asset') } } as never;
  const request = (path: string, data?: unknown, origin = 'https://world.test') => worker.fetch(new Request(`https://world.test/api/${path}`, data === undefined ? {} : { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), env);
  const get = async () => (await (await request('world')).json()) as WorldView;
  const send = async (action: Command['action'], revision: number, id = crypto.randomUUID()) => request('command', { id, revision, action });
  return { db, request, get, send };
}
test('server clock is bounded, paused by default and offline progression is opt-in', async () => {
  let w = initialWorld(1000);
  const cmd = (action: Command['action']): Command => ({ id: crypto.randomUUID(), revision: w.revision, action });
  w = (await applyCommand(w, cmd({ type: 'sync' }), 1_000_000)).world;
  assert.equal(w.state.tick, 36);
  w = (await applyCommand(w, cmd({ type: 'play', running: true }), 1_000_000)).world;
  w = (await applyCommand(w, cmd({ type: 'sync' }), 2_000_000)).world;
  assert.equal(w.state.tick, 36);
  w = (await applyCommand(w, cmd({ type: 'offline', enabled: true }), 2_000_000)).world;
  w = (await applyCommand(w, cmd({ type: 'sync' }), 3_000_000)).world;
  assert.equal(w.state.tick, 180); assert.equal(w.meta.catchupTicks, 144); assert.ok(w.meta.skippedTicks > 0);
  w = (await applyCommand(w, cmd({ type: 'sync' }), 3_000_000)).world;
  assert.equal(w.state.tick, 180);
});
test('compacted checkpoints reproduce the unabridged engine and preserve reference validation', () => {
  const baseline = new Simulation(42); baseline.setLLM(false);
  let compact = Simulation.load(baseline.save());
  for (let day = 0; day < 30; day++) {
    baseline.step(144); compact.step(144);
    compact = Simulation.load(JSON.stringify(compactWorld(compact.snapshot())));
  }
  const a = baseline.snapshot(), b = compact.snapshot();
  assert.ok(b.events.length < a.events.length);
  assert.deepEqual(JSON.parse(JSON.stringify({ ...a, events: [] })), JSON.parse(JSON.stringify({ ...b, events: [] })));
});
test('idempotent commands, stale revisions and concurrent devices cannot duplicate resources', async () => {
  const h = harness(), initial = await h.get(), id = crypto.randomUUID();
  const first = await h.send({ type: 'experiment', kind: 'food' }, initial.revision, id); assert.equal(first.status, 200);
  const retry = await h.send({ type: 'experiment', kind: 'food' }, initial.revision, id); assert.equal(retry.status, 200);
  assert.equal((await h.get()).state.storage.food, initial.state.storage.food + 24);
  assert.equal((await h.send({ type: 'step', ticks: 1 }, initial.revision)).status, 409);
  assert.equal((await h.send({ type: 'step', ticks: 1 }, initial.revision, id)).status, 409);
  const current = await h.get();
  const results = await Promise.all([h.send({ type: 'experiment', kind: 'food' }, current.revision), h.send({ type: 'experiment', kind: 'food' }, current.revision)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await h.get()).state.storage.food, initial.state.storage.food + 48);
});
test('restart, reset backup, indexed archive pagination and export preserve a valid world', async () => {
  const h = harness(); let w = await h.get();
  assert.equal((await h.send({ type: 'step', ticks: 144 }, w.revision)).status, 200);
  w = await h.get(); assert.ok(w.meta.eventCount > 100); assert.ok(w.state.events.length <= 100);
  const store = new WorldStore(h.db); await store.init(Date.now());
  assert.equal((await store.read()).state.tick, w.state.tick);
  const full = await (await h.request('export')).json(); Simulation.load(JSON.stringify(full));
  const page = await (await h.request('events?filter=all')).json() as { events: { id: string }[]; next: number };
  assert.equal(page.events.length, 40); assert.ok(page.next);
  const older = await (await h.request(`events?before=${page.next}`)).json() as typeof page;
  assert.ok(older.events.every(e => !page.events.some(p => p.id === e.id)));
  const life = await (await h.request(`events?npc=${w.state.npcs[0].id}&filter=life`)).json() as typeof page;
  assert.ok(life.events.length);
  assert.equal((await h.send({ type: 'reset', seed: 123 }, w.revision)).status, 200);
  const backup = await (await h.request('export?backup=1')).json();
  assert.deepEqual(backup, full);
  const reset = await h.get(); assert.equal(reset.state.seed, 123);
  assert.equal((await h.send({ type: 'import', save: JSON.stringify(backup) }, reset.revision)).status, 200);
  assert.deepEqual(await (await h.request('export')).json(), full);
});
test('cross-origin commands and malformed imports fail without changing persisted state', async () => {
  const h = harness(), w = await h.get();
  assert.equal((await h.request('command', { id: crypto.randomUUID(), revision: 0, action: { type: 'step', ticks: 1 } }, 'https://other.test')).status, 403);
  assert.equal((await h.send({ type: 'import', save: '{"version":999}' }, 0)).status, 400);
  assert.deepEqual(await h.get(), w);
});
test('archive cursors preserve imported event order independently of event ID spelling', async () => {
  const h = harness(), initial = await h.get();
  const state = new Simulation(7).snapshot(), first = state.events[0];
  state.events = Array.from({ length: 85 }, (_, i) => ({ ...first, id: `custom-record-${String(85 - i).padStart(3, '0')}`, description: `관측 ${i}` }));
  assert.equal((await h.send({ type: 'import', save: JSON.stringify(state) }, initial.revision)).status, 200);
  const exported = await (await h.request('export')).json(); assert.deepEqual(exported, JSON.parse(JSON.stringify(state)));
  const one = await (await h.request('events')).json() as { events: { description: string }[]; next: number };
  assert.equal(one.events[0].description, '관측 84');
  const two = await (await h.request(`events?before=${one.next}`)).json() as typeof one;
  assert.equal(two.events[0].description, '관측 44');
});
