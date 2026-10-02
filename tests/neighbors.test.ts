import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { appendEvent, changeRelationship, relationship } from '../src/sim/social';
import { localNeighbors, localLegacyGoals } from '../src/sim/neighbors';
import { readNeighbors, readLegacyGoals } from '../src/server/neighbors';
import { neighborsView } from '../src/ui/neighbors';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { compactWorld } from '../src/server/world';
import { database } from './helpers/database';
import { buildEnterprise, initializeUrban, industryWork } from '../src/sim/urban';
import { acquireBusiness, inheritBusinesses } from '../src/sim/family-enterprise';
import { balance } from '../src/sim/economy';
import { applyCommand } from '../src/server/world';
import worker from '../src/server/worker';
import type { WorldState } from '../src/sim/types';

test('directional relationship turns use hysteresis, cooldown, actual changes and survive saves',()=>{
  let w=new Simulation().snapshot();const [a,b]=w.npcs,r=relationship(a,b.id);
  Object.assign(r,{trust:59,affection:24,familiarity:29,resentment:0});
  const cause=appendEvent(w,{kind:'share',actorId:b.id,targetId:a.id,importance:45,description:'도움을 받았다'});
  changeRelationship(w,a,b.id,{trust:2,affection:2,familiarity:2},cause,'가까워짐');
  assert.equal(w.events.at(-1)!.data.turn,'close');assert.equal(r.turn!.stage,'close');
  assert.equal(w.npcs[1].relationships.find(r=>r.npcId===a.id)?.turn,undefined);
  changeRelationship(w,a,b.id,{trust:-1},cause,'작은 등락');assert.equal(w.events.at(-1)!.data.turn,undefined);
  w=Simulation.load(JSON.stringify(compactWorld(w))).snapshot();const aa=w.npcs[0];
  changeRelationship(w,aa,b.id,{trust:-80,resentment:70},cause,'갈등');assert.equal(w.events.at(-1)!.data.turn,undefined);
  w.tick+=432;changeRelationship(w,aa,b.id,{resentment:1},cause,'갈등 지속');assert.equal(w.events.at(-1)!.data.turn,'conflict');
  w.tick+=432;changeRelationship(w,aa,b.id,{trust:41,resentment:-60},cause,'실제 회복');assert.equal(w.events.at(-1)!.data.turn,'reconciled');
  assert.ok(Simulation.load(JSON.stringify(compactWorld(w))));
  aa.relationships.find(r=>r.npcId===b.id)!.turn!.lastTick=w.tick+1;assert.throws(()=>Simulation.load(JSON.stringify(w)));
});
test('initial bonds, owner intervention, unchanged scores and old saves produce no invented turning point',()=>{
  for(const data of [{initialBond:true},{observer:true}] as Record<string,boolean>[]){const w=new Simulation().snapshot(),[a,b]=w.npcs,r=relationship(a,b.id);Object.assign(r,{trust:59,affection:30,familiarity:40});
    const e=appendEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,importance:55,description:'설정',data});changeRelationship(w,a,b.id,{trust:5},e,'설정');assert.equal(w.events.at(-1)!.data.turn,undefined);}
  const w=new Simulation().snapshot(),[a,b]=w.npcs,e=appendEvent(w,{kind:'talk',actorId:a.id,targetId:b.id,importance:30,description:'대화'});
  changeRelationship(w,a,b.id,{},e,'그대로');assert.equal(w.events.at(-1)!.data.turn,undefined);assert.ok(Simulation.load(JSON.stringify(w)));
});

