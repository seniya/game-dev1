import { Simulation } from '../src/sim/engine';
import { writeFileSync } from 'node:fs';
const rows=[];
for(const population of [12,300,1000,3000]) {
 const sim=new Simulation(42,population);sim.setLLM(false);const times=[];const cpu=process.cpuUsage();const started=performance.now();
 for(let i=0;i<144;i++){const t=performance.now();sim.step();times.push(performance.now()-t);}
 const elapsedMs=performance.now()-started,used=process.cpuUsage(cpu);times.sort((a,b)=>a-b);
 const t=performance.now(),state=sim.snapshot();const snapshotMs=performance.now()-t;
 const s=performance.now(),body=sim.save();const serializeMs=performance.now()-s;
 const load=performance.now();Simulation.load(body);const loadMs=performance.now()-load;
 rows.push({population,ticks:144,elapsedMs,p95TickMs:times[Math.ceil(times.length*.95)-1],maxTickMs:times.at(-1),cpuMs:(used.user+used.system)/1000,heapSampleBytes:process.memoryUsage().heapUsed,snapshotMs,serializeMs,loadMs,events:state.events.length});console.log(rows.at(-1));
}
writeFileSync(process.argv[2]??'reports/engine-profile-v023.json',JSON.stringify({scope:'Local Node: complete engine steps, snapshot, serialization and validated load. No production CPU claim.',rows},null,2)+'\n');
