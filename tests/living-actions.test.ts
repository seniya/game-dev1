import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { buildPosition, wildlifeDay, protectFarm } from '../src/sim/frontier';
import { constructionTick, workConstruction, constructionCandidate, assignConstruction } from '../src/sim/construction';
import { growthRate, growFarm, recordHarvest, agricultureDay } from '../src/sim/agriculture';
import { balance } from '../src/sim/economy';
import { compactWorld } from '../src/server/world';
import { candidates } from '../src/sim/decision';
import { promiseMemories } from '../src/sim/promises';
import { expressionContext } from '../src/llm/expression';
import { conversationGatherings, updateGatherings } from '../src/sim/gatherings';
import { localObserver } from '../src/sim/observation';
import { readObserver } from '../src/server/observation';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { database } from './helpers/database';
import { operationsStatus } from '../src/server/operations';
import { LegacySimulation } from '../src/server/retained/fd779772563d70c9d0a89198165ee82c2741f04d543a32c8b9cb904b5fef71af';
function site(){const sim=new Simulation(42);sim.setLLM(false);const w=sim.snapshot();for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++)if(buildPosition(w,'v0',{x,y})){sim.beginConstruction('v0','home',{x,y});return sim.snapshot();}throw Error('site');}
test('new construction requires funded adult labor on site, pauses for needs, halves efficiency in rain, and preserves balances',()=>{
 const w=site(),p=w.construction!.projects[0],n=w.npcs.find(n=>n.identity.age>=18&&n.identity.age<65)!;
 n.needs.hunger=20;n.needs.thirst=20;n.needs.fatigue=20;n.needs.health=100;n.position={...p.position};delete w.urban.citizens[n.id].employer;
 const initial=balance(w),fund=w.market.coins,wealth=n.wealth;
 constructionTick(w);assert.equal(p.progress,0);
 assert.ok(constructionCandidate(w,n));assert.ok(candidates(w,n).some(c=>c.targetId===`construction:${p.id}`));
 n.currentAction={...constructionCandidate(w,n)!,path:[],progress:0,duration:4};assignConstruction(w,n);
 n.position.x++;assert.equal(workConstruction(w,n),false);n.position.x--;
 n.identity.age=12;assert.equal(workConstruction(w,n),false);n.identity.age=25;
 n.needs.fatigue=90;assert.equal(workConstruction(w,n),false);n.needs.fatigue=20;
 w.weather='rain';assert.equal(workConstruction(w,n),true);assert.equal(p.progress,2);
 assert.equal(n.wealth,wealth+1);assert.equal(w.market.coins,fund-1);
 w.weather='sunny';for(let i=0;i<9;i++){n.needs.fatigue=20;workConstruction(w,n);}constructionTick(w);
 assert.ok(p.buildingId);assert.equal(p.progress,36);assert.equal(p.labor!.paid,10);assert.deepEqual(balance(w),initial);
 n.currentAction=undefined;assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(w))));
 assert.equal(w.events.filter(e=>e.data.projectId===p.id&&e.data.phase==='completed').length,1);
});
test('legacy automatic construction still completes at its saved rate; empty market prevents unpaid labor',()=>{
 const w=site(),p=w.construction!.projects[0],n=w.npcs.find(n=>n.identity.age>=18)!;n.currentAction={kind:'Work',score:100,reason:'공사',target:{...p.position},targetId:`construction:${p.id}`,duration:4,progress:0,path:[]};n.position={...p.position};w.market.coins=0;
 assert.equal(workConstruction(w,n),false);assert.equal(p.progress,0);delete p.labor;w.weather='rain';for(let i=0;i<72;i++)constructionTick(w);assert.ok(p.buildingId);
});
test('agriculture reports actual growth and harvest, seasonal estimates, and saves its event references',()=>{
 const w=new Simulation().snapshot(),b=w.buildings.find(b=>b.kind==='farm')!;const before=b.growth;
 growFarm(w,b);assert.equal(b.growth,before+growthRate(w,b));b.growth-=3;recordHarvest(w,b,3);const baseline=balance(w);
 w.tick=144;agricultureDay(w);const f=w.agriculture!.farms[0],event=w.events.find(e=>e.id===f.lastEventId)!;
 assert.equal(event.data.harvested,3);assert.ok(Number(event.data.grown)>0);assert.equal(f.harvested,0);assert.deepEqual(balance(w),baseline);
 assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(w))));
});
test('fences redirect hungry wildlife to a reachable unprotected farm and record original fence evidence',()=>{
 const w=new Simulation().snapshot();w.tick=144;wildlifeDay(w);const farms=w.buildings.filter(b=>b.kind==='farm');const farm=farms[0];
 w.resources.filter(r=>r.kind==='food').forEach(r=>r.amount=0);farms.forEach(b=>b.growth=20);protectFarm(w,farm.id);
 const a=w.frontier!.animals[0];a.position={...farm.position};const age=a.age;wildlifeDay(w);
 assert.equal(farm.growth,20);assert.equal(a.age,age+1);const record=[...w.events].reverse().find(e=>e.data.animalId===a.id&&e.data.protectedFarm===farm.id)!;
 assert.ok(record);assert.equal(record.causeId,w.frontier!.protections![0].sourceEventId);assert.notEqual(record.data.targetId,farm.id);
 const natural=structuredClone(w),berry=natural.resources.find(r=>r.kind==='food')!,animal=natural.frontier!.animals[0];berry.position={...farm.position};berry.amount=10;animal.position={...farm.position};const count=natural.events.length;
 wildlifeDay(natural);assert.ok(berry.amount<10);assert.ok(!natural.events.slice(count).some(e=>e.data.animalId===animal.id&&e.causeId===natural.frontier!.protections![0].sourceEventId),'a fence must not be cited when natural food was preferred anyway');
});
function conversation(){const w=new Simulation().snapshot();w.tick=100;w.gatherings={items:[],lastProposalDay:-1};const pos=w.buildings.find(b=>b.kind==='market')!.position;for(const n of w.npcs){n.position={...pos};n.needs.hunger=20;n.needs.thirst=20;n.needs.fatigue=20;n.needs.health=100;w.economy.totals.externalFood+=3-n.inventory.food;n.inventory.food=3;delete n.currentAction;}
 const n=w.npcs.find(n=>n.identity.age>=18)!,source=w.events[0];n.memories.push({id:`m${w.nextId++}`,sourceEventId:source.id,type:'social',description:source.description,importance:40,emotionalImpact:1,repetitions:1,createdAt:w.tick,relatedLocationIds:[],relatedNpcIds:[]});const sim=Simulation.load(JSON.stringify(w));assert.ok(sim.recordExpression(n.id,'dialogue','함께 식사하자.',[source.id],'test','mock','식사'));const event=sim.snapshot().events.at(-1)!;assert.ok(conversationGatherings(sim.snapshot(),n.id).length);sim.proposeConversationGathering(n.id,'meal',event.id);return {sim,npc:n.id};}
