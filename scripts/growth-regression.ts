import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { growthConditions } from '../src/sim/growth';
import { Simulation } from '../src/sim/engine';
import { compactWorld } from '../src/server/world';
import { balance } from '../src/sim/economy';
import { urbanBalance } from '../src/sim/urban';
import { DecisionCoordinator } from '../src/llm/coordinator';
import { MockLLMProvider } from '../src/llm/provider';
const cases=[...[7,42,123].flatMap(seed=>(['off','mock'] as const).map(mode=>({seed,mode,population:12,days:365}))),{seed:42,mode:'off',population:300,days:30},{seed:42,mode:'off',population:1000,days:3},{seed:42,mode:'off',population:3000,days:1}];
const results:unknown[]=[];
for(const c of cases.filter(c=>!process.env.VILLAGE_POPULATION||c.population===Number(process.env.VILLAGE_POPULATION))){
 let sim=new Simulation(c.seed,c.population);sim.setLLM(c.mode==='mock');const start=performance.now();let peakBytes=0,checks=0,maxCareWait=0;const deaths:Record<string,number>={},birthBlocks:Record<string,number>={};let births=0,handoffs=0,careers=0;const deathDetails:unknown[]=[];const seen=new Set<string>(),refs=new Set<string>();
 for(let day=0;day<c.days;day++){
  const ai=new DecisionCoordinator(sim,new MockLLMProvider());
  for(let t=0;t<144;t++){sim.step();if(c.mode==='mock'&&sim.pending)await ai.drain();}
  const w=sim.snapshot();assert.deepEqual(balance(w),{food:0,wood:0,coins:0});assert.ok(Object.values(urbanBalance(w)).every(n=>n===0));
  for(const e of w.events){if(!seen.has(e.id)){if(e.kind==='birth')births++;if(e.data.phase==='care-handoff')handoffs++;if(e.data.phase==='grown-career')careers++;if(e.kind==='death'){const reason=String(e.data.reason);deaths[reason]=(deaths[reason]??0)+1;deathDetails.push({tick:e.tick,actor:e.actorId,...e.data});}}seen.add(e.id);if(e.causeId)refs.add(e.causeId);if(Array.isArray(e.data.evidence))for(const id of e.data.evidence)refs.add(id);}
  for(const i of w.villageLife!.injuries)maxCareWait=Math.max(maxCareWait,w.tick-(i.treatedAt??i.since));
  for(const [key,count] of Object.entries(growthConditions(w,w.civilization.focus).blocks))birthBlocks[key]=(birthBlocks[key]??0)+count;
  const checkpoint=JSON.stringify(compactWorld(w));peakBytes=Math.max(peakBytes,Buffer.byteLength(checkpoint));
  if(day%30===0||day===c.days-1){const a=Simulation.load(sim.save()),b=Simulation.load(checkpoint);a.setLLM(false);b.setLLM(false);a.step(12);b.step(12);assert.deepEqual(compactWorld(a.snapshot()),compactWorld(b.snapshot()));checks++;}
  sim=Simulation.load(checkpoint);
 }
 const w=sim.snapshot();assert.ok(w.npcs.some(n=>n.alive),'world survives');assert.equal([...refs].filter(id=>!seen.has(id)).length,0);
 const stats=w.villageLife!.stats;assert.ok(stats.arguments/Math.max(1,stats.contacts+stats.plays)<.1);
 const result={...c,births,deaths,deathDetails,birthBlocks,handoffs,careers,careMetrics:w.villageLife!.careMetrics,alive:w.npcs.filter(n=>n.alive).length,people:w.npcs.length,stats,stages:Object.values(w.villageLife!.settlements).map(d=>({stage:d.stage,unlocked:d.unlocked})),peakCheckpointBytes:peakBytes,events:seen.size,missingCauses:0,resumeChecks:checks,maxCareWaitTicks:maxCareWait,durationMs:Math.round(performance.now()-start)};
 results.push(result);writeFileSync(process.env.VILLAGE_REPORT??'reports/growth-regression.json',JSON.stringify({version:'0.32.0',environment:'local Node, not production CPU or real Chrome model',results},null,2)+'\n');console.log(JSON.stringify(result));
}