async function archived(w:WorldState){
  const DB=database(),store=new WorldStore(DB);await store.init(Date.now());const old=await store.read();
  const saved={...old,state:w,revision:old.revision+1,meta:{...old.meta,eventCount:w.events.length,aiMode:'off' as const}};
  await store.commit(saved,w.events,'fixture',crypto.randomUUID());
  await DB.batch([DB.prepare("INSERT INTO world_members(id,email,name,role,blocked) VALUES('guest','guest@test','guest','participant',0)"),...w.npcs.slice(0,3).map((n,i)=>DB.prepare("INSERT INTO npc_creators(epoch,npc,member,command) VALUES(?,?,'guest',?)").bind(saved.epoch,n.id,`fixture-${i}`))]);
  return {DB,store,saved,member:{id:'guest',email:'guest@test',name:'guest',role:'participant' as const,blocked:0}};
}
test('joint goals require completed activity and distinct owned laborers; archive and local agree without writes',async()=>{
  const w=new Simulation().snapshot(),[a,b,other]=w.npcs,ids=new Set([a.id,b.id]);
  const event=(kind:'gathering'|'construction',data:Record<string,string>,participants=[a.id,b.id],actorId?:string)=>appendEvent(w,{kind,participants,actorId,importance:45,description:'활동 기록',data});
  event('gathering',{phase:'proposed',gatheringKind:'meal'});event('gathering',{phase:'completed',gatheringKind:'harvest'},[a.id,other.id]);
  event('construction',{phase:'worked',projectId:'p'},[a.id],a.id);event('construction',{phase:'worked',projectId:'p'},[a.id],a.id);
  event('construction',{phase:'completed',projectId:'p'},[]);
  assert.ok(localNeighbors(w,'x',ids).goals.every(g=>!g.evidence));
  const meal=event('gathering',{phase:'completed',gatheringKind:'meal'}),harvest=event('gathering',{phase:'completed',gatheringKind:'harvest'});
  event('construction',{phase:'worked',projectId:'second'},[a.id],a.id);event('construction',{phase:'worked',projectId:'second'},[b.id],b.id);
  const built=event('construction',{phase:'completed',projectId:'second'},[]);
  const local=localNeighbors(w,'x',ids);assert.deepEqual(local.goals.map(g=>g.evidence?.id),[meal.id,harvest.id,built.id]);
  const {DB,store,saved,member}=await archived(w);await DB.batch([DB.prepare('DELETE FROM npc_creators WHERE npc=?').bind(other.id)]);
  const before=JSON.stringify(await store.read());const actual=await readNeighbors(store,member,{...saved,state:compactWorld(w)});
  assert.deepEqual(JSON.parse(JSON.stringify(actual.goals)),JSON.parse(JSON.stringify(local.goals)));assert.equal(JSON.stringify(await store.read()),before);
  const outsider=await readNeighbors(store,{...member,id:'other'},saved);assert.equal(outsider.people.length,0);assert.ok(outsider.goals.every(g=>!g.evidence));
});
test('relationship archive pages retain watermark, exclude other accounts and reject stale epochs',async()=>{
  const w=new Simulation().snapshot(),[a,b,c]=w.npcs;
  for(let i=0;i<25;i++)appendEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,importance:55,description:`순간 ${i}`,data:{turn:'close'}});
  const {DB,store,saved,member}=await archived(w);await DB.batch([DB.prepare('DELETE FROM npc_creators WHERE npc=?').bind(c.id)]);
  const first=await readNeighbors(store,member,saved);assert.equal(first.turns.length,20);assert.ok(first.next);
  const params=new URLSearchParams({epoch:saved.epoch,before:String(first.next),through:String(first.through)});
  const second=await readNeighbors(store,member,saved,params);assert.equal(second.turns.length,5);assert.equal(second.next,null);assert.equal(new Set([...first.turns,...second.turns].map(e=>e.id)).size,25);
  await assert.rejects(()=>readNeighbors(store,member,saved,new URLSearchParams({epoch:'other'})));
  await assert.rejects(()=>readNeighbors(store,member,saved,new URLSearchParams({through:'999999'})));
  await assert.rejects(()=>readNeighbors(store,member,saved,new URLSearchParams({before:'-1'})));
});
test('business goals require owned net profit, real shared inheritance and adult successor production',async()=>{
  const w=new Simulation().snapshot(),[n,child,spouse]=w.npcs;
  const extra=100-n.wealth;w.market.coins-=extra;n.wealth+=extra;n.needs.health=100;n.needs.hunger=10;
  const e=buildEnterprise(w,n.settlementId,'field')!;initializeUrban(w);e.workers=[n.id];w.urban.citizens[n.id].employer=e.id;
  n.position={...w.buildings.find(b=>b.id===e.buildingId)!.position};w.buildings.find(b=>b.id===e.buildingId)!.growth=100;
  acquireBusiness(w,n.id,e.id);assert.ok(localLegacyGoals(w,n.id).every(g=>!g.evidence));
  industryWork(w,n);assert.ok(localLegacyGoals(w,n.id)[0].evidence);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
  child.life.parentIds=[n.id];inheritBusinesses(w,n,[child,spouse],e.business!.source);assert.ok(localLegacyGoals(w,n.id)[1].evidence);
  child.identity.age=18;child.life.apprenticeship={mentor:n.id,enterprise:e.id,kind:e.kind,lessons:10,lastTick:0,source:e.business!.source,choice:'continue'};
  assert.equal(localLegacyGoals(w,n.id)[2].evidence,undefined);
  child.position={...n.position};child.needs.health=100;e.workers=[child.id];w.urban.citizens[child.id].employer=e.id;w.buildings.find(b=>b.id===e.buildingId)!.growth=100;industryWork(w,child);
  assert.ok(localLegacyGoals(w,n.id)[2].evidence);
  const {store,saved}=await archived(w);assert.deepEqual(await readLegacyGoals(store,saved,n.id),localLegacyGoals(w,n.id));
  e.business!.costs+=100;e.business!.revenue+=100;assert.ok(localLegacyGoals(w,n.id)[0].evidence);
});
test('neighbor UI escapes names, presents both directions and never offers follow for a deceased resident',()=>{
  const w=new Simulation().snapshot(),[a,b]=w.npcs;a.identity.name='<img onerror=alert(1)>';a.alive=false;relationship(a,b.id);relationship(b,a.id);
  const html=neighborsView(localNeighbors(w,'x',new Set([a.id,b.id])));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(!html.includes(`data-neighbor-follow="${a.id}"`));assert.ok(html.includes(`data-neighbor-follow="${b.id}"`));assert.equal((html.match(/→/g)??[]).length,2);
});
test('published v0.29 pending engine recovery preserves its exact rules before new observations',async()=>{
  const {retainedEngine}=await import('../src/server/engine-registry');const fingerprint='b79ef7087a7d3968323946322c6159038f3c99602fa0bec4b74df6dc901ebea7';
  const {LegacySimulation}=await retainedEngine(fingerprint)!();const DB=database(),store=new WorldStore(DB);await store.init(Date.now());const saved=await store.read();
  const sim=LegacySimulation.load(JSON.stringify(saved.state));sim.setLLM(false);saved.state=sim.snapshot() as unknown as WorldState;saved.meta.aiMode='off';
  await DB.batch([DB.prepare('DELETE FROM snapshots WHERE epoch=?').bind(saved.epoch),...store.snapshotStatements(saved.epoch,saved.state),DB.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);
  sim.step(60,undefined);const state=sim.snapshot() as unknown as WorldState,old=new Set(saved.state.events.map(e=>e.id)),count=state.events.filter(e=>!old.has(e.id)).length;
  await DB.batch([DB.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:fingerprint,epoch:saved.epoch,ticks:60,meta:{...saved.meta,eventCount:saved.meta.eventCount+count},started:Date.now(),id:crypto.randomUUID()}))]);
  const recovered=await new LiveWorldStore(DB,'v030').read();assert.deepEqual(recovered.state,JSON.parse(JSON.stringify(compactWorld(state))));assert.equal(await DB.prepare('SELECT * FROM world_live').first(),null);
});