test('conversation promises retain direct outcomes, prioritize them for follow-up and hide remote cancellation reasons',()=>{
 const {sim,npc}=conversation(),w=sim.snapshot(),g=w.gatherings!.items.at(-1)!,guest=g.invitations.find(i=>i.status==='accepted')!;assert.ok(guest);
 w.npcs.find(n=>n.id===npc)!.needs.health=1;updateGatherings(w);assert.equal(g.status,'cancelled');
 const host=promiseMemories(w,npc);assert.ok(host.some(m=>m.text.includes('취소')));
 const guestMem=promiseMemories(w,guest.npcId);assert.ok(!guestMem.some(m=>m.text.includes('주최자:')));
 const context=expressionContext(w,{npcId:npc,kind:'dialogue',question:'지난 약속은 어떻게 됐어?'});assert.ok(context.memories.some(m=>m.text.includes('취소')));
 const run=Simulation.load(JSON.stringify(compactWorld(w)));assert.ok(run.recordExpression(npc,'dialogue','약속이 취소됐어.',[host[0].id],'follow','mock','약속 결과'));
 const stranger=w.npcs.find(n=>n.id!==npc&&!g.invitations.some(i=>i.npcId===n.id))!;assert.equal(run.recordExpression(stranger.id,'dialogue','취소 사유를 알아.',[host.find(m=>m.text.includes('주최자:'))!.id],'fake','mock','결과'),false);
});
test('return digest is identical for SQLite and local, frozen at watermark and isolated by resident',async()=>{
 const db=database(),s=new WorldStore(db);await s.init(Date.now());const saved=await s.read(),sim=Simulation.load(JSON.stringify(saved.state));sim.step(288);const state=sim.snapshot(),ids=new Set(saved.state.events.map(e=>e.id)),events=state.events.filter(e=>!ids.has(e.id));
 const w={...saved,state,revision:saved.revision+1,meta:{...saved.meta,eventCount:saved.meta.eventCount+events.length}};await s.commit(w,events,'digest','digest');
 for(const npc of [undefined,'npc0']){const p=new URLSearchParams({epoch:w.epoch,from:'0',to:'288',through:String(w.meta.eventCount)});if(npc)p.append('npc',npc);const server=await readObserver(s,w,p),local=localObserver(state,w.epoch,0,288,npc?[npc]:[]);assert.deepEqual(server.changes,local.changes);assert.ok(server.changes!.every(g=>g.events.length<=2));}
 const empty=await readObserver(s,w,new URLSearchParams({epoch:w.epoch,from:'0',to:'288',after:String(w.meta.eventCount),through:String(w.meta.eventCount)}));assert.ok(empty.changes!.every(g=>!g.events.length));
});
test('v024 recovery preserves exact progress; failures are deduplicated and diagnosed without altering world or clock',async()=>{
 const db=database(),s=new WorldStore(db);await s.init(Date.now());const saved=await s.read(),old=LegacySimulation.load(JSON.stringify(saved.state));old.setLLM(false);saved.state=old.snapshot() as unknown as typeof saved.state;saved.meta.aiMode='off';await db.batch([db.prepare('DELETE FROM snapshots'),...s.snapshotStatements(saved.epoch,saved.state),db.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);
 old.step(12,undefined);const state=old.snapshot() as unknown as typeof saved.state,added=state.events.filter(e=>!saved.state.events.some(x=>x.id===e.id));
 const body={build:'fd779772563d70c9d0a89198165ee82c2741f04d543a32c8b9cb904b5fef71af',epoch:saved.epoch,ticks:12,meta:{...saved.meta,eventCount:saved.meta.eventCount+added.length+1},started:Date.now(),id:'pending'};
 await db.batch([db.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify(body))]);
 for(let i=0;i<2;i++)await assert.rejects(new LiveWorldStore(db,'new').read(),/사건 수/);
 const status=await operationsStatus(db,'new');assert.equal(status.recoveryFailures.length,1);assert.equal(status.recoveryFailures[0].code,'event-mismatch');assert.deepEqual(await s.read(),saved);assert.equal((await db.prepare('SELECT body FROM world_live').first<{body:string}>())!.body,JSON.stringify(body));
 body.meta.eventCount--;await db.batch([db.prepare('UPDATE world_live SET body=?').bind(JSON.stringify(body))]);const restored=await new LiveWorldStore(db,'new').read();assert.deepEqual(restored.state,JSON.parse(JSON.stringify(compactWorld(state))));assert.equal((await operationsStatus(db,'new')).migrations.length,1);
});

