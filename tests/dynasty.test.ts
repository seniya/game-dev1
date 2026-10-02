import type { WorldState, WorldEvent } from '../src/sim/types';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { applyAmbition } from '../src/sim/ambition';
import { descendants, dynastyStats, deedsFromEvents, succeed, successorIds, type Dynasty } from '../src/sim/dynasty';
import { candidates } from '../src/sim/decision';
import { die } from '../src/sim/life';
import { appendEvent } from '../src/sim/social';
import { defaultCharacter } from '../src/ui/characters';
import { availableHomes } from '../src/sim/characters';
import { dynastyView } from '../src/ui/dynasty';
import { database } from './helpers/database';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { compactWorld } from '../src/server/world';
import { dynastyAPI } from '../src/server/dynasty';
import worker from '../src/server/worker';
import type { WorldView } from '../src/server/world';

const founder = (sim: Simulation) => sim.createCharacter({ ...defaultCharacter(availableHomes(sim.snapshot()).find(h => h.vacant)!.home.id), ambition: 'family' });
test('old saves stay balanced and chosen ambition persists through a save roundtrip', () => {
  const sim = new Simulation(42, 12), id = founder(sim);
  assert.equal(Simulation.load(sim.save()).snapshot().npcs.find(n => n.id === id)!.life.ambition, 'family');
  sim.setAmbition(id, 'wealth'); const n = Simulation.load(sim.save()).snapshot().npcs.find(n => n.id === id)!;
  assert.equal(n.life.ambition, 'wealth'); assert.equal(sim.snapshot().npcs[0].life.ambition, undefined);
  assert.throws(() => sim.setAmbition('missing', 'family'));
});
test('ambitions adjust only existing eligible actions and yield to urgent survival', () => {
  const w = new Simulation(42, 12).snapshot(), n = w.npcs[0];
  const baseline = candidates(w, n);
  n.life.ambition = 'wealth'; n.needs.hunger = n.needs.thirst = n.needs.fatigue = 10; n.needs.health = 100;
  const list = structuredClone(baseline); applyAmbition(w, n, list);
  assert.equal(list.length, baseline.length);
  assert.ok(list.some((c, i) => c.score > baseline[i].score));
  for (const c of list.filter(c => ['Eat','Drink','Sleep','Borrow','Theft'].includes(c.kind))) assert.equal(c.score, baseline.find(b => b.kind === c.kind && b.targetId === c.targetId)!.score);
  for (const need of ['hunger','thirst','fatigue'] as const) { n.needs[need] = 75; const urgent = structuredClone(baseline); applyAmbition(w, n, urgent); assert.deepEqual(urgent, baseline); n.needs[need] = 10; }
  n.needs.health = 40; const urgent = structuredClone(baseline); applyAmbition(w, n, urgent); assert.deepEqual(urgent, baseline);
});
test('lineage deduplicates a shared descendant; spouses and joint home shares are not overcounted', () => {
  const w = new Simulation(42, 12).snapshot(), [root, a, b, c, spouse] = w.npcs;
  a.life.parentIds = [root.id]; b.life.parentIds = [root.id]; c.life.parentIds = [a.id, b.id];
  a.life.generation = b.life.generation = 1; c.life.generation = 2;
  root.life.partnerId = spouse.id;
  root.wealth = a.wealth = b.wealth = c.wealth = 10; spouse.wealth = 1000;
  w.buildings.forEach(h => h.ownerIds = []); w.buildings.find(h => h.kind === 'home')!.ownerIds = [root.id, spouse.id];
  const stats = dynastyStats(w, root.id, root.id);
  assert.equal(descendants(w, root.id).size, 4); assert.equal(stats.descendants, 3); assert.equal(stats.generations, 3); assert.equal(stats.coins, 40); assert.equal(stats.homeShares, .5);
});
test('succession requires death and a living descendant and never transfers assets again', () => {
  const w = new Simulation(42, 12).snapshot(), [root, child, stranger] = w.npcs;
  child.life.parentIds = [root.id]; child.life.generation = 1;
  const d: Dynasty = { root: root.id, active: root.id, revision: 0, chain: [{ npc: root.id, tick: 0 }] };
  assert.deepEqual(successorIds(w, d), []); assert.throws(() => succeed(w, d, child.id));
  die(w, root, 'age'); const before = structuredClone(w);
  assert.throws(() => succeed(w, d, stranger.id)); const next = succeed(w, d, child.id);
  assert.equal(next.active, child.id); assert.equal(next.revision, 1); assert.deepEqual(w, before); assert.equal(next.chain.length, 2);
  child.alive = false; assert.deepEqual(successorIds(w, d), []);
});
test('deeds credit givers and teachers, actual construction work, and exclude observer interventions', () => {
  const w = new Simulation(42, 12).snapshot(), [a, b] = w.npcs;
  w.events = [];
  for (const e of [
    {kind:'share',actorId:a.id,targetId:b.id,data:{}}, {kind:'education',actorId:b.id,targetId:a.id,data:{}},
    {kind:'project',actorId:a.id,data:{}}, {kind:'project',actorId:a.id,data:{observer:true}},
    {kind:'construction',actorId:a.id,data:{phase:'assigned'}}, {kind:'construction',actorId:a.id,data:{phase:'worked'}},
  ] as const) appendEvent(w, {...e, data:e.data as WorldEvent['data'], description:'근거', importance:40});
  assert.deepEqual(deedsFromEvents(w.events,new Set([a.id])), {shares:1,teaching:1,improvements:1,labor:1});
  assert.deepEqual(deedsFromEvents(w.events,new Set([b.id])), {shares:0,teaching:0,improvements:0,labor:0});
});
function harness() {
  const DB=database(), env={DB,SITE_OWNER_EMAIL:'owner@example.test',ASSETS:{fetch:()=>new Response('asset')}} as never;
  const call=(who:string,path:string,body?:unknown)=>worker.fetch(new Request(`https://world.test/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':`${who}@example.test`,Origin:'https://world.test','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  const world=async()=>await(await call('owner','world')).json() as WorldView;
  const create=async(who:string)=>{const w=await world();const result=await call(who,'command',{id:crypto.randomUUID(),revision:w.revision,action:{type:'create-character',character:defaultCharacter(availableHomes(w.state).find(h=>h.vacant)!.home.id)}});assert.equal(result.status,200);return await result.json() as WorldView;};
  return {DB,call,world,create};
}
test('per-account roots, selection persistence, malformed requests, stale worlds and owner-only priority',async()=>{
  const h=harness();const w=await h.create('guest'),root=w.meta.createdCharacter!.npcId;
  const found={type:'found',epoch:w.epoch,root};
  assert.equal((await h.call('other','dynasty',found)).status,403);
  assert.equal((await h.call('guest','dynasty',{...found,member:'owner'})).status,400);
  assert.equal((await h.call('guest','dynasty',{...found,epoch:'stale'})).status,409);
  let response=await h.call('guest','dynasty',found);assert.equal(response.status,200);let view=await response.json();
  assert.equal(view.dynasty.active,root); assert.equal(view.openingCoins,20);assert.equal(view.stats.coins,20);
  response=await h.call('guest','dynasty');view=await response.json();assert.equal(view.dynasty.root,root);
  assert.equal((await (await h.call('other','dynasty')).json()).dynasty,null);
  assert.equal((await h.call('other',`dynasty?root=${root}`)).status,403);
  assert.equal((await h.call('guest','command',{id:crypto.randomUUID(),revision:w.revision,action:{type:'ambition',npcId:root,focus:'wealth'}})).status,403);
  assert.equal((await h.call('owner','command',{id:crypto.randomUUID(),revision:w.revision,action:{type:'ambition',npcId:root,focus:'wealth'}})).status,200);
  assert.equal((await h.world()).state.npcs.find(n=>n.id===root)!.life.ambition,'wealth');
  assert.equal((await h.call('guest','dynasty',{type:'succeed',epoch:w.epoch,root,npc:root,revision:0})).status,400);
  await h.call('owner','members',{id:'guest',blocked:true});assert.equal((await h.call('guest','dynasty')).status,403);
});
test('server metrics use the entire archive after compacting and match local attribution',async()=>{
  const h=harness();let world=await h.create('guest');const id=world.meta.createdCharacter!.npcId;
  await h.call('guest','dynasty',{type:'found',epoch:world.epoch,root:id});
  const store=new WorldStore(h.DB);world=await store.read(); const old=world.meta.eventCount;
  for(let i=0;i<105;i++)appendEvent(world.state,{kind:'share',actorId:id,targetId:'npc0',description:'식량 나눔',importance:60,data:{amount:1}});
  const events=world.state.events.slice(-105); world.meta.eventCount=old+105;world.revision++;
  await store.commit(world,events,'test',crypto.randomUUID());
  const expected = deedsFromEvents(world.state.events,new Set([id]));
  world.state=compactWorld(world.state);
  const v=await dynastyAPI(store,{id:'guest',name:'guest',email:'guest@example.test',role:'participant',blocked:0},world);
  assert.equal(v.deeds!.shares,105);assert.equal(v.history!.length,12);assert.equal(v.openingCoins,20);
  assert.deepEqual({...v.deeds},expected);
});
test('succession is atomic, rejects stale requests, and preserves assets and existing heirs',async()=>{
  const h=harness();let world=await h.create('guest');const root=world.meta.createdCharacter!.npcId;
  await h.call('guest','dynasty',{type:'found',epoch:world.epoch,root});
  const store=new WorldStore(h.DB); world=await store.read();
  const child=world.state.npcs[0]; child.life.parentIds=[root];child.life.generation=1;child.life.bornTick=world.state.npcs.find(n=>n.id===root)!.life.bornTick+144;child.identity.age=23;
  const previousIds=new Set(world.state.events.map(e=>e.id));die(world.state,world.state.npcs.find(n=>n.id===root)!,'age');
  const events=world.state.events.filter(e=>!previousIds.has(e.id));world.meta.eventCount+=events.length;world.revision++;
  await store.commit(world,events,'test',crypto.randomUUID());
  const input={type:'succeed',epoch:world.epoch,root,npc:child.id,revision:0};
  const response=await h.call('guest','dynasty',input);assert.equal(response.status,200,await response.clone().text());
  assert.equal((await response.json()).dynasty.active,child.id);assert.equal((await h.call('guest','dynasty',input)).status,409);
  const after=await h.world();assert.deepEqual(after.state.npcs.map(n=>n.wealth),world.state.npcs.map(n=>n.wealth));
  assert.equal((await h.DB.prepare('SELECT * FROM world_live').first()),null);
});
test('dashboard escapes names and empty state offers an avatar without making claims',()=>{
  const html=dynastyView({epoch:'test',tick:0,roots:[{id:'x',name:'<script>bad</script>',alive:true}],dynasty:null},false);
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  assert.ok(dynastyView({epoch:'test',tick:0,roots:[],dynasty:null},false).includes('첫 아바타 만들기'));
});
test('uncommitted death and inheritance are confirmed atomically with the chosen successor', async()=>{
  const { formFamily, giveBirth } = await import('../src/sim/life');
  const { relationship } = await import('../src/sim/social');
  const { YEAR_TICKS } = await import('../src/sim/types');
  const h=harness();let world=await h.create('guest');const root=world.meta.createdCharacter!.npcId;
  await h.call('guest','dynasty',{type:'found',epoch:world.epoch,root});
  const store=new WorldStore(h.DB);world=await store.read();const w=world.state,now=Date.now();
  const a=w.npcs.find(n=>n.id===root)!,b=w.npcs[0];w.tick=YEAR_TICKS*2+36;
  for(const n of [a,b]){n.identity.age=25;n.life.bornTick=w.tick-25*YEAR_TICKS;n.needs.health=100;n.needs.hunger=10;}
  for(const [n,p] of [[a,b],[b,a]]){const r=relationship(n,p.id);r.trust=80;r.affection=40;}
  assert.equal(formFamily(w,a,b),true);const child=giveBirth(w,a,b)!;assert.ok(child);
  w.tick=YEAR_TICKS*2+143;a.life.bornTick=w.tick+1-85*YEAR_TICKS;a.identity.age=84;
  w.llm.enabled=false;world.meta.aiMode='off';world.meta.running=true;world.meta.clock=world.meta.lastSeen=now;
  const baseIds=new Set((await store.read()).state.events.map(e=>e.id));const events=w.events.filter(e=>!baseIds.has(e.id));world.meta.eventCount+=events.length;world.revision++;
  await store.commit(world,events,'fixture',crypto.randomUUID());
  const live=new LiveWorldStore(h.DB);const current=await live.read();const next=await live.sync({id:crypto.randomUUID(),revision:current.revision,action:{type:'sync'}},now+700);
  assert.equal(next.world.state.npcs.find(n=>n.id===root)!.alive,false);assert.ok(await h.DB.prepare('SELECT * FROM world_live').first());
  const member={id:'guest',name:'guest',email:'guest@example.test',role:'participant' as const,blocked:0};
  const view=await dynastyAPI(live,member,next.world);assert.ok(view.successors!.includes(child.id));assert.ok(view.estateCoins!==null);
  assert.ok(view.history!.some(e=>e.kind==='death'));const coins=next.world.state.npcs.map(n=>n.wealth);
  const selected=await dynastyAPI(live,member,next.world,undefined,{type:'succeed',epoch:world.epoch,root,npc:child.id,revision:0});
  assert.equal(selected.active!.id,child.id);assert.equal(await h.DB.prepare('SELECT * FROM world_live').first(),null);
  const restored=await new LiveWorldStore(h.DB).read();assert.deepEqual(restored.state.npcs.map(n=>n.wealth),coins);assert.equal(restored.state.npcs.find(n=>n.id===root)!.alive,false);
});
test('exact published v0.26 engine preserves pending progress before applying ambitions',async()=>{
  const fingerprint='ee5ec959c1be45675e159dd692f908d5cba2057c7789e5b85c8fe6e345aeb889';
  const { retainedEngine }=await import('../src/server/engine-registry');const {LegacySimulation}=await retainedEngine(fingerprint)!();
  const db=database(),store=new WorldStore(db);await store.init(Date.now());const saved=await store.read();
  const sim=new LegacySimulation(saved.state.seed, 12);sim.setLLM(false);saved.state=sim.snapshot() as unknown as WorldState;saved.meta.aiMode='off';
  await db.batch([db.prepare('DELETE FROM snapshots WHERE epoch=?').bind(saved.epoch),...store.snapshotStatements(saved.epoch,saved.state),db.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);
  sim.step(60,undefined);const state=sim.snapshot() as unknown as WorldState,ids=new Set(saved.state.events.map(e=>e.id)),events=state.events.filter((e:{id:string})=>!ids.has(e.id));
  const meta={...saved.meta,eventCount:saved.meta.eventCount+events.length};
  await db.batch([db.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:fingerprint,epoch:saved.epoch,ticks:60,meta,started:Date.now(),id:crypto.randomUUID()}))]);
  const restored=await new LiveWorldStore(db,'v027').read();assert.deepEqual(restored.state,JSON.parse(JSON.stringify(compactWorld(state))));assert.equal(restored.revision,saved.revision+1);assert.equal(await db.prepare('SELECT * FROM world_live').first(),null);
});
test('replacing a world keeps only current and previous dynasty records',async()=>{
  const h=harness();const first=await h.create('guest'),root=first.meta.createdCharacter!.npcId;
  await h.call('guest','dynasty',{type:'found',epoch:first.epoch,root});
  const reset=async(seed:number)=>{const w=await h.world();const response=await h.call('owner','command',{id:crypto.randomUUID(),revision:w.revision,action:{type:'reset',seed,population:12}});assert.equal(response.status,200);};
  await reset(7);assert.equal((await (await h.call('guest','dynasty')).json()).dynasty,null);
  assert.ok(await h.DB.prepare('SELECT root FROM dynasties WHERE epoch=?').bind(first.epoch).first());
  await reset(123);assert.equal(await h.DB.prepare('SELECT root FROM dynasties WHERE epoch=?').bind(first.epoch).first(),null);
  assert.equal(await h.DB.prepare('SELECT root FROM dynasty_selection WHERE epoch=?').bind(first.epoch).first(),null);
});
