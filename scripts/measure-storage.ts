// Local, in-memory comparison. Never connects to a deployed DB.
import { readFileSync, writeFileSync } from 'node:fs';
import { database } from '../tests/helpers/database';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { applyCommand, type Command } from '../src/server/world';
import { Simulation } from '../src/sim/engine';
const save = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : new Simulation(42, 12).save();
const sample = JSON.parse(save);
async function measure(live: boolean) {
  const counts = { checkpoints: 0, stateBytes: 0, clockBytes: 0, eventBytes: 0, commandBytes: 0, newEvents: 0 };
  let capture = false;
  const db = database((sql, values) => {
    if (!capture) return;
    if (sql === 'DELETE FROM snapshots WHERE epoch=?') counts.checkpoints++;
    if (/^INSERT\s+INTO (snapshots|world_changes)\b/.test(sql)) counts.stateBytes += Buffer.byteLength(String(values.at(-1)));
    if (sql.startsWith('INSERT INTO world_live')) counts.clockBytes += Buffer.byteLength(String(values.at(-1)));
    if (sql.startsWith('INSERT OR IGNORE INTO events ')) for (const row of JSON.parse(String(values[1]))) { counts.eventBytes += Buffer.byteLength(JSON.stringify(row.event)); counts.newEvents++; }
    if (/^INSERT INTO (commands|command_inputs)\b/.test(sql)) counts.commandBytes += values.reduce<number>((s, v) => s + Buffer.byteLength(String(v)), 0);
  });
  const store = live ? new LiveWorldStore(db) : new WorldStore(db), now = 1_800_000_000_000;
  await store.init(now);
  async function send(action: Command['action'], at: number) {
    const current = await store.read(), c = { id: crypto.randomUUID(), revision: current.revision, action };
    if (live && action.type === 'sync') return (await (store as LiveWorldStore).sync(c, at)).world;
    const next = await applyCommand(current, c, at);
    await store.commit(next.world, next.events, '0'.repeat(64), c.id, [], { action, at });
    return next.world;
  }
  await send({ type: 'import', save }, now);
  await send({ type: 'ai-mode', mode: 'chrome' }, now);
  await send({ type: 'play', running: true }, now);
  capture = true;
  for (let i = 1; i <= 150; i++) await send({ type: 'sync' }, now + i * 2000);
  await send({ type: 'save' }, now + 300_001);
  const final = await store.read();
  const coldDb = { prepare: db.prepare.bind(db), batch: db.batch.bind(db) } as typeof db;
  const before = performance.now(); await (live ? new LiveWorldStore(coldDb) : new WorldStore(coldDb)).read();
  const rows: Record<string, number> = {};
  for (const table of ['world_live', 'snapshots', 'world_changes', 'events', 'commands', 'command_inputs']) rows[table] = (await db.prepare(`SELECT count(*) AS n FROM ${table}`).first<{n:number}>())!.n;
  return { ...counts, measuredBodyBytes: counts.stateBytes + counts.clockBytes + counts.eventBytes + counts.commandBytes, finalTick: final.state.tick, eventCount: final.meta.eventCount, coldSavedReadMs: Math.round(performance.now() - before), rows };
}
const before = await measure(false), after = await measure(true);
if (before.finalTick !== after.finalTick || before.eventCount !== after.eventCount) throw new Error('Comparison changed simulation results');
const report = { sample: { source: process.argv[2] ? 'previously exported production JSON, local copy' : 'seed 42 fresh world', tick: sample.tick, population: sample.npcs.length, initialEvents: sample.events.length, seconds: 300, syncs: 150, speed: 1, ai: 'chrome mode, no model execution', finalExplicitSave: true }, before, after, bodyByteReductionPercent: Number((100 * (1 - after.measuredBodyBytes / before.measuredBodyBytes)).toFixed(1)), limits: 'UTF-8 application bodies only; excludes indexes, SQLite pages, world metadata, SQL overhead and provider billing. Does not measure production latency.' };
console.log(JSON.stringify(report, null, 2));
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