test('accepted conversation promise completes only after actual co-located activity and becomes follow-up evidence',()=>{
 const {sim,npc}=conversation(),w=sim.snapshot(),g=w.gatherings!.items.at(-1)!;
 const participants=[npc,...g.invitations.filter(i=>i.status==='accepted').map(i=>i.npcId)],venue=w.buildings.find(b=>b.id===g.buildingId)!;assert.ok(participants.length>=2);
 for(const id of participants){const n=w.npcs.find(n=>n.id===id)!;n.position={...venue.position};n.currentAction={kind:'Attend',target:{...venue.position},targetId:g.id,score:110,reason:'수락한 약속',path:[],progress:0,duration:6};}
 for(let i=0;i<6;i++){w.tick=g.startsAt+i;updateGatherings(w);}
 assert.equal(g.status,'completed');assert.ok(g.attendance.length>=2);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
 const context=expressionContext(w,{npcId:npc,kind:'dialogue',question:'함께 식사한 결과는?'});assert.ok(context.memories.some(m=>m.text.includes('완료')));assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(w))));
});

test('construction keeps its reserved wood and progress across a no-funds pause and resumes only with actual funded work',()=>{
 const w=site(),p=w.construction!.projects[0],n=w.npcs.find(n=>n.identity.age>=18&&n.identity.age<65)!;
 n.needs.hunger=10;n.needs.thirst=10;n.needs.fatigue=10;n.needs.health=100;delete w.urban.citizens[n.id].employer;n.position={...p.position};n.currentAction={...constructionCandidate(w,n)!,path:[],duration:4,progress:0};assignConstruction(w,n);w.weather='sunny';assert.ok(workConstruction(w,n));
 const bank=w.market.coins;n.wealth+=bank;w.market.coins=0;assert.equal(workConstruction(w,n),false);const saved=JSON.stringify(compactWorld(w)),resumed=Simulation.load(saved).snapshot(),siteAfter=resumed.construction!.projects[0];assert.equal(siteAfter.progress,4);
 const worker=resumed.npcs.find(p=>p.id===n.id)!;worker.wealth--;resumed.market.coins++;assert.ok(workConstruction(resumed,worker));assert.equal(siteAfter.progress,8);assert.deepEqual(balance(resumed),{food:0,wood:0,coins:0});
});
