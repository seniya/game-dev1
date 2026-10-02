import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { compactWorld, applyCommand } from '../src/server/world';
import { updateRequests, pendingFollowup } from '../src/sim/requests';
import { appendEvent } from '../src/sim/social';
import { localObserver } from '../src/sim/observation';
import { activity } from '../src/ui/activity';
import { storyEvent } from '../src/ui/story-event';
import { balance } from '../src/sim/economy';
import { WorldStore } from '../src/server/store';
import { database } from './helpers/database';
import worker from '../src/server/worker';
import { die } from '../src/sim/life';
const valid=(w:unknown)=>Simulation.load(JSON.stringify(w));

test('one and three day observations persist actual measurements and evidence after archive compaction',()=>{
  const sim=new Simulation(42);sim.setLLM(false);const id=sim.snapshot().requests.items[0].id;
  sim.respondToRequest(id,'food');sim.step(144);
  let w=sim.snapshot(),r=w.requests.items.find(r=>r.id===id)!;
  assert.equal(r.followups!.length,1);assert.equal(r.followups![0].tick,r.reviewAt!-12+144);
  assert.equal(r.followups![0].metrics.food,w.npcs.find(n=>n.id===r.npcId)!.inventory.food);
  const resumed=valid(compactWorld(w));resumed.step(288);w=resumed.snapshot();r=w.requests.items.find(r=>r.id===id)!;
  assert.deepEqual(r.followups!.map(f=>f.days),[1,3]);assert.equal(pendingFollowup(r),false);
  const saved=valid(compactWorld(w));saved.step(1);assert.equal(saved.snapshot().requests.items.find(r=>r.id===id)!.followups!.length,2);
  assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
  for(const f of r.followups!) {const e=w.events.find(e=>e.id===f.eventId)!;assert.equal(e.causeId,r.decisionEventId);assert.ok(f.evidence.every(id=>w.events.some(e=>e.id===id)));}
  for(const mutate of [(x:typeof w)=>x.requests.items.find(r=>r.id===id)!.followups![0].metrics.food++, (x:typeof w)=>x.requests.items.find(r=>r.id===id)!.followups![0].eventId='missing']) {const forged=structuredClone(w);mutate(forged);assert.throws(()=>valid(forged),/부탁/);}
});
test('death or relocation stops comparison once and keeps source; old saves never invent missed measurements',()=>{
  for(const death of [false,true]) {
    const sim=new Simulation(7),r=sim.snapshot().requests.items[0];sim.respondToRequest(r.id,'food');
    const w=sim.snapshot(),n=w.npcs.find(n=>n.id===r.npcId)!;
    if(death)die(w,n,'age');else n.homeId=w.buildings.find(b=>b.kind==='home'&&b.id!==n.homeId)!.id;
    updateRequests(w);const result=w.requests.items.find(x=>x.id===r.id)!;assert.ok(result.followupStopped);assert.equal(pendingFollowup(result),false);valid(compactWorld(w));
    const count=w.events.length;updateRequests(w);assert.equal(w.events.length,count);
  }
  const sim=new Simulation(123),r=sim.snapshot().requests.items[0];sim.respondToRequest(r.id,'food');sim.step(500);
  const old:any=sim.snapshot();old.version=8;delete old.observation;
  for(const r of old.requests.items){delete r.followups;delete r.followupSince;delete r.followupStopped;delete r.context;}
  const upgraded=valid(old),next=upgraded.snapshot();assert.equal(next.version,9);assert.equal(JSON.stringify(next.events),JSON.stringify(old.events));assert.deepEqual(next.requests.items.find(r=>r.id===old.requests.items[0].id)!.followups,[]);
  upgraded.step(12);assert.deepEqual(upgraded.snapshot().requests.items.find(r=>r.id===old.requests.items[0].id)!.followups,[]);
});
test('watching residents preserves simulation rules and survives save, rejects duplicates and invalid references',()=>{
  const a=new Simulation(42),b=new Simulation(42);a.setLLM(false);b.setLLM(false);
  a.watchResident('npc0',true);a.watchResident('npc0',true);assert.deepEqual(a.snapshot().observation.watchIds,['npc0']);
  const saved=a.save();assert.throws(()=>a.watchResident('missing',true));assert.equal(a.save(),saved);
  a.step(144);b.step(144);const w=a.snapshot(),other=b.snapshot();other.observation=w.observation;assert.deepEqual(w,other);
  assert.deepEqual(valid(compactWorld(w)).snapshot().observation.watchIds,['npc0']);
  for(const ids of [['npc0','npc0'],['missing']]) {const bad=structuredClone(w);bad.observation.watchIds=ids;assert.throws(()=>valid(bad),/관심 주민/);}
});
test('archive digest counts complete history, pins pagination and same-tick return boundary, isolates worlds',async()=>{
  const db=database(),store=new WorldStore(db);await store.init(0);
  let w=await store.read();const env={TEST_AUTH:'1',DB:db,ASSETS:{fetch:()=>new Response('asset')}} as never;
  const call=(query:string)=>worker.fetch(new Request(`https://world.test/api/observer?${query}`),env);
  const sim=valid(w.state);sim.setLLM(false);sim.step(144);const next=sim.snapshot();
  const oldIds=new Set(w.state.events.map(e=>e.id)),events=next.events.filter(e=>!oldIds.has(e.id));
  w={...w,state:compactWorld(next),revision:w.revision+1,meta:{...w.meta,eventCount:w.meta.eventCount+events.length}};
  await store.commit(w,events,'{}',crypto.randomUUID());
  const q=new URLSearchParams({epoch:w.epoch,from:'0',to:String(w.state.tick),npc:'npc0'});
  const first=await (await call(q.toString())).json() as ReturnType<typeof localObserver>;
  const full=await store.export(w.epoch);const local=localObserver(full,w.epoch,0,w.state.tick,['npc0']);
  assert.deepEqual(first,local);assert.ok(first.total>40);assert.ok(first.next);
  const beforeWatch=w.state.events.length;
  const command={id:crypto.randomUUID(),revision:w.revision,action:{type:'watch',npcId:'npc0',enabled:true}} as const;
  const changed=await applyCommand(w,command,1);await store.commit(changed.world,changed.events,JSON.stringify(command),command.id);
  assert.deepEqual((await new WorldStore(db).read()).state.observation.watchIds,['npc0']);assert.equal(changed.world.state.events.length,beforeWatch);
  q.set('before',String(first.next));q.set('through',String(first.through));
  const second:any=await (await call(q.toString())).json();assert.deepEqual(second,localObserver(full,w.epoch,0,w.state.tick,['npc0'],false,first.next!,first.through));
  assert.ok(!second.events.some((e:any)=>first.events.some(x=>x.id===e.id)));
  assert.equal((await call('epoch=wrong')).status,400);assert.equal((await call(`epoch=${w.epoch}&from=-1`)).status,400);assert.equal((await call(`epoch=${w.epoch}&npc=missing`)).status,400);
  const sameTick:any=await (await call(`epoch=${w.epoch}&from=${w.state.tick}&after=${first.through}`)).json();assert.equal(sameTick.total,0);
});
test('v8 checkpoint and pending deltas upgrade atomically with followups and watch selection intact',async()=>{
  const {stateChange}=await import('../src/server/journal');
  const db=database(),store=new WorldStore(db);await store.init(0);const original=await store.read();
  const sim=valid(original.state),r=sim.snapshot().requests.items[0];sim.respondToRequest(r.id,'food');
  const legacy:any=sim.snapshot();legacy.version=8;delete legacy.observation;
  legacy.requests.items.forEach((r:any)=>{delete r.followups;delete r.followupSince;delete r.context;});
  const after=structuredClone(legacy);after.tick++;
  await db.batch([db.prepare('DELETE FROM snapshots'),db.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind(original.epoch,0,JSON.stringify(legacy)),db.prepare('UPDATE world SET revision=1 WHERE id=1'),db.prepare('UPDATE world_checkpoints SET head_revision=1'),db.prepare('INSERT INTO world_changes VALUES(?,?,?,?)').bind(original.epoch,1,0,JSON.stringify(stateChange(legacy,after)))]);
  const fresh=new WorldStore(db),migrated=await fresh.read();assert.equal(migrated.state.version,9);assert.equal(migrated.state.requests.items[0].followupSince,after.tick);
  const cmd={id:crypto.randomUUID(),revision:migrated.revision,action:{type:'watch',npcId:r.npcId,enabled:true}} as const;
  const changed=await applyCommand(migrated,cmd,1);await fresh.commit(changed.world,changed.events,JSON.stringify(cmd),cmd.id);
  assert.deepEqual(await new WorldStore(db).read(),JSON.parse(JSON.stringify(changed.world)));valid(changed.world.state);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM world_changes').first<{n:number}>())!.n,0);
});
test('activity uses actual progress and destination; narrative labels hearsay and links recorded decisions',()=>{
  const w=new Simulation(42).snapshot(),n=w.npcs[0],farm=w.buildings.find(b=>b.kind==='farm')!;
  n.currentAction={kind:'Work',score:10,reason:'test',target:farm.position,targetId:farm.id,path:[farm.position],progress:0,duration:4};
  assert.equal(activity(w,n).moving,true);assert.equal(activity(w,n).building?.id,farm.id);
  n.currentAction.path=[];n.currentAction.progress=2;assert.equal(activity(w,n).progress,50);
  const source=appendEvent(w,{kind:'share',actorId:n.id,targetId:w.npcs[1].id,importance:70,description:'실제 도움'});
  const talk=appendEvent(w,{kind:'talk',actorId:n.id,targetId:w.npcs[1].id,importance:35,description:'그 후의 만남',data:{evidence:[source.id]}});
  assert.match(storyEvent(talk),new RegExp(`data-event="${source.id}"`));assert.match(storyEvent({...talk,kind:'rumor',description:'<script>'}),/전해 들은 소문/);assert.ok(!storyEvent({...talk,description:'<script>'}).includes('<script>'));
});

