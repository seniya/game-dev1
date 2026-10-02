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
  const db=database(), env={TEST_AUTH:'1',DB:db,ASSETS:{fetch:()=>new Response('asset')}} as never;
  const request=(path:string, body?:unknown)=>worker.fetch(new Request(`https://world.test/api/${path}`,body ? {method:'POST',headers:{Origin:'https://world.test','Content-Type':'application/json'},body:JSON.stringify(body)} : {}),env);
  const initial=await (await request('world')).json() as WorldView;
  const cmd:Command={id:crypto.randomUUID(),revision:initial.revision,action:{type:'create-character',character:defaultCharacter('b4')}};
  const response=await request('command',cmd); assert.equal(response.status,200); const created=await response.json() as WorldView, id=created.meta.createdCharacter!.npcId;
  assert.equal((await request('command',cmd)).status,200);
  assert.equal((await request('command',{...cmd,id:crypto.randomUUID()})).status,409);
  const bad={...cmd,id:crypto.randomUUID(),revision:created.revision,action:{type:'create-character',character:{...defaultCharacter('b4'),wealth:1001}}};
  assert.equal((await request('command',bad)).status,400);
  const store=new WorldStore(db); await store.init(Date.now()); const durable=await store.read();
  assert.equal(durable.state.npcs.length,13); assert.equal(durable.state.npcs.at(-1)!.id,id); assert.equal(durable.state.npcs.at(-1)!.profile!.commandId,cmd.id);
  const save=await (await request('export')).text(); assert.equal(Simulation.load(save).snapshot().npcs.at(-1)!.id,id);
  const events=await (await request(`events?npc=${id}&filter=life`)).json() as {events:{kind:string}[]}; assert.ok(events.events.some(e=>e.kind==='arrival'));
  const second=await request('command',{...cmd,id:crypto.randomUUID(),revision:created.revision}); assert.equal(second.status,200);
  const retried=await (await request('command',cmd)).json() as WorldView; assert.equal(retried.state.npcs.length,14);
  assert.equal(retried.state.npcs.find(n=>n.profile?.commandId===cmd.id)!.id,id,'a retry after another creation still identifies the original resident');
});

