import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { Simulation } from '../src/sim/engine';
import { availableHomes } from '../src/sim/characters';
import { defaultCharacter, START_PRESETS } from '../src/ui/characters';
import { creationBudgets } from '../src/sim/character-schema';
import { compactWorld } from '../src/server/world';
import { balance } from '../src/sim/economy';
import { urbanBalance } from '../src/sim/urban';
import { descendants } from '../src/sim/dynasty';
import { DecisionCoordinator } from '../src/llm/coordinator';
import { MockLLMProvider } from '../src/llm/provider';

const group=process.env.V030_GROUP;
if(group!==undefined&&!['0','1','2'].includes(group))throw Error('Invalid case group');
const output=group===undefined?'reports/neighbors-regression.json':`reports/neighbors-regression-group-${group}.json`;
const allCases = [
  ...[7,42,123].flatMap(seed=>['off','mock'].flatMap(mode=>Object.keys(START_PRESETS).flatMap(preset=>['none','chain','network'].map(bonds=>({seed,mode,preset,bonds,population:12,days:60}))))),
  ...[7,42,123].flatMap(seed=>['off','mock'].map(mode=>({seed,mode,preset:'mixed',bonds:'network',population:12,days:365}))),
  ...[{population:300,days:30},{population:1000,days:3},{population:3000,days:1}].map(c=>({...c,seed:42,mode:'off',preset:'scale',bonds:'none'})),
];
const cases=allCases.filter((_,i)=>group===undefined||i%3===Number(group));
const key=(c: typeof cases[number])=>[c.seed,c.mode,c.preset,c.bonds,c.population,c.days].join(':');
const baseline=process.env.V030_BASELINE??output;
const results: any[] = process.env.V030_RESUME==='1'&&existsSync(baseline)?JSON.parse(readFileSync(baseline,'utf8')).results.filter((r:any)=>cases.some(c=>key(c)===key(r))):[];

function report(){
  const groups=Object.keys(START_PRESETS).map(preset=>{
    const rows=results.filter(r=>r.preset===preset), mean=(key:string)=>rows.length?rows.reduce((s,r)=>s+r[key],0)/rows.length:0;
    return {preset,cases:rows.length,survival:mean('survival'),coins:mean('coins'),closeTies:mean('closeTies'),descendants:mean('descendants')};
  });
  const dominance=groups.flatMap(a=>groups.filter(b=>a!==b&&a.cases===18&&b.cases===18&&(['survival','coins','closeTies','descendants'] as const).every(k=>a[k]>=b[k])&&(['survival','coins','closeTies','descendants'] as const).some(k=>a[k]>b[k])).map(b=>({over:a.preset,under:b.preset})));
  const pairedComparisons=Object.keys(START_PRESETS).flatMap(a=>Object.keys(START_PRESETS).filter(b=>a<b).map(b=>{
    const pairs=results.filter(r=>r.preset===a).map(x=>[x,results.find(y=>y.preset===b&&y.seed===x.seed&&y.mode===x.mode&&y.bonds===x.bonds)]).filter(([,y])=>!!y);
    return {a,b,cases:pairs.length,metrics:Object.fromEntries(['survival','coins','closeTies','descendants'].map(k=>[k,{aHigher:pairs.filter(([x,y])=>x[k]>y[k]).length,equal:pairs.filter(([x,y])=>x[k]===y[k]).length,bHigher:pairs.filter(([x,y])=>x[k]<y[k]).length}]))};
  }));
  writeFileSync(output,JSON.stringify({version:'0.30.0',measurement:'Local Node runs; final long/scale cases run in three independent processes on the same machine. Elapsed time and sampled heap are not production guarantees.',definitions:{survival:'Surviving directly created founders out of five',coins:'Current coins of surviving founders, including initial assets and transfers; not investment return',closeTies:'Preserved directional relationship records of the five founders with trust >=60 and affection >=25, including deceased people',descendants:'Unique descendants of any of the five founders, including deceased descendants; founders excluded'},pairedComparisons,complete:results.length===cases.length,totalCases:cases.length,scope:'3 seeds × off/Mock × 3 presets × 3 bond layouts × 60 days; mixed five-resident cohorts × 365 days; 300/1000/3000 population scale. Same seed, home selection, assets, personality and needs. Aggregate comparisons describe these local scenarios, not equal win rates or production performance.',groups,aggregateDominance:dominance,results},null,2)+'\n');
}
for(const c of cases){
  if(results.some(r=>key(r)===key(c)))continue;
  const start=performance.now();let sim=new Simulation(c.seed,c.population);sim.setLLM(c.mode==='mock');
  const roots:string[]=[];
  if(c.preset!=='scale')for(let i=0;i<5;i++){
    const w=sim.snapshot(),home=availableHomes(w).find(h=>h.vacant);assert.ok(home,'five available starting homes');
    const preset=START_PRESETS[c.preset==='mixed'?Object.keys(START_PRESETS)[i%3]:c.preset];
    const a={...defaultCharacter(home.home.id),...preset,name:`이웃 ${i+1}`,bonds:c.bonds==='none'?[]:c.bonds==='chain'?roots.slice(-1).map(npcId=>({npcId,familiarity:60})):roots.map(npcId=>({npcId,familiarity:30}))};
    delete (a as Partial<typeof a>).label;
    assert.ok(creationBudgets(a).every(b=>b.used<=b.limit));assert.equal(creationBudgets(a)[0].used,200);
    roots.push(sim.createCharacter(a));
  }
  let peakBytes=0,peakHeap=0,resumes=0,turns=0,events=0;const seen=new Set<string>();
  for(let day=0;day<c.days;day++){
    const coordinator=new DecisionCoordinator(sim,new MockLLMProvider());
    for(let tick=0;tick<144;tick++){sim.step();if(c.mode==='mock'&&sim.pending)await coordinator.drain();}
    const w=sim.snapshot();assert.deepEqual(balance(w),{food:0,wood:0,coins:0});assert.ok(Object.values(urbanBalance(w)).every(v=>v===0));
    for(const e of w.events)if(!seen.has(e.id)){if(e.causeId)assert.ok(seen.has(e.causeId)||w.events.some(p=>p.id===e.causeId));seen.add(e.id);events++;if(e.data.turn)turns++;}
    const checkpoint=JSON.stringify(compactWorld(w));peakBytes=Math.max(peakBytes,Buffer.byteLength(checkpoint));peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);
    sim=Simulation.load(checkpoint);
    if(day%30===0||day===c.days-1){const a=Simulation.load(checkpoint),b=Simulation.load(a.save());a.setLLM(false);b.setLLM(false);a.step(12);b.step(12);assert.equal(a.save(),b.save());resumes++;}
  }
  const w=sim.snapshot(),own=w.npcs.filter(n=>roots.includes(n.id)),family=new Set(roots.flatMap(id=>[...descendants(w,id).keys()]));
  results.push({...c,survival:own.filter(n=>n.alive).length,coins:own.filter(n=>n.alive).reduce((s,n)=>s+n.wealth,0),closeTies:own.reduce((s,n)=>s+n.relationships.filter(r=>r.trust>=60&&r.affection>=25).length,0),descendants:[...family].filter(id=>!roots.includes(id)).length,alive:w.npcs.filter(n=>n.alive).length,events,turns,peakBytes,peakHeap,resumes,accounting:true,deterministicResume:true,ms:Math.round(performance.now()-start)});
  report();console.log(JSON.stringify(results.at(-1)));
}
report();
