import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { LegacySimulation, LegacyCoordinator, LegacyMock } from '../src/server/retained/94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b';
import { database } from './helpers/database';
import { LiveWorldStore } from '../src/server/live-store';
import { WorldStore } from '../src/server/store';
import { applyCommand, compactWorld, type Command } from '../src/server/world';
import { recordRequest, operationsStatus, operationalCommit } from '../src/server/operations';
import { expressionAPI } from '../src/server/expressions';
import { buildPosition, wildlifeDay, protectFarm } from '../src/sim/frontier';
import { conversationGatherings } from '../src/sim/gatherings';
import { balance } from '../src/sim/economy';
const now=Date.now();
async function setup(){const db=database(),s=new LiveWorldStore(db);await s.init(now);return {db,s};}
async function send(s:LiveWorldStore,action:Command['action'],at=now){const w=await s.read(),c={id:crypto.randomUUID(),revision:w.revision,action},n=await applyCommand(w,c,at);await s.commit(n.world,n.events,c.id,c.id,[],{action,at});return n.world;}
function position(w:ReturnType<Simulation['snapshot']>){const v=w.civilization.settlements[0];for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++)if(buildPosition(w,v.id,{x,y}))return {x,y};throw Error('site');}

test('v022 recovery commits exact old engine progress once, with a durable recovery record',async()=>{
 const {db,s}=await setup(),saved=await s.read(),old=LegacySimulation.load(JSON.stringify(saved.state));old.setLLM(false);saved.state=old.snapshot() as unknown as typeof saved.state;saved.meta.aiMode='off';
 await db.batch([db.prepare('DELETE FROM snapshots'),...s.snapshotStatements(saved.epoch,saved.state),db.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);
 old.step(144,undefined);const state=old.snapshot() as unknown as typeof saved.state,ids=new Set(saved.state.events.map(e=>e.id)),added=state.events.filter((e:{id:string})=>!ids.has(e.id));
 await db.batch([db.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:'94da98e01deb6dc47be00b658f40ac271f09e2521cce68f89d819c4b6ca7e96b',epoch:saved.epoch,ticks:144,meta:{...saved.meta,eventCount:saved.meta.eventCount+added.length},started:now,id:crypto.randomUUID()}))]);
 const [a,b]=await Promise.all([new LiveWorldStore(db,'next').read(),new LiveWorldStore(db,'next').read()]);
 assert.deepEqual(a,b);assert.deepEqual(a.state,JSON.parse(JSON.stringify(compactWorld(state))));
 const report=await operationsStatus(db);assert.equal(report.migrations.length,1);assert.equal(report.migrations[0].ticks,144);assert.equal(report.migrations[0].events,added.length);
});

test('daily operations roll back with saves, deduplicate concurrent captures, survive restart and expire after 30 days',async()=>{
 const {db,s}=await setup(),w=await s.read();
 recordRequest('/api/world',50,200,now,db);recordRequest('/api/world',2500,503,now,db);
 const a=operationalCommit(db,w,now),b=operationalCommit(db,w,now);
 await assert.rejects(db.batch([...a.statements,db.prepare('INSERT INTO commit_guard VALUES(0)')]));
 assert.equal((await operationsStatus(db)).history.length,0);
 await db.batch(b.statements);b.accepted();await db.batch(a.statements);a.accepted();
 const status=await operationsStatus(db);assert.equal(status.history[0].requests,2);assert.equal(status.history[0].errors,1);assert.equal(status.history[0].total_ms,2550);assert.equal(status.history[0].slow,1);
 const reread=new WorldStore(db);await reread.init(now);assert.equal((await operationsStatus(db)).history[0].requests,2);
 const actual=await db.prepare('SELECT coalesce(sum(length(CAST(body AS BLOB))),0) AS bytes FROM events WHERE epoch=?').bind(w.epoch).first<{bytes:number}>();assert.equal(status.history[0].archive_bytes,actual!.bytes);
 const future=operationalCommit(db,w,now+31*86400000);await db.batch(future.statements);future.accepted();assert.equal((await operationsStatus(db)).history.length,1);assert.equal((await operationsStatus(db)).history[0].requests,0);
});

