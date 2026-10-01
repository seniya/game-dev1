import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { balance, createEconomy } from '../src/sim/economy';
import { villageSize, stocks } from '../src/sim/civilization';
import { findPath } from '../src/sim/pathfinding';
import { initialWorld } from '../src/server/world';
import { observationView } from '../src/ui/observation';
import { WorldStore } from '../src/server/store';
import worker from '../src/server/worker';
import { database } from './helpers/database';

test('small world reserves 2.25 times the land with reachable homes, work and resources', () => {
  const w = initialWorld(0).state;
  assert.equal(w.npcs.length, 12); assert.equal(w.width * w.height, 32 * 24 * 2.25);
  for (const p of [...w.buildings, ...w.resources]) assert.ok(findPath(w, w.civilization.settlements[0].center, p.position));
  assert.deepEqual(villageSize(w), {width:48,height:36});
  Simulation.load(JSON.stringify(w));
});

test('construction spends real local wood, rejects unaffordable builds and persists with exact continuation', () => {
  const w = new Simulation(42, 72).snapshot(), v = w.civilization.settlements[1];
  stocks(w, v.id).wood = 16; w.economy = createEconomy(w);
  const sim = Simulation.load(JSON.stringify(w));
  const id = sim.build(v.id, 'farm'), after = sim.snapshot();
  assert.equal(stocks(after,v.id).wood,0); assert.equal(after.storage.wood,w.storage.wood);
  assert.equal(after.buildings.find(b=>b.id===id)!.settlementId,v.id);
  assert.equal(after.events.at(-1)!.data.observer,true);
  assert.deepEqual(balance(after),{food:0,wood:0,coins:0});
  const save=sim.save(); assert.throws(()=>sim.build(v.id,'home'),/목재/); assert.equal(sim.save(),save);
  assert.throws(()=>sim.build('missing','home'),/마을/); assert.equal(sim.save(),save);
  const resumed=Simulation.load(save); sim.step(144); resumed.step(144); assert.equal(sim.save(),resumed.save());
});

test('server retries cannot double-build and reset keeps the previous world backup', async () => {
  const db=database(), env={ TEST_AUTH:'1', DB:db, ASSETS:{fetch:()=>new Response('asset')} } as never;
  const call=(path:string,body?:unknown)=>worker.fetch(new Request(`https://world.test/api/${path}`,body ? {method:'POST',headers:{Origin:'https://world.test','Content-Type':'application/json'},body:JSON.stringify(body)}:undefined),env);
  const w=await (await call('world')).json() as ReturnType<typeof initialWorld>;
  const cmd={id:crypto.randomUUID(),revision:w.revision,action:{type:'build',settlementId:'v0',kind:'home'}};
  assert.equal((await call('command',cmd)).status,200); assert.equal((await call('command',cmd)).status,200);
  const store=new WorldStore(db); await store.init(0); const saved=await store.read();
  assert.equal(saved.state.buildings.length,w.state.buildings.length+1); assert.equal(saved.state.storage.wood,0);
  assert.equal((await call('command',{...cmd,id:crypto.randomUUID(),revision:saved.revision})).status,400);
  const current=await store.read(); assert.equal(current.state.buildings.length,saved.state.buildings.length);
  assert.equal((await call('command',{id:crypto.randomUUID(),revision:current.revision,action:{type:'reset',seed:42,population:12}})).status,200);
  const backup=await (await call('export?backup=1')).json(); const restored=Simulation.load(JSON.stringify(backup));
  assert.equal(restored.snapshot().buildings.length,saved.state.buildings.length);
});

test('observation tasks use real counters, exclude donations and do not mutate the simulation', () => {
  const sim=new Simulation(); const before=sim.save(); const html=observationView(sim.snapshot());
  assert.match(html,/0\/3 충족/); assert.equal(sim.save(),before);
  sim.experiment('food'); assert.match(observationView(sim.snapshot()),/0 \/ 24개/);
  sim.step(144*3); const w=sim.snapshot();
  assert.ok(w.economy.totals.producedFood>0); assert.match(observationView(w),new RegExp(`${w.economy.totals.producedFood} / 24개`));
  assert.equal(observationView(Simulation.load(sim.save()).snapshot()),observationView(w));
});

test('legacy 32 by 24 saves keep their geography and continue without relocating residents', () => {
  const w = new Simulation(42).snapshot(), tiles=w.tiles;
  w.tiles=Array.from({length:32*24},(_,i)=>tiles[(Math.floor(i/32)+6)*48+i%32+8]);
  w.width=32; w.height=24; w.civilization.settlements[0].center={x:16,y:12};
  for(const o of [...w.buildings,...w.resources,...w.npcs]) { o.position.x-=8; o.position.y-=6; }
  const sim=Simulation.load(JSON.stringify(w));
  assert.deepEqual(villageSize(sim.snapshot()),{width:32,height:24});
  assert.deepEqual(sim.snapshot().npcs.map(n=>n.position),w.npcs.map(n=>n.position));
  const resumed=Simulation.load(sim.save()); sim.step(144); resumed.step(144);
  assert.equal(sim.save(),resumed.save()); assert.equal(sim.snapshot().width,32);
});

test('construction can use expanded outskirts when the original core has no building sites', () => {
  const w=new Simulation().snapshot(), v=w.civilization.settlements[0];
  for(let dy=-9;dy<=8;dy+=3) for(let dx=-10;dx<=10;dx+=3) w.tiles[(v.center.y+dy)*w.width+v.center.x+dx]='forest';
  const sim=Simulation.load(JSON.stringify(w)), id=sim.build('v0','home'), after=sim.snapshot();
  const p=after.buildings.find(b=>b.id===id)!.position;
  assert.ok(p.x<v.center.x-10 || p.x>v.center.x+10 || p.y<v.center.y-9 || p.y>v.center.y+8);
  assert.ok(findPath(after,v.center,p)); assert.deepEqual(balance(after),{food:0,wood:0,coins:0});
  Simulation.load(sim.save());
});
