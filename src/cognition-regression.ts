import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Simulation } from './sim/engine';
import { compactWorld } from './server/world';
import { balance } from './sim/economy';
import { DecisionCoordinator } from './llm/coordinator';
import { MockLLMProvider } from './llm/provider';

const results = [];
for (const seed of [7, 42, 123]) for (const mode of ['off', 'mock'] as const) {
  let sim = new Simulation(seed); sim.setLLM(mode !== 'off');
  for (let day = 0; day < 30; day++) {
    const coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
    for (let tick = 0; tick < 144; tick++) { sim.step(); if (mode === 'mock' && sim.pending) await coordinator.drain(); }
    assert.deepEqual(balance(sim.snapshot()), { food: 0, wood: 0, coins: 0 });
    if (day % 5 === 4) {
      const copy = Simulation.load(sim.save());
      sim.step(); copy.step(); assert.equal(sim.save(), copy.save());
      sim = Simulation.load(JSON.stringify(compactWorld(sim.snapshot())));
    }
  }
  const w = sim.snapshot();
  const reflections = w.npcs.flatMap(n => n.cognition?.reflections ?? []);
  assert.ok(reflections.length > 0);
  assert.ok(w.npcs.every(n => !n.cognition || n.cognition.reflections.length <= 8 && (n.cognition.retrieval?.items.length ?? 0) <= 8));
  results.push({ seed, mode, days: 30, continuationTicks: 6, survivors: w.npcs.filter(n => n.alive).length,
    retainedReflections: reflections.length, residentsWithPlans: w.npcs.filter(n => n.cognition?.plan).length,
    completedModelDecisions: w.llm.completed, shares: w.stats.shares, balance: balance(w), exactContinuation: true, compactReferencesValid: true });
}
const scale = new Simulation(42, 100); scale.setLLM(false); const started = performance.now(); scale.step(144 * 5);
const large = Simulation.load(JSON.stringify(compactWorld(scale.snapshot()))); assert.deepEqual(balance(large.snapshot()), { food: 0, wood: 0, coins: 0 });
const report = { version: '0.14.0', results, scale: { population: 100, days: 5, elapsedMs: Math.round(performance.now() - started), valid: true },
  limits: 'Deterministic rule-based adaptation; no real Chrome inference or human believability evaluation.' };
writeFileSync('reports/cognition-regression.json', JSON.stringify(report, null, 2) + '\n'); console.log(report);
