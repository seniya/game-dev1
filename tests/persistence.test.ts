import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { D1Database } from '@cloudflare/workers-types';
import { database } from './helpers/database';
import { CHECKPOINT_COMMITS, CHECKPOINT_INTERVAL_MS, Conflict, WorldStore } from '../src/server/store';
import { applyCommand, type Command, type StoredWorld } from '../src/server/world';
import { restoreChange, stateChange } from '../src/server/journal';
import { Simulation } from '../src/sim/engine';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// A fresh binding identity also exercises initialization after a Worker restart.
const restart = (db: D1Database) => new WorldStore({ prepare: db.prepare.bind(db), batch: db.batch.bind(db) } as D1Database);
async function send(store: WorldStore, action: Command['action'], at: number) {
  const current = await store.read(), command = { id: crypto.randomUUID(), revision: current.revision, action };
  const next = await applyCommand(current, command, at);
  await store.commit(next.world, next.events, command.id, command.id, [], { action, at });
  return plain(next.world);
}

test('lossless change records handle arrays, deleted optional fields, Unicode and object keys', () => {
  const pairs = [
    [{ a: [1, 2, 3], optional: true }, { a: [3], added: '한글🌱' }],
    [{ a: null }, { a: { b: [] } }],
    [JSON.parse('{"__proto__":{"x":1},"constructor":1}'), JSON.parse('{"__proto__":{"x":2},"constructor":2}')],
    [{ a: 3 }, { a: undefined }],
  ];
  for (const [before, after] of pairs) assert.deepEqual(restoreChange(plain(before), plain(stateChange(before, after))), plain(after));
  assert.equal(({} as { x?: number }).x, undefined);
  assert.throws(() => restoreChange({}, { version: 2 } as never), /버전/);
});

test('60 updates write two checkpoints and recover exactly with substantially fewer state bytes', async t => {
  let snapshotWrites = 0, writtenBytes = 0;
  const db = database((sql, values) => {
    if (sql === 'DELETE FROM snapshots WHERE epoch=?') snapshotWrites++;
    if (sql.startsWith('INSERT INTO snapshots') || sql.startsWith('INSERT INTO world_changes')) writtenBytes += Buffer.byteLength(String(values.at(-1)));
  });
  const store = new WorldStore(db), start = Date.now(); await store.init(start);
  writtenBytes = 0;
  let fullSnapshotBytes = 0, expected: StoredWorld = await store.read();
  const first = await db.prepare('SELECT body FROM snapshots ORDER BY part').all();
  for (let i = 1; i <= 60; i++) {
    expected = await send(store, { type: 'step', ticks: 1 }, start + i * 100);
    fullSnapshotBytes += Buffer.byteLength(JSON.stringify(expected.state));
    const fresh = restart(db); await fresh.init(start + i * 100);
    assert.deepEqual(await fresh.read(), expected, `restart after commit ${i}`);
    if (i === 1) assert.deepEqual(await db.prepare('SELECT body FROM snapshots ORDER BY part').all(), first, 'a normal sync never rewrites the snapshot');
  }
  assert.equal(snapshotWrites, 2);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM world_changes').first<{ n: number }>())!.n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM command_inputs').first<{ n: number }>())!.n, 60);
  assert.ok(writtenBytes < fullSnapshotBytes * .6, `${writtenBytes} vs ${fullSnapshotBytes}`);
  Simulation.load(JSON.stringify(await store.export(expected.epoch)));
  t.diagnostic(`60 one-tick updates: checkpoint writes=${snapshotWrites}, state bytes=${writtenBytes}, former full-snapshot bytes=${fullSnapshotBytes}, reduction=${(100 * (1 - writtenBytes / fullSnapshotBytes)).toFixed(1)}%`);
});

test('elapsed time and journal byte budget force checkpoints even before the commit limit', async () => {
  const db = database(), store = new WorldStore(db), start = Date.now(); await store.init(start);
  const first = await send(store, { type: 'experiment', kind: 'food' }, start + 1);
  assert.equal((await db.prepare('SELECT revision FROM world_checkpoints WHERE epoch=?').bind(first.epoch).first<{ revision: number }>())!.revision, 0);
  const next = await send(store, { type: 'sync' }, start + CHECKPOINT_INTERVAL_MS);
  assert.equal((await db.prepare('SELECT revision FROM world_checkpoints WHERE epoch=?').bind(next.epoch).first<{ revision: number }>())!.revision, next.revision);
  // Large accepted changes go directly to a checkpoint instead of leaving an unbounded replay log.
  const current = await store.read(); current.revision++;
  current.state.npcs[0].identity.name = '가🌱'.repeat(180_000);
  await store.commit(current, [], 'large internal change', crypto.randomUUID());
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM world_changes').first<{ n: number }>())!.n, 0);
  assert.deepEqual(await restart(db).read(), plain(current));
  const parts = await db.prepare('SELECT body FROM snapshots').all<{ body: string }>();
  assert.ok(parts.results.every(p => Buffer.byteLength(p.body) < 100_000));
});