test('live event overlay yields the same goals as complete history without an observation write',async()=>{
  const w=new Simulation().snapshot();w.llm.enabled=false;
  const {DB,member}=await archived(w),store=new LiveWorldStore(DB,'neighbors-live'),now=Date.now();
  let current=await store.read();
  const c={id:crypto.randomUUID(),revision:current.revision,action:{type:'play',running:true} as const};
  const next=await applyCommand(current,c,now);await store.commit(next.world,next.events,c.id,c.id,[],{action:c.action,at:now});
  current=(await store.sync({id:crypto.randomUUID(),revision:next.world.revision,action:{type:'sync'}},now+30_000)).world;
  assert.ok(current.live);const full=await store.export(current.epoch),before=JSON.stringify(await DB.prepare('SELECT * FROM world_live').all());
  const server=await readNeighbors(store,member,current),local=localNeighbors(full,current.epoch,new Set(w.npcs.slice(0,3).map(n=>n.id)));
  assert.deepEqual(JSON.parse(JSON.stringify(server.goals)),JSON.parse(JSON.stringify(local.goals)));
  assert.deepEqual(server.turns,local.turns);assert.equal(JSON.stringify(await DB.prepare('SELECT * FROM world_live').all()),before);
});

test('neighbor route requires invited identity, denies blocked members and ignores forged owner filters',async()=>{
  const {DB,saved,member}=await archived(new Simulation().snapshot());
  const env={DB,SITE_OWNER_EMAIL:'owner@test',ASSETS:{fetch:()=>new Response('asset')}} as never;
  const call=(path:string,headers:Record<string,string>={})=>worker.fetch(new Request(`https://world.test${path}`,{headers}),env);
  assert.equal((await call('/api/neighbors')).status,401);
  const headers={'oai-authenticated-user-id':member.id,'oai-authenticated-user-email':member.email};
  const r=await call('/api/neighbors?member=someone-else',headers);assert.equal(r.status,200);assert.equal(((await r.json()) as {people:unknown[]}).people.length,3);
  assert.equal((await call('/api/neighbors?epoch=old',headers)).status,409);
  await DB.batch([DB.prepare('UPDATE world_members SET blocked=1 WHERE id=?').bind(member.id)]);
  assert.equal((await call(`/api/neighbors?epoch=${saved.epoch}`,headers)).status,403);
});
