import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/engine';
import { compactWorld } from '../src/server/world';
import { balance } from '../src/sim/economy';
import { urbanBalance } from '../src/sim/urban';
import { DecisionCoordinator } from '../src/llm/coordinator';
import { MockLLMProvider } from '../src/llm/provider';
import type { Ambition } from '../src/sim/ambition';
const results: object[] = [];
for (const seed of [7, 42, 123]) for (const mode of ['off','mock']) for (const focus of ['balanced','family','wealth','community'] as Ambition[]) {
  let sim = new Simulation(seed, 12); sim.setLLM(mode === 'mock');
  sim.setAmbition('npc0', focus);
  const started = performance.now(); let reloads = 0;
  for (let day = 0; day < 60; day++) {
    const coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
    for (let tick = 0; tick < 144; tick++) { sim.step(); if (mode === 'mock' && sim.pending) await coordinator.drain(); }
    const w = sim.snapshot(); assert.deepEqual(balance(w), {food:0,wood:0,coins:0}); assert.ok(Object.values(urbanBalance(w)).every(n=>n===0));
    sim = Simulation.load(JSON.stringify(compactWorld(w))); reloads++;
    assert.equal(sim.snapshot().npcs[0].life.ambition ?? 'balanced', focus);
  }
  const state=sim.snapshot(), a=Simulation.load(sim.save()), b=Simulation.load(sim.save());a.setLLM(false);b.setLLM(false);a.step(12);b.step(12);assert.equal(a.save(),b.save());
  results.push({seed,mode,focus,days:60,reloads,alive:state.npcs.filter(n=>n.alive).length,births:state.npcs.length-12,deaths:state.stats.deaths,ms:Math.round(performance.now()-started),accounting:true,deterministicResume:true});
  writeFileSync('reports/dynasty-regression.json',JSON.stringify({results,scope:'3 seeds × 2 modes × 4 ambitions × 60 days; accounting and save/continuation, not a guarantee of successful reproduction'},null,2)+'\n');
  console.log(JSON.stringify(results.at(-1)));
}
