import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { balance, holdings } from '../src/sim/economy';
import { availableHomes } from '../src/sim/characters';
import { defaultCharacter, portrait, appearance } from '../src/ui/characters';
import { compactWorld, type WorldView, type Command } from '../src/server/world';
import { WorldStore } from '../src/server/store';
import worker from '../src/server/worker';
import { database } from './helpers/database';

test('custom residents enter with configured attributes, appearance and separately accounted assets', () => {
  const sim = new Simulation(42), before = sim.snapshot(), assets = holdings(before);
  const input = defaultCharacter('b4'); input.name = '도시의 새이웃'; input.background = '<script>이야기</script>'; input.occupation = 'carpenter'; input.skills.smith = 77; input.wealth = 250; input.wood = 30;
  const id = sim.createCharacter(input), w = sim.snapshot(), n = w.npcs.find(n => n.id === id)!;
  assert.equal(w.npcs.length, before.npcs.length + 1); assert.equal(n.identity.name,input.name); assert.equal(n.occupation, 'carpenter');
  assert.deepEqual(n.personality,input.personality); assert.deepEqual(n.needs,input.needs); assert.deepEqual(n.profile!.appearance,input.appearance);
  assert.equal(w.urban.citizens[id].skills.smith,77); assert.equal(w.urban.citizens[id].education,input.education);
  assert.deepEqual(w.economy.arrivals,{ food:3,wood:30,coins:250 });
  assert.deepEqual(holdings(w),{ food: assets.food+3,wood:assets.wood+30,coins:assets.coins+250 });
  assert.deepEqual(balance(w),{food:0,wood:0,coins:0}); assert.equal(w.economy.openingCoins,before.economy.openingCoins);
  assert.equal(n.relationships.length,0); assert.equal(n.life.bornTick,w.tick-input.age*1728);
  assert.ok(w.events.some(e=>e.id===n.profile!.arrivalEventId && e.data.createdCharacter===true));
  assert.equal(Simulation.load(sim.save()).save(),sim.save());
});

test('invalid input and full or invalid housing are atomic; pending migrants reserve capacity', () => {
  const sim = new Simulation(42), before=sim.save(), a=defaultCharacter('b4');
  for (const bad of [{...a,name:'   '},{...a,health:80},{...a,needs:{...a.needs,health:0}},{...a,wealth:-1},{...a,age:81},{...a,appearance:{...a.appearance,outfit:'red" onload="alert(1)'}},{...a,homeId:'b0'},{...a,greetId:'missing'}]) {
    assert.throws(()=>sim.createCharacter(bad)); assert.equal(sim.save(),before);
  }
  sim.createCharacter(a); sim.createCharacter(a); const full=sim.save(); assert.throws(()=>sim.createCharacter(a),/빈자리/); assert.equal(sim.save(),full);
  const w = new Simulation().snapshot(); w.civilization.journeys.push({id:'reservation',kind:'migration',from:'v1',to:'v0',npcIds:['a','b'],path:[],progress:0,food:0,coins:0,sourceEventId:'pending',homeId:'b4'});
  assert.equal(availableHomes(w).find(h=>h.home.id==='b4')!.vacant,0);
});

test('greetings use real movement and produce grounded reciprocal relationships without a model', () => {
  const sim = new Simulation(42); sim.setLLM(false);
  const a=defaultCharacter('b4'); a.greetId='npc0';
  const id=sim.createCharacter(a);
  assert.equal(sim.snapshot().npcs.find(n=>n.id===id)!.relationships.length,0);
  for(let i=0;i<144;i++) sim.step();
  const w=sim.snapshot(), talks=w.events.filter(e=>e.kind==='talk' && e.participants.includes(id));
  assert.ok(talks.length>0,'new resident must actually interact');
  const n=w.npcs.find(n=>n.id===id)!; assert.ok(n.relationships.some(r=>r.evidence.some(id=>talks.some(t=>t.id===id))));
  assert.deepEqual(balance(w),{food:0,wood:0,coins:0}); assert.equal(w.llm.requested,0); Simulation.load(sim.save());
});

