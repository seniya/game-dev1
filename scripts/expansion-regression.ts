import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Simulation } from '../src/sim/engine';
import { compactWorld } from '../src/server/world';
import { balance } from '../src/sim/economy';
import { urbanBalance } from '../src/sim/urban';
import { DecisionCoordinator } from '../src/llm/coordinator';
import { MockLLMProvider } from '../src/llm/provider';
const cases = [
  ...[7, 42, 123].flatMap((seed) =>
    (['off', 'mock'] as const).map((mode) => ({ seed, mode, population: 12, days: 365 })),
  ),
  { seed: 42, mode: 'off', population: 300, days: 30 },
  { seed: 42, mode: 'off', population: 1000, days: 3 },
  { seed: 42, mode: 'off', population: 3000, days: 1 },
];
const results: unknown[] = [];
for (const c of cases) {
  const started = performance.now(),
    cpu = process.cpuUsage(),
    db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE events(id TEXT PRIMARY KEY);CREATE TABLE refs(source TEXT,target TEXT)');
  const insert = db.prepare('INSERT OR IGNORE INTO events VALUES(?)'),
    ref = db.prepare('INSERT INTO refs VALUES(?,?)');
  let sim = new Simulation(c.seed, c.population);
  sim.setLLM(c.mode === 'mock');
  let peakHeap = 0,
    peakCheckpoint = 0,
    resumeChecks = 0;
  const dayMs: number[] = [];
  for (let day = 0; day < c.days; day++) {
    const t = performance.now(),
      coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
    for (let tick = 0; tick < 144; tick++) {
      sim.step();
      if (sim.pending && c.mode === 'mock') await coordinator.drain();
    }
    const w = sim.snapshot();
    assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 });
    assert.ok(Object.values(urbanBalance(w)).every((n) => n === 0));
    db.exec('BEGIN');
    for (const e of w.events)
      if (insert.run(e.id).changes) {
        for (const target of [
          ...(e.causeId ? [e.causeId] : []),
          ...(Array.isArray(e.data.evidence) ? e.data.evidence : []),
        ])
          ref.run(e.id, target);
      }
    db.exec('COMMIT');
    const checkpoint = JSON.stringify(compactWorld(w));
    peakCheckpoint = Math.max(peakCheckpoint, Buffer.byteLength(checkpoint));
    sim = Simulation.load(checkpoint);
    if (day === c.days - 1 || day % 30 === 0) {
      const a = Simulation.load(checkpoint),
        b = Simulation.load(a.save());
      a.setLLM(false);
      b.setLLM(false);
      a.step(12);
      b.step(12);
      assert.equal(a.save(), b.save());
      resumeChecks++;
    }
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    dayMs.push(performance.now() - t);
  }
  const missing = (
    db.prepare('SELECT count(*) AS n FROM refs r LEFT JOIN events e ON e.id=r.target WHERE e.id IS NULL').get() as {
      n: number;
    }
  ).n;
  assert.equal(missing, 0);
  const w = sim.snapshot(),
    used = process.cpuUsage(cpu);
  dayMs.sort((a, b) => a - b);
  const result = {
    ...c,
    living: w.npcs.filter((n) => n.alive).length,
    wildlife: w.frontier?.animals.length ?? 0,
    events: (db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n,
    accounting: balance(w),
    urbanAccounting: urbanBalance(w),
    missingReferences: missing,
    resumeChecks,
    elapsedMs: Math.round(performance.now() - started),
    cpuMs: Math.round((used.user + used.system) / 1000),
    peakHeapSampleBytes: peakHeap,
    peakCheckpointBytes: peakCheckpoint,
    p95DayMs: Math.round(dayMs[Math.ceil(dayMs.length * 0.95) - 1]),
  };
  results.push(result);
  db.close();
  writeFileSync(
    'reports/expansion-regression.json',
    JSON.stringify(
      {
        version: '0.22.0',
        completed: results.length === cases.length,
        measurement:
          'Local Node process CPU and sampled heap, including archive/validation/continuation overhead. Not production Worker CPU or memory. Full rules preserved; no approximate LOD or distributed server introduced.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(result));
}
