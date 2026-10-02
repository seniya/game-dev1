import { LegacySimulation } from '../src/server/retained/71219a10b909c676b6f2eee15ce70be351afa680845d34d19ccf24f520dc9f3e';
import { writeFileSync } from 'node:fs';
const results=[];
for(const seed of [7,42,123]){let s=new LegacySimulation(seed,12);s.setLLM(false);const deaths:Record<string,number>={},blocked:Record<string,number>={};let births=0;
for(let day=0;day<365;day++){const tick=s.snapshot().tick;s.step(144);const w=s.snapshot();for(const e of w.events.filter((e:any)=>e.tick>tick)){if(e.kind==='birth')births++;if(e.kind==='death')deaths[String(e.data.reason)]=(deaths[String(e.data.reason)]??0)+1;}const reason=w.villageLife?.settlements.v0.reason??'';blocked[reason]=(blocked[reason]??0)+1;}
const w=s.snapshot();results.push({seed,alive:w.npcs.filter((n:any)=>n.alive).length,births,deaths,blocked});writeFileSync('reports/growth-baseline.json',JSON.stringify({version:'0.31.0',days:365,mode:'off',results},null,2));console.log(results.at(-1));}
