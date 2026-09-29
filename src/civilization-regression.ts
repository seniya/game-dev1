import { DatabaseSync } from 'node:sqlite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compactWorld } from './server/world';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Simulation, summarize } from './sim/engine';
import { balance } from './sim/economy';

const rows = [];
const archiveDirectory = await mkdtemp(join(tmpdir(), 'living-world-history-')); 
for (const seed of [7, 42, 123]) {
  const db = new DatabaseSync(join(archiveDirectory, `${seed}.sqlite`));
  db.exec('CREATE TABLE events(id TEXT PRIMARY KEY, tick INTEGER, kind TEXT, cause TEXT, body TEXT)');
  const insert = db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)');
  const archive = (sim: Simulation) => { const w = sim.snapshot(); db.exec('BEGIN'); for (const e of w.events) insert.run(e.id, e.tick, e.kind, e.causeId ?? null, JSON.stringify(e)); db.exec('COMMIT'); return Simulation.load(JSON.stringify(compactWorld(w))); };
  const started = performance.now(); let sim = new Simulation(seed, 300); sim.setLLM(false); sim.setDetail('v0', 'focused');
  let peakPopulation = 300, peakGenerations = 0, maxDayMs = 0;
  for (let day = 0; day < 900; day++) {
    const before = performance.now(); sim.step(144); maxDayMs = Math.max(maxDayMs, performance.now() - before);
    if ((day + 1) % 30 === 0) sim = archive(sim);
    if ((day + 1) % 60 === 0) {
      const state = sim.snapshot(); assert.deepEqual(balance(state), { food: 0, wood: 0, coins: 0 });
      peakPopulation = Math.max(peakPopulation, state.npcs.filter(n => n.alive).length); peakGenerations = Math.max(peakGenerations, ...state.npcs.map(n => n.life.generation));
      // Verify continuation across save/reload without replaying all 900 days.
      const restored = Simulation.load(sim.save()); sim.step(); restored.step(); assert.equal(createHash('sha256').update(sim.save()).digest('hex'), createHash('sha256').update(restored.save()).digest('hex'));
      sim = restored;
      console.log(`${seed}: ${day + 1} days, ${state.npcs.filter(n => n.alive).length} living, generation ${peakGenerations}, ${state.events.length} events`);
    }
  }
  sim = archive(sim); const state = sim.snapshot(); Simulation.load(sim.save());
  const dangling = db.prepare('SELECT count(*) AS count FROM events e LEFT JOIN events parent ON e.cause=parent.id WHERE e.cause IS NOT NULL AND parent.id IS NULL').get() as { count: number }; assert.equal(dangling.count, 0);
  const archiveCount = (db.prepare('SELECT count(*) AS count FROM events').get() as { count: number }).count;
  const oldestBirth = db.prepare("SELECT body FROM events WHERE kind='birth' ORDER BY tick LIMIT 1").get() as { body: string } | undefined;
  if (oldestBirth) assert.ok(state.npcs.some(n => n.id === JSON.parse(oldestBirth.body).actorId));
  rows.push({ days: 900, extraCheckpointTicks: 15, initialPopulation: 300, archiveCount, oldestBirth: oldestBirth ? JSON.parse(oldestBirth.body) : null, peakPopulation, peakGenerations, maxDayMs: Math.round(maxDayMs), elapsedMs: Math.round(performance.now() - started), saveBytes: Buffer.byteLength(sim.save()), ...summarize(state), birthsByGeneration: Object.fromEntries([...new Set(state.npcs.map(n => n.life.generation))].map(g => [g, state.npcs.filter(n => n.life.generation === g).length])), importantHistory: (db.prepare("SELECT count(*) AS count FROM events WHERE kind IN ('birth','death','inheritance','settlement','migration','caravan')").get() as { count: number }).count });
  db.close();
}
assert.ok(rows.some(row => row.generations >= 2), 'At least one unassisted world must reach grandchildren.');
await mkdir('reports', { recursive: true });
await writeFile('reports/civilization-regression.json', JSON.stringify({ generatedAt: new Date().toISOString(), notes: 'No external food injections. Full original events archived to temporary SQLite, engine checkpoints compacted every 30 days; archive cause references checked. 900 days plus 15 single-tick continuation checks. Detail mode omits only distant routine records; all physical rules run each tick. maxDayMs is local wall time, not a production SLA.', cases: rows }, null, 2));
console.log('PASS: three 300-resident, 900-day worlds; conserved accounts, validated histories, exact checkpoint continuation.');
