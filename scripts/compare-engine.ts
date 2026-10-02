import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Simulation } from '../src/sim/engine';
import { LegacySimulation } from '../src/server/retained/94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b';
const results=[];
for(const population of [12,300,1000,3000]) {
 const rows=[];let baseline:unknown;
 // Both versions run in the same process without the CPU profiler, on identical initial states.
 for(const version of ['v022','v023'] as const) {
  const sim=version==='v022'?new LegacySimulation(42,population):new Simulation(42,population);sim.setLLM(false);
  const cpu=process.cpuUsage(),start=performance.now(),tickMs=[];
  for(let i=0;i<144;i++){const t=performance.now();sim.step(1,undefined);tickMs.push(performance.now()-t);}
  const elapsedMs=performance.now()-start,used=process.cpuUsage(cpu),state=sim.snapshot() as ReturnType<Simulation['snapshot']>;
  if(version==='v022')baseline=state;else{if(state.frontier)delete state.frontier.impact;assert.deepEqual(state,baseline);}
  tickMs.sort((a,b)=>a-b);rows.push({version,elapsedMs,cpuMs:(used.user+used.system)/1000,p95TickMs:tickMs[Math.ceil(tickMs.length*.95)-1],events:state.events.length});
 }
 results.push({population,ticks:144,identical:true,rows,speedup:rows[0].elapsedMs/rows[1].elapsedMs});console.log(results.at(-1));
 writeFileSync('reports/engine-comparison-v023.json',JSON.stringify({scope:'Single paired local Node run, v022 then v023, no CPU profiler; includes all simulation work, excludes serialization. Same complete resulting state after excluding the newly added wildlife counters. Not production throughput or CPU.',results},null,2)+'\n');
}