test('help can lead through recorded family formation, birth and real care without invented story events', async()=>{
  const { formFamily, giveBirth, careForChild }=await import('../src/sim/life');
  const { relationship }=await import('../src/sim/social');
  const { createEconomy }=await import('../src/sim/economy');
  const { stocks }=await import('../src/sim/civilization');
  const w=new Simulation(42).snapshot(),a=w.npcs[0],b=w.npcs[1];w.llm.enabled=false;
  a.identity.age=b.identity.age=25;a.life.bornTick=b.life.bornTick=w.tick-25*1728;
  const help=appendEvent(w,{kind:'share',actorId:a.id,targetId:b.id,importance:70,description:'가족 형성 이전에 기록된 도움'});
  for(const [x,y] of [[a,b],[b,a]]) {const r=relationship(x,y.id);r.trust=70;r.affection=70;r.evidence.push(help.id);}
  assert.equal(formFamily(w,a,b),true);const family=w.events.find(e=>e.kind==='family')!;assert.ok((family.data.evidence as string[]).includes(help.id));
  const home=w.buildings.find(h=>h.id===a.homeId)!;home.level=4;w.tick+=1728*2;stocks(w,a.settlementId).food+=30;w.economy=createEconomy(w);
  const child=giveBirth(w,a,b)!;assert.ok(child);assert.equal(w.events.find(e=>e.id===child.life.birthEventId)!.causeId,family.id);
  child.needs.hunger=80;child.position={...home.position};careForChild(w,child);
  const care=w.events.filter(e=>e.kind==='consumption'&&e.actorId===child.id).at(-1)!;assert.equal(care.causeId,child.life.birthEventId);
  const story=localObserver(w,'test',0,w.tick,[child.id],true);assert.ok(story.events.some(e=>e.id===care.id));
  assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
  const compact=compactWorld(w);assert.ok(compact.events.some(e=>e.id===help.id));
});

