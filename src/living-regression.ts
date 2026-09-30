import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Simulation } from './sim/engine';
import { compactWorld } from './server/world';
import { balance } from './sim/economy';
import { urbanBalance } from './sim/urban';
import { GOODS } from './sim/urban-types';
const cases = [];
for (const [population, days, seed] of [[12, 60, 42], [72, 30, 7], [1000, 10, 42], [3000, 2, 123]]) {
  let sim = new Simulation(seed, population); sim.setLLM(false); sim.setDetail('v0', 'focused');
  const start = performance.now(); let consumption = 0;
  for (let day = 0; day < days; day++) {
    sim.step(144); const w = sim.snapshot();
    assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0));
    consumption += w.events.filter(e => e.kind === 'consumption' && typeof e.data.good === 'string' && e.tick > w.tick - 144).length;
    sim = Simulation.load(JSON.stringify(compactWorld(w)));
  }
  const restored = Simulation.load(sim.save()); sim.step(2); restored.step(2); assert.equal(sim.save(), restored.save());
  const w = sim.snapshot();
  cases.push({ population, days, seed, elapsedMs: Math.round(performance.now() - start), alive: w.npcs.filter(n => n.alive).length, professions: [...new Set(w.npcs.filter(n => n.alive).map(n => n.occupation))], enterprises: [...new Set(w.urban.enterprises.map(e => e.kind))], goodsProduced: w.urban.ledger.produced, goodsConsumed: w.urban.ledger.consumed, observedConsumerEvents: consumption, balance: balance(w), goodsBalance: urbanBalance(w), saveBytes: Buffer.byteLength(sim.save()) });
  console.log(`${population} residents / ${days} days: validated all ${GOODS.length} goods, accounting, checkpoints and continuation`);
}
assert.ok(cases.some(c => c.goodsProduced.clothes > 0 && c.goodsProduced.furniture > 0 && c.goodsProduced.meals > 0), 'new production chains must operate autonomously');
assert.ok(cases.some(c => c.observedConsumerEvents > 0), 'residents must actually consume new goods');
await writeFile('reports/living-regression.json', JSON.stringify({ generatedAt: new Date().toISOString(), notes: 'Model off, no asset injections; daily validated compacted saves and exact continuation. Wall times describe this local environment.', cases }, null, 2));
