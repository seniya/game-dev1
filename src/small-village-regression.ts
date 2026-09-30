import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Simulation, summarize } from './sim/engine';
import { balance } from './sim/economy';

const results = [];
for (const seed of [7, 42, 123]) for (const project of [false, true]) {
  const sim = new Simulation(seed, 12); sim.setLLM(false);
  if (project) sim.build('v0', 'home');
  for (let day = 1; day <= 30; day++) {
    sim.step(144);
    assert.deepEqual(balance(sim.snapshot()), { food: 0, wood: 0, coins: 0 });
    if (day % 5 === 0) {
      const copy = Simulation.load(sim.save());
      assert.equal(copy.save(), sim.save());
    }
  }
  const resumed = Simulation.load(sim.save()); resumed.step(10); sim.step(10);
  assert.equal(sim.save(), resumed.save());
  const w = sim.snapshot();
  results.push({ project: project ? 'observer-home' : 'none', days: 30, continuationTicks: 10,
    ...summarize(w), map: {width:w.width,height:w.height}, balance: balance(w),
    relationshipPairs: new Set(w.npcs.flatMap(n=>n.relationships.map(r=>[n.id,r.npcId].sort().join(':')))).size,
    saveContinuation: true });
}
writeFileSync('reports/small-village-regression.json', JSON.stringify({ version: '0.11.0', model: 'off', results }, null, 2)+'\n');
console.log(results.map(r=>({seed:r.seed,project:r.project,survivors:r.population,shares:r.shares,pairs:r.relationshipPairs,balance:r.balance})));