test('conversation chains are bounded and isolated by resident, owner, epoch and AI generation',async()=>{
 const {db,s}=await setup();await send(s,{type:'step',ticks:144});const w=await s.read(),n=w.state.npcs.find(n=>n.alive&&n.memories.length)!;
 let previous:string|undefined;
 for(let i=0;i<7;i++){const r=await expressionAPI(s,'owner',{npcId:n.id,kind:'dialogue',question:`이어서 ${i}번째 이야기`,...(previous?{previous}:{})},{},now+i);previous=r!.id;}
 const job=await db.prepare('SELECT context FROM expressions WHERE id=?').bind(previous!).first<{context:string}>();assert.equal(JSON.parse(job!.context).history.length,4);
 await assert.rejects(expressionAPI(s,'other',{npcId:n.id,kind:'dialogue',question:'이어가기',previous},{},now+10),/만료/);
 const other=w.state.npcs.find(p=>p.id!==n.id&&p.alive&&p.memories.length)!;
 await assert.rejects(expressionAPI(s,'owner',{npcId:other.id,kind:'dialogue',question:'이어가기',previous},{},now+10),/상대/);
 await send(s,{type:'ai-mode',mode:'chrome'});
 await assert.rejects(expressionAPI(s,'owner',{npcId:n.id,kind:'dialogue',question:'이어가기',previous},{},now+10),/만료/);
});

test('timed construction reserves land and material, survives checkpoints, completes once without double charging',()=>{
 const sim=new Simulation();sim.setLLM(false);const before=sim.snapshot(),p=position(before),id=sim.beginConstruction('v0','home',p),started=sim.snapshot();
 assert.equal(started.storage.wood,before.storage.wood-12);assert.equal(started.buildings.length,before.buildings.length);assert.equal(buildPosition(started,'v0',p),false);assert.throws(()=>sim.build('v0','home',p),/부지|목재/);
 const resumed=Simulation.load(JSON.stringify(compactWorld(started)));sim.step(12);resumed.step(12);assert.deepEqual(compactWorld(sim.snapshot()),compactWorld(resumed.snapshot()));
 sim.step(80);const w=sim.snapshot(),project=w.construction!.projects.find(p=>p.id===id)!;assert.ok(project.buildingId);assert.equal(project.progress,36);assert.equal(w.events.filter(e=>e.data.projectId===id&&e.data.phase==='completed').length,1);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
 assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(w))));
 const corrupt=structuredClone(w);corrupt.construction!.projects[0].position.x++;assert.throws(()=>Simulation.load(JSON.stringify(corrupt)),/공사/);
});

test('farm fences consume actual wood, prevent wildlife crop loss and expire without changing resource accounting',()=>{
 const sim=new Simulation(),w=sim.snapshot(),farm=w.buildings.find(b=>b.kind==='farm')!;w.tick=144;wildlifeDay(w);
 w.resources.filter(r=>r.kind==='food').forEach(r=>r.amount=0);w.buildings.filter(b=>b.kind==='farm').forEach(b=>b.growth=0);farm.growth=20;
 w.frontier!.animals=w.frontier!.animals.slice(0,2).map(a=>({...a,position:{...farm.position},hunger:0}));
 const bare=structuredClone(w),protectedWorld=structuredClone(w),wood=w.storage.wood;protectFarm(protectedWorld,farm.id);assert.equal(protectedWorld.storage.wood,wood-4);assert.throws(()=>protectFarm(protectedWorld,farm.id),/보호/);
 wildlifeDay(bare);wildlifeDay(protectedWorld);assert.ok(bare.buildings.find(b=>b.id===farm.id)!.growth<20);assert.equal(protectedWorld.buildings.find(b=>b.id===farm.id)!.growth,20);
 protectedWorld.tick+=30*144;wildlifeDay(protectedWorld);assert.ok(protectedWorld.buildings.find(b=>b.id===farm.id)!.growth<20);assert.deepEqual(balance(protectedWorld),balance(w));
});

