import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Simulation, summarize } from './sim/engine';
import { balance } from './sim/economy';
import { DecisionCoordinator } from './llm/coordinator';
import { MockLLMProvider } from './llm/provider';

// Fixed matrix; no cherry-picked success seed. Population pressure is intentionally unfunded.
const cases = [7, 42, 123].flatMap(seed => [100, 365].flatMap(days =>
  (['normal', 'drought', 'pressure'] as const).map(condition => ({ seed, days, condition, population: condition === 'pressure' ? 100 : 12 }))));
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const results = [];
for (const c of cases) {
  const started = performance.now(); let sim = new Simulation(c.seed, c.population); sim.setLLM(false);
  // Apply drought daily for the first ten days and a single recorded recovery input on day 10.
  const stepDay = (s: Simulation, day: number) => {
    if (c.condition === 'drought' && day < 10) s.experiment('drought');
    if (c.condition === 'drought' && day === 10) s.experiment('food');
    s.step(144);
  };
  const split = Math.floor(c.days / 2);
  for (let day = 0; day < split; day++) stepDay(sim, day);
  const checkpoint = sim.save();
  let resumed = Simulation.load(checkpoint);
  for (let day = split; day < c.days; day++) { stepDay(sim, day); stepDay(resumed, day); }
  assert.equal(hash(sim.save()), hash(resumed.save()), `resume ${JSON.stringify(c)}`);
  const state = sim.snapshot(), serialized = sim.save();
  assert.deepEqual(balance(state), { food: 0, wood: 0, coins: 0 });
  assert.equal(hash(Simulation.load(serialized).save()), hash(serialized));
  assert.equal(state.economy.daily.length, c.days);
  // Decisions stuck for longer than one day indicate a planner fault, regardless of starvation.
  assert.ok(state.npcs.every(n => !n.alive || !n.currentAction || state.tick - n.decision.tick <= 144));
  // Run an independent complete replay, including all interventions.
  const replay = new Simulation(c.seed, c.population); replay.setLLM(false);
  for (let day = 0; day < c.days; day++) stepDay(replay, day);
  assert.equal(hash(replay.save()), hash(serialized));
  const failures = state.events.filter(e => e.kind === 'failure'), reasons: Record<string, number> = {};
  for (const e of failures) { const reason = e.description.split(': ').slice(1).join(': '); reasons[reason] = (reasons[reason] ?? 0) + 1; }
  const row = { ...c, initialPopulation: c.population, ...summarize(state), failureReasons: reasons, deathEvidence: state.events.filter(e => e.kind === 'death').map(e => ({ id: e.id, tick: e.tick, description: e.description, conditions: e.data })),
    minDailyFood: Math.min(...state.economy.daily.map(d => d.food)), maxDailyFood: Math.max(...state.economy.daily.map(d => d.food)),
    bytes: Buffer.byteLength(serialized), elapsedMs: Math.round(performance.now() - started), processHeapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), sha256: hash(serialized) };
  results.push(row);
  console.log(`${c.seed} / ${c.days}d / ${c.condition}: alive ${row.population}, deaths ${row.deaths}, trades ${row.economy.trades}, accounts balanced, replay identical (${row.elapsedMs}ms)`);
}
// Deterministic mock audit on a separate world: failures never block ordinary simulation.
const ai = new Simulation(42), coordinator = new DecisionCoordinator(ai, new MockLLMProvider());
for (let i = 0; i < 14400; i++) { ai.step(); if (ai.pending) await coordinator.drain(); }
const aiSummary = summarize(ai.snapshot());
assert.ok(aiSummary.llm.completed > 0); assert.ok(aiSummary.llm.requested <= 101 * 12); assert.deepEqual(aiSummary.economy.balance, { food: 0, wood: 0, coins: 0 });
await mkdir('reports', { recursive: true });
await writeFile('reports/regression.json', JSON.stringify({ generatedAt: new Date().toISOString(), measurementNotes: 'elapsedMs includes independent replay, save validation, and continuation checks; processHeapMB includes multiple live simulation copies and garbage awaiting collection, not single-world memory.', contract: 'same seed + commands; all accounts conserve; save continuation and independent replay match', cases: results, mock: aiSummary }, null, 2));
console.log(`PASS: ${results.length} long-run cases + 100-day Mock audit. reports/regression.json`);
