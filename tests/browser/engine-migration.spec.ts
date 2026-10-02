import {test,expect} from '@playwright/test';
import {readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {LegacySimulation} from '../../src/server/legacy-v021';
import type {WorldState} from '../../src/sim/types';

test('real Worker loads the retained engine chunk and confirms previous-build progress once',async({request})=>{
 const get=()=>request.get('/api/world').then(r=>r.json());
 const send=async(action:object)=>{const w=await get();const r=await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:w.revision,action}});expect(r.ok()).toBe(true);return r.json();};
 await send({type:'reset',seed:42,population:12});await send({type:'ai-mode',mode:'off'});
 const saved=await get(),sim=LegacySimulation.load(JSON.stringify(saved.state));for(let i=0;i<160;i++)sim.step(1,undefined);
 const state=sim.snapshot() as unknown as WorldState,ids=new Set(saved.state.events.map((e:{id:string})=>e.id)),events=state.events.filter(e=>!ids.has(e.id));
 const meta={...saved.meta,running:false,eventCount:saved.meta.eventCount+events.length,lastSeen:Date.now(),clock:Date.now()};
 const directory='.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
 const databases=readdirSync(directory).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite').map(f=>new DatabaseSync(`${directory}/${f}`));
 try {
   const db=databases.find(db=>db.prepare("SELECT name FROM sqlite_master WHERE name='world'").get());if(!db)throw new Error('No local world fixture database');
   db.prepare('INSERT OR REPLACE INTO world_live VALUES(1,?,1,?)').run(saved.revision,JSON.stringify({build:'5809ccf28f7e3e9d2f897f7a23c03ecfe41c0de21b98432a7776949f4ac4d2f2',epoch:saved.epoch,ticks:160,meta,started:Date.now(),id:crypto.randomUUID()}));
   const recovered=await get();expect(recovered.revision).toBe(saved.revision+1);expect(recovered.state.tick).toBe(state.tick);expect(recovered.state.frontier).toBeUndefined();expect(recovered.meta.eventCount).toBe(meta.eventCount);
   expect(db.prepare('SELECT * FROM world_live').get()).toBeUndefined();expect((await get()).revision).toBe(recovered.revision);
   const exported=await(await request.get('/api/export')).json();expect(exported.events).toEqual(JSON.parse(JSON.stringify(state.events)));
 }finally{databases.forEach(db=>db.close());}
});
