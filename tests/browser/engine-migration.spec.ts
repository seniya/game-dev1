import {LegacySimulation as V023Simulation} from '../../src/server/retained/1f715cc52538fb42ba73c3bbbef07b1a948c1f7f1cdcd6f55a986960bfdd8ac4';
import {LegacySimulation as V022Simulation} from '../../src/server/retained/94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b';
import {test,expect} from '@playwright/test';
import {readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {LegacySimulation} from '../../src/server/legacy-v021';
import type {WorldState} from '../../src/sim/types';

for(const engine of [{version:'v023',Simulation:V023Simulation,build:'1f715cc52538fb42ba73c3bbbef07b1a948c1f7f1cdcd6f55a986960bfdd8ac4'},{version:'v021',Simulation:LegacySimulation,build:'5809ccf28f7e3e9d2f897f7a23c03ecfe41c0de21b98432a7776949f4ac4d2f2'},{version:'v022',Simulation:V022Simulation,build:'94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b'}])
test(`real Worker loads ${engine.version} retained engine and confirms previous-build progress once`,async({request})=>{
 const get=()=>request.get('/api/world').then(r=>r.json());
 const send=async(action:object)=>{const w=await get();const r=await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:w.revision,action}});expect(r.ok()).toBe(true);return r.json();};
 await send({type:'reset',seed:42,population:12});await send({type:'ai-mode',mode:'off'});
 const saved=await get(),sim=engine.Simulation.load(JSON.stringify(saved.state));for(let i=0;i<160;i++)sim.step(1,undefined);
 const state=sim.snapshot() as unknown as WorldState,ids=new Set(saved.state.events.map((e:{id:string})=>e.id)),events=state.events.filter(e=>!ids.has(e.id));
 const meta={...saved.meta,running:false,eventCount:saved.meta.eventCount+events.length,lastSeen:Date.now(),clock:Date.now()};
 const directory='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
 const databases=readdirSync(directory).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite').map(f=>new DatabaseSync(`${directory}/${f}`));
 try {
   const db=databases.find(db=>db.prepare("SELECT name FROM sqlite_master WHERE name='world'").get());if(!db)throw new Error('No local world fixture database');
   db.prepare('INSERT OR REPLACE INTO world_live VALUES(1,?,1,?)').run(saved.revision,JSON.stringify({build:engine.build,epoch:saved.epoch,ticks:160,meta,started:Date.now(),id:crypto.randomUUID()}));
   const recovered=await get();expect(recovered.revision).toBe(saved.revision+1);expect(recovered.state.tick).toBe(state.tick);if(engine.version==='v021')expect(recovered.state.frontier).toBeUndefined();else expect(recovered.state.frontier).toBeTruthy();expect(recovered.meta.eventCount).toBe(meta.eventCount);
   expect(db.prepare('SELECT * FROM world_live').get()).toBeUndefined();expect((await get()).revision).toBe(recovered.revision);
   const exported=await(await request.get('/api/export')).json();expect(exported.events).toEqual(JSON.parse(JSON.stringify(state.events)));
 }finally{databases.forEach(db=>db.close());}
});