test('custom profiles survive compaction, save/load, deterministic continuation and aging', () => {
  const a=new Simulation(7); a.setLLM(false); const input=defaultCharacter('b4'); input.age=64;
  const id=a.createCharacter(input); a.step(144);
  const b=Simulation.load(JSON.stringify(compactWorld(a.snapshot()))); a.step(144); b.step(144);
  const wa=a.snapshot(), wb=b.snapshot();
  assert.deepEqual(wa.npcs,wb.npcs); assert.deepEqual(balance(wb),{food:0,wood:0,coins:0});
  assert.equal(wb.npcs.find(n=>n.id===id)!.identity.age,64);
  const profile=wb.npcs.find(n=>n.id===id)!.profile!; assert.ok(wb.events.some(e=>e.id===profile.arrivalEventId));
  const forged=structuredClone(wb); forged.npcs.find(n=>n.id===id)!.profile!.arrivalEventId=wb.events.find(e=>e.kind!=='arrival')!.id;
  assert.throws(()=>Simulation.load(JSON.stringify(forged)),/생성 주민 출처/);
});

test('large cities accept residents into actual housing and reject the global population cap', () => {
  const sim=new Simulation(42,1000), a=defaultCharacter(availableHomes(sim.snapshot()).find(h=>h.vacant>0 && h.home.settlementId==='v3')!.home.id);
  const id=sim.createCharacter(a); assert.equal(sim.snapshot().npcs.find(n=>n.id===id)!.settlementId,'v3'); sim.step(4); Simulation.load(sim.save());
  const full=new Simulation(42,3000), before=full.save(); assert.throws(()=>full.createCharacter(defaultCharacter('b4')),/上限|상한/); assert.equal(full.save(),before);
});

test('legacy residents retain deterministic colors and all appearance variants have a portrait', () => {
  const n=new Simulation().snapshot().npcs[0]; assert.equal(appearance(n).outfit,'#e5a85f');
  for (const hairstyle of ['short','long','curly','bald'] as const) for(const accessory of ['none','glasses','hat'] as const) assert.ok(portrait({...appearance(n),hairstyle,accessory}).includes('<svg'));
});

test('server creation persists through restart and export; retries, stale revisions and invalid input cannot duplicate a resident', async () => {
  const db=database(), env={DB:db,ASSETS:{fetch:()=>new Response('asset')}} as never;
  const request=(path:string, body?:unknown)=>worker.fetch(new Request(`https://world.test/api/${path}`,body ? {method:'POST',headers:{Origin:'https://world.test','Content-Type':'application/json'},body:JSON.stringify(body)} : {}),env);
  const initial=await (await request('world')).json() as WorldView;
  const cmd:Command={id:crypto.randomUUID(),revision:initial.revision,action:{type:'create-character',character:defaultCharacter('b4')}};
  const response=await request('command',cmd); assert.equal(response.status,200); const created=await response.json() as WorldView, id=created.meta.createdCharacter!.npcId;
  assert.equal((await request('command',cmd)).status,200);
  assert.equal((await request('command',{...cmd,id:crypto.randomUUID()})).status,409);
  const bad={...cmd,id:crypto.randomUUID(),revision:created.revision,action:{type:'create-character',character:{...defaultCharacter('b4'),wealth:1001}}};
  assert.equal((await request('command',bad)).status,400);
  const store=new WorldStore(db); await store.init(Date.now()); const durable=await store.read();
  assert.equal(durable.state.npcs.length,101); assert.equal(durable.state.npcs.at(-1)!.id,id); assert.equal(durable.state.npcs.at(-1)!.profile!.commandId,cmd.id);
  const save=await (await request('export')).text(); assert.equal(Simulation.load(save).snapshot().npcs.at(-1)!.id,id);
  const events=await (await request(`events?npc=${id}&filter=life`)).json() as {events:{kind:string}[]}; assert.ok(events.events.some(e=>e.kind==='arrival'));
  const second=await request('command',{...cmd,id:crypto.randomUUID(),revision:created.revision}); assert.equal(second.status,200);
  const retried=await (await request('command',cmd)).json() as WorldView; assert.equal(retried.state.npcs.length,102);
  assert.equal(retried.state.npcs.find(n=>n.profile?.commandId===cmd.id)!.id,id,'a retry after another creation still identifies the original resident');
});
