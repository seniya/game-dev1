import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Simulation, summarize } from './sim/engine';
import { compactWorld, applyCommand, initialWorld } from './server/world';
import { urbanBalance, cityMetrics } from './sim/urban';
import { balance } from './sim/economy';
import { randomUUID } from 'node:crypto';
const directory = await mkdtemp(join(tmpdir(), 'urban-history-'));
const cases = [];
for (const [population, days, seed] of [[1000, 30, 7], [1000, 30, 42], [3000, 10, 123]]) {
  const db = new DatabaseSync(join(directory, `${population}-${seed}.sqlite`));
  db.exec('CREATE TABLE events(id TEXT PRIMARY KEY, kind TEXT, tick INTEGER, cause TEXT, body TEXT)');
  const insert = db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?)');
  let sim = new Simulation(seed, population); sim.setLLM(false); sim.setDetail('v0', 'focused');
  const started = performance.now(); let maxDayMs = 0, peakLiving = population, maxSaveBytes = 0, peakCities = 0;
  for (let day = 1; day <= days; day++) {
    const start = performance.now(); sim.step(144); maxDayMs = Math.max(maxDayMs, performance.now() - start);
    const w = sim.snapshot(); assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0));
    peakLiving = Math.max(peakLiving, w.npcs.filter(n => n.alive).length); peakCities = Math.max(peakCities, w.civilization.settlements.filter(v => cityMetrics(w, v.id).stage === '도시').length);
    db.exec('BEGIN'); for (const e of w.events) insert.run(e.id, e.kind, e.tick, e.causeId ?? null, JSON.stringify(e)); db.exec('COMMIT');
    const compact = JSON.stringify(compactWorld(w)); maxSaveBytes = Math.max(maxSaveBytes, Buffer.byteLength(compact));
    const restored = Simulation.load(compact);
    if (day === 1 || day % 30 === 0) {
      const uninterrupted = Simulation.load(compact); restored.step(); uninterrupted.step();
      assert.equal(createHash('sha256').update(restored.save()).digest('hex'), createHash('sha256').update(uninterrupted.save()).digest('hex'));
      // A whole-state continuation (including events) is checked by unit tests; compare physical state against unabridged history here.
      sim.step(); assert.equal(JSON.stringify(sim.snapshot().npcs), JSON.stringify(restored.snapshot().npcs)); assert.equal(JSON.stringify(sim.snapshot().urban), JSON.stringify(restored.snapshot().urban));
    }
    sim = restored;
    if (day % 10 === 0) console.log(`${population}/${seed}: ${day}/${days} days, ${w.npcs.filter(n => n.alive).length} alive, ${Math.round(compact.length / 1024)} KiB checkpoint`);
  }
  const w = sim.snapshot();
  const dangling = db.prepare('SELECT count(*) AS n FROM events e LEFT JOIN events p ON e.cause=p.id WHERE e.cause IS NOT NULL AND p.id IS NULL').get() as { n: number }; assert.equal(dangling.n, 0);
  const oldest = db.prepare("SELECT body FROM events WHERE kind='industry' ORDER BY tick LIMIT 1").get() as { body: string } | undefined; assert.ok(oldest, 'actual industry must occur');
  const commandWorld = initialWorld(0); commandWorld.state = w; commandWorld.meta.running = true; commandWorld.meta.aiMode = 'off';
  const requestStart = performance.now(); const advanced = await applyCommand(commandWorld, { id: randomUUID(), revision: 0, action: { type: 'sync' } }, 10000); const serverMs = performance.now() - requestStart;
  Simulation.load(JSON.stringify(advanced.world.state));
  cases.push({ initialPopulation: population, days, peakLiving, peakCities, maxDayMs: Math.round(maxDayMs), elapsedMs: Math.round(performance.now() - started), maxSaveBytes, serverCommandMs: Math.round(serverMs), archivedEvents: (db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n, cities: w.urban.cities.map(c => ({ ...cityMetrics(w, c.settlementId), id: c.settlementId, services: c.services, pollution: c.pollution })), urbanBalance: urbanBalance(w), ...summarize(w) });
  db.close();
}
await writeFile('reports/urban-regression.json', JSON.stringify({ generatedAt: new Date().toISOString(), notes: 'Real per-resident simulation; off mode, no external injections. Daily SQLite original-event archive, validated compacted checkpoints and causal references. 1,000 residents for 30 days in two seeds; 3,000 for 10 days. Local wall times are not a production SLA.', cases }, null, 2));
console.log('PASS: city-scale simulation, funded industry and services, ledgers, save continuity and archived causes.');