test('expanded appearance round trips without changing old profiles or allowing arbitrary SVG input',async()=>{
  const {appearanceSchema}=await import('../src/sim/character-schema');const {defaultCharacter,portrait,LOOK_PRESETS}=await import('../src/ui/characters');
  const {Simulation}=await import('../src/sim/engine');
  const sim=new Simulation(42);const input=defaultCharacter('b4');input.appearance={...input.appearance,...LOOK_PRESETS.starlight.appearance,hairstyle:'braid',faceMark:'freckles'};
  const id=sim.createCharacter(input);const restored=Simulation.load(sim.save());assert.deepEqual(restored.snapshot().npcs.find(n=>n.id===id)!.profile!.appearance,input.appearance);
  assert.match(portrait(input.appearance),/#323f60/);
  const old={skin:'#ebcba4',hair:'#5d5345',outfit:'#76b4a3',hairstyle:'short',accessory:'none'};
  assert.deepEqual(appearanceSchema.parse(old),old);
  assert.equal(appearanceSchema.safeParse({...input.appearance,accent:'url(javascript:bad)'}).success,false);
  assert.equal(appearanceSchema.safeParse({...input.appearance,hairstyle:'<script>'}).success,false);
});

test('creation budgets reject excess before mutation, preserve exact boundaries and include omitted defaults', async () => {
  const { characterSchema, creationBudgets } = await import('../src/sim/character-schema');
  const { START_PRESETS } = await import('../src/ui/characters');
  for (const p of Object.values(START_PRESETS)) {
    const { label, ...preset } = p, a = {...defaultCharacter('b4'),...preset};
    assert.equal(characterSchema.safeParse(a).success,true,label);
    assert.equal(creationBudgets(a)[0].used,200);
  }
  const bonds=defaultCharacter('b4');bonds.bonds=[{npcId:'a',familiarity:60},{npcId:'b',familiarity:60}];
  assert.equal(characterSchema.safeParse(bonds).success,true);
  bonds.bonds.push({npcId:'c',familiarity:1});assert.equal(characterSchema.safeParse(bonds).success,false);
  const sim=new Simulation(), before=sim.save();
  const badInputs = [
    {...defaultCharacter('b4'),skill:100,education:100},
    {...defaultCharacter('b4'),wealth:500},
    {...defaultCharacter('b4'),traits:{patience:100,optimism:100,frugality:100,independence:100}},
    {...defaultCharacter('b4'),desires:{security:100,belonging:100,comfort:100,mastery:100,prosperity:100,novelty:100}},
    {...defaultCharacter('b4'),needs:{hunger:0,thirst:0,fatigue:0,health:100,safety:100,social:100}},
  ];
  for (const a of badInputs) { assert.throws(()=>sim.createCharacter(a),/총합/);assert.equal(sim.save(),before); }
  const a=defaultCharacter('b4');a.skill=100;a.education=80;assert.equal(characterSchema.safeParse(a).success,true);
  a.skill++;assert.equal(characterSchema.safeParse(a).success,false);
  const omitted=defaultCharacter('b4');delete omitted.traits;delete omitted.desires;delete omitted.body;
  const id=sim.createCharacter(omitted);assert.deepEqual(sim.snapshot().living.people[id].traits,defaultCharacter('b4').traits);
});

test('starting bonds are reciprocal, evidenced, bounded, atomic and survive save/load continuation', () => {
  const sim=new Simulation();sim.setLLM(false);
  const first=sim.createCharacter(defaultCharacter('b4'));
  const a=defaultCharacter('b5');a.bonds=[{npcId:first,familiarity:60}];
  const before=sim.save();
  for (const bonds of [[{npcId:'npc0',familiarity:40}],[{npcId:first,familiarity:61}],[{npcId:first,familiarity:40},{npcId:first,familiarity:40}]]) {
    assert.throws(()=>sim.createCharacter({...a,bonds}));assert.equal(sim.save(),before);
  }
  const second=sim.createCharacter(a),w=sim.snapshot();
  for (const [id,other] of [[first,second],[second,first]]) {
    const n=w.npcs.find(n=>n.id===id)!,r=n.relationships.find(r=>r.npcId===other)!;
    assert.equal(r.familiarity,60);assert.equal(r.trust,55);assert.equal(r.affection,30);assert.equal(r.family,false);
    assert.ok(w.events.some(e=>r.evidence.includes(e.id)&&e.data.initialBond===true));
    assert.ok(n.memories.some(m=>m.relatedNpcIds.includes(other)));
  }
  const loaded=Simulation.load(sim.save());sim.step(144);loaded.step(144);assert.equal(sim.save(),loaded.save());
});

test('v0.28 pending progress and old unrestricted residents survive the new creation rules', async () => {
  const fingerprint='b72423936fb4e2138ccd35578ea2666b6226b5651f80f60f729c00bb362fda2f';
  const {retainedEngine}=await import('../src/server/engine-registry');
  const {LiveWorldStore}=await import('../src/server/live-store');
  const {LegacySimulation}=await retainedEngine(fingerprint)!();
  const DB=database(),store=new WorldStore(DB);await store.init(Date.now());const saved=await store.read();
  const sim=LegacySimulation.load(JSON.stringify(saved.state));sim.setLLM(false);
  const input=defaultCharacter('b4');input.skill=100;input.education=100;input.wealth=1000;
  sim.createCharacter(input);saved.state=sim.snapshot() as unknown as typeof saved.state;saved.meta.aiMode='off';saved.meta.eventCount=saved.state.events.length;
  await DB.batch([DB.prepare('DELETE FROM snapshots WHERE epoch=?').bind(saved.epoch),...store.snapshotStatements(saved.epoch,saved.state),DB.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);
  sim.step(60,undefined);const state=sim.snapshot() as unknown as typeof saved.state,old=new Set(saved.state.events.map(e=>e.id));
  const meta={...saved.meta,eventCount:saved.meta.eventCount+state.events.filter(e=>!old.has(e.id)).length};
  await DB.batch([DB.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:fingerprint,epoch:saved.epoch,ticks:60,meta,started:Date.now(),id:crypto.randomUUID()}))]);
  const recovered=await new LiveWorldStore(DB,'v029').read();
  assert.deepEqual(recovered.state,JSON.parse(JSON.stringify(compactWorld(state))));
  assert.equal(await DB.prepare('SELECT * FROM world_live').first(),null);
  Simulation.load(JSON.stringify(recovered.state));
});