test('conversation activity validates availability again, links source and preserves independent invitations',()=>{
 const seed=new Simulation(),w=seed.snapshot();w.tick=100;w.gatherings={items:[],lastProposalDay:-1};const market=w.buildings.find(b=>b.kind==='market')!;
 const adults=w.npcs.filter(n=>n.identity.age>=18).slice(0,2);for(const n of adults){n.position={...market.position};n.inventory.food=3;n.needs.hunger=20;n.needs.thirst=20;n.needs.fatigue=20;n.needs.health=100;n.currentAction=undefined;}
 const n=adults[0],source=w.events[0];n.memories.push({id:`m${w.nextId++}`,sourceEventId:source.id,type:'social',description:source.description,importance:40,emotionalImpact:1,repetitions:1,createdAt:w.tick,relatedLocationIds:[],relatedNpcIds:[]});
 // Use the engine to create the expression; personal memory and source remain required.
 const sim=Simulation.load(JSON.stringify(w));assert.equal(sim.recordExpression(n.id,'dialogue','함께 식사하는 일이 기억나.', [source.id],'request','mock','식사'),true);
 const withExpression=sim.snapshot(),e=withExpression.events.at(-1)!;assert.ok(conversationGatherings(withExpression,n.id).some(c=>c.kind==='meal'));
 sim.proposeConversationGathering(n.id,'meal',e.id);const state=sim.snapshot(),g=state.gatherings!.items.at(-1)!;assert.equal(g.sourceEventId,state.events.find(e=>e.data.gatheringId===g.id&&e.data.phase==='proposed')!.id);assert.ok(g.invitations.length);assert.equal(g.status,'planned');assert.throws(()=>sim.proposeConversationGathering(n.id,'meal',e.id),/조건/);assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(state))));
});

test('optimized decisions and household lookup preserve complete deterministic outcomes of the retained engine',()=>{
 for(const population of [12,80,450]) {
  const current=new Simulation(42,population),old=new LegacySimulation(42,population);current.setLLM(false);old.setLLM(false);
  current.step(144);old.step(144,undefined);const a=current.snapshot(),b=old.snapshot();if(a.frontier)delete a.frontier.impact;
  assert.deepEqual(a,b,`population ${population}`);
 }
});

test('rain delays construction and first-use evidence requires a resident actually sleeping in the completed home',()=>{
 const sim=new Simulation();sim.setLLM(false);sim.beginConstruction('v0','home',position(sim.snapshot()));
 const rainy=sim.snapshot();rainy.weather='rain';let run=Simulation.load(JSON.stringify(rainy));run.step(18);assert.equal(run.snapshot().construction!.projects[0].progress,9);assert.equal(run.snapshot().construction!.projects[0].buildingId,undefined);
 run.step(54);const w=run.snapshot(),project=w.construction!.projects[0],home=w.buildings.find(b=>b.id===project.buildingId)!;assert.ok(home);assert.equal(project.used,undefined);
 const resident=w.npcs.find(n=>n.alive&&n.identity.age>=18)!;resident.homeId=home.id;resident.position={...home.position};resident.currentAction={kind:'Sleep',score:100,reason:'실제 수면 관찰',target:{...home.position},targetId:home.id,path:[],progress:1,duration:8};
 run=Simulation.load(JSON.stringify(w));run.step();const after=run.snapshot(),event=after.events.find(e=>e.data.projectId===project.id&&e.data.phase==='first-use')!;assert.ok(event);assert.equal(event.actorId,resident.id);assert.equal(event.locationId,home.id);assert.equal(event.causeId,project.lastEventId);
 run.step(12);assert.equal(run.snapshot().events.filter(e=>e.data.projectId===project.id&&e.data.phase==='first-use').length,1);assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(run.snapshot()))));
});