test('checkpoint failure rolls back journal pruning, metadata, events and command audit together', async () => {
  const db = database(), store = new WorldStore(db), start = Date.now(); await store.init(start);
  for (let i = 1; i < CHECKPOINT_COMMITS; i++) await send(store, { type: 'experiment', kind: 'food' }, start + i);
  const before = await store.read(), exported = await store.export(before.epoch);
  const snapshots = await db.prepare('SELECT * FROM snapshots').all(), changes = await db.prepare('SELECT * FROM world_changes').all();
  const command = { id: crypto.randomUUID(), revision: before.revision, action: { type: 'step', ticks: 1 } as const };
  const next = await applyCommand(before, command, start + CHECKPOINT_COMMITS);
  await assert.rejects(store.commit(next.world, next.events, command.id, command.id, [db.prepare('INSERT INTO commit_guard VALUES(0)')], { action: command.action, at: start + CHECKPOINT_COMMITS }), Conflict);
  assert.deepEqual(await restart(db).read(), before);
  assert.deepEqual(await store.export(before.epoch), exported);
  assert.deepEqual(await db.prepare('SELECT * FROM snapshots').all(), snapshots);
  assert.deepEqual(await db.prepare('SELECT * FROM world_changes').all(), changes);
  assert.equal(await db.prepare('SELECT * FROM command_inputs WHERE id=?').bind(command.id).first(), null);
  await store.commit(next.world, next.events, command.id, command.id, [], { action: command.action, at: start + CHECKPOINT_COMMITS });
  assert.deepEqual(await restart(db).read(), plain(next.world));
});

test('reset and import preserve backups whose final state is still in the change journal', async () => {
  const db = database(), store = new WorldStore(db), start = Date.now(); await store.init(start);
  const before = await send(store, { type: 'step', ticks: 1 }, start + 1);
  const backup = await store.export(before.epoch);
  const reset = await send(store, { type: 'reset', seed: 555 }, start + 2);
  const fresh = restart(db); await fresh.init(start + 3);
  assert.equal((await fresh.read()).meta.backupEpoch, before.epoch);
  assert.deepEqual(await fresh.export(before.epoch), backup);
  assert.deepEqual(await fresh.read(), reset);
  const imported = await send(fresh, { type: 'import', save: JSON.stringify(backup) }, start + 4);
  assert.deepEqual(await fresh.export(imported.epoch), backup);
});

test('legacy full snapshots migrate without data loss; a missing journal revision fails closed', async () => {
  const db = database(), store = new WorldStore(db), start = Date.now(); await store.init(start);
  const expected = await send(store, { type: 'step', ticks: 1 }, start + 1);
  // Model the previous deployment's schema: latest snapshot at a nonzero revision, no new tables.
  await db.batch([db.prepare('DELETE FROM snapshots'), db.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind(expected.epoch, 0, JSON.stringify(expected.state)), db.prepare('DROP TABLE world_checkpoints'), db.prepare('DROP TABLE world_changes'), db.prepare('DROP TABLE command_inputs')]);
  const fresh = restart(db); await fresh.init(start + 2);
  assert.deepEqual(await fresh.read(), expected);
  await send(fresh, { type: 'step', ticks: 1 }, start + 3);
  await db.batch([db.prepare('DELETE FROM world_changes')]);
  await assert.rejects(restart(db).read(), /버전/);
});


test('concurrent writers at the checkpoint boundary commit one complete world', async () => {
  const db = database(), store = new WorldStore(db), start = Date.now(); await store.init(start);
  for (let i = 1; i < CHECKPOINT_COMMITS; i++) await send(store, { type: 'experiment', kind: 'food' }, start + i);
  const a = restart(db), b = restart(db), before = await a.read(); await b.read();
  const commands = [0, 1].map(() => ({ id: crypto.randomUUID(), revision: before.revision, action: { type: 'experiment', kind: 'food' } as const }));
  const next = await Promise.all(commands.map(c => applyCommand(before, c, start + 30)));
  const results = await Promise.allSettled([a, b].map((s, i) => s.commit(next[i].world, next[i].events, commands[i].id, commands[i].id, [], { action: commands[i].action, at: start + 30 })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const final = await restart(db).read();
  assert.equal(final.state.storage.food, before.state.storage.food + 24);
  assert.equal(final.revision, before.revision + 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM world_changes').first<{ n: number }>())!.n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM command_inputs').first<{ n: number }>())!.n, CHECKPOINT_COMMITS);
});

test('an abandoned initialization cannot strand another request sharing the D1 binding', async () => {
  const db = database(); let release!: () => void, first = true;
  const abandoned = new Promise<void>(resolve => { release = resolve; });
  const binding = {
    prepare: db.prepare.bind(db),
    async batch(statements: Parameters<D1Database['batch']>[0]) {
      if (first) { first = false; await abandoned; }
      return db.batch(statements);
    },
  } as D1Database;
  const interruptedRequest = new WorldStore(binding).init(Date.now());
  const nextRequest = new WorldStore(binding);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const initialized = await Promise.race([
      nextRequest.init(Date.now()).then(() => true),
      new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false), 1000); }),
    ]);
    assert.equal(initialized, true, 'a new request must initialize independently of abandoned I/O');
    assert.ok((await nextRequest.read()).state.npcs.length);
  } finally { clearTimeout(timeout); release(); await interruptedRequest; }
});