test('repeated unresolved needs schedule three, six and nine days without minting resources',async()=>{
  const {emptyRequests}=await import('../src/sim/requests-types');
  const {respondToRequest}=await import('../src/sim/requests');
  const {createEconomy}=await import('../src/sim/economy');
  const w=new Simulation(7).snapshot();w.requests=emptyRequests(w.tick);w.llm.enabled=false;
  for(const n of w.npcs){n.inventory.food=5;w.living.people[n.id].clothing=100;}
  const n=w.npcs[0];n.inventory.food=0;n.needs.hunger=80;w.economy=createEconomy(w);
  for(const delay of [432,864,1296]){
    updateRequests(w);const r=w.requests.items.at(-1)!;assert.equal(r.npcId,n.id);assert.equal(r.kind,'food');assert.equal(r.createdAt,w.tick);
    assert.equal(w.requests.cooldowns[`${n.id}:food`],w.tick+delay);
    respondToRequest(w,r.id,'decline');const count=w.requests.items.length;w.tick+=delay-12;updateRequests(w);assert.equal(w.requests.items.length,count);w.tick+=12;
    assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
  }
});

test('pair timelines query both participants before pagination, match the archive and preserve real evidence order',async()=>{
  const {readObserver}=await import('../src/server/observation');const {relationshipTimeline}=await import('../src/ui/relationship-timeline');
  const db=database(),store=new WorldStore(db);await store.init(0);const before=await store.read(),w=structuredClone(before.state);
  for(let i=0;i<90;i++){w.tick++;appendEvent(w,{kind:i%3===0?'share':'talk',actorId:'npc0',targetId:i%2===0?'npc1':'npc2',importance:50,description:`만남 ${i}`});}
  const newEvents=w.events.slice(before.state.events.length);const saved={...before,state:compactWorld(w),revision:before.revision+1,meta:{...before.meta,eventCount:w.events.length}};
  await store.commit(saved,newEvents,'pair-test',crypto.randomUUID());
  const params=new URLSearchParams({epoch:saved.epoch,npc:'npc0',partner:'npc1',mode:'story',from:'0'});
  const first=await readObserver(store,saved,params),local=localObserver(w,saved.epoch,0,w.tick,['npc0'],true,undefined,w.events.length,0,'npc1');
  assert.deepEqual(first,local);assert.equal(first.total,45);assert.equal(first.events.length,40);
  params.set('before',String(first.next));const second=await readObserver(store,saved,params);assert.equal(second.events.length,5);
  assert.ok(first.events.every(e=>e.participants.includes('npc0')&&e.participants.includes('npc1')));
  const html=relationshipTimeline([...first.events,...second.events]);assert.ok(html.indexOf('만남 0')<html.indexOf('만남 88'));
  const spoof={...first.events[0],kind:'rumor' as const,description:'<script>fake</script>'};const escaped=relationshipTimeline([spoof]);assert.match(escaped,/전해 들은/);assert.ok(!escaped.includes('<script>'));
  assert.deepEqual(await store.read(),saved);
});
