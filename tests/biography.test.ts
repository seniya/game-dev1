import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { appendEvent, socialEvent, changeRelationship, relationship } from '../src/sim/social';
import { socialMotives } from '../src/sim/social-motives';
import { candidates } from '../src/sim/decision';
import { lifeIntroduction, lifeThreads, localBiography } from '../src/sim/biography';
import { lifeIntroductionView, perspectivesView } from '../src/ui/biography';
import { storyEvent } from '../src/ui/story-event';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { readBiography } from '../src/server/biography';
import { compactWorld, applyCommand } from '../src/server/world';
import { database } from './helpers/database';
import worker from '../src/server/worker';

async function fixture() {
  const db=database(),store=new WorldStore(db);await store.init(0);const current=await store.read(),initial=current.state.events.length;
  const w=current.state;
  const root=appendEvent(w,{kind:'request',actorId:'npc0',importance:50,description:'오래된 부탁',data:{requestId:'story-test',phase:'offered'}});
  for(let i=0;i<16;i++){w.tick++;appendEvent(w,{kind:'request',actorId:'npc0',importance:40,description:`경과 ${i}`,causeId:i%2?root.id:undefined,data:{requestId:'story-test',phase:i===15?'completed':'followup'}});}
  for(let i=0;i<20;i++){w.tick++;appendEvent(w,{kind:'share',actorId:'npc0',targetId:i%2?'npc1':'npc2',importance:70,description:`도움 ${i}`});}
  appendEvent(w,{kind:'arrival',actorId:'npc0',importance:5,description:'평범한 이동'});
  const added=w.events.slice(initial),next={...current,revision:1,state:compactWorld(w),meta:{...current.meta,eventCount:current.meta.eventCount+added.length}};
  await store.commit(next,added,'fixture',crypto.randomUUID());
  return {db,store,current:await store.read(),root,full:w};
}

test('life introduction and open threads are read-only, exclude walking and retain dead family history',()=>{
  const w=new Simulation(42).snapshot(),n=w.npcs[0];
  const before=JSON.stringify(w);lifeIntroduction(w,n);lifeThreads(w,n);lifeIntroductionView(w,n);assert.equal(JSON.stringify(w),before);
  const walk=appendEvent(w,{kind:'arrival',actorId:n.id,importance:5,description:'walk'});assert.notEqual(lifeIntroduction(w,n).latest?.id,walk.id);
  w.npcs[1].life.parentIds=[n.id];n.alive=false;n.life.deathTick=w.tick;assert.deepEqual(lifeThreads(w,n),[]);
  assert.match(lifeIntroductionView(w,n),/남아 있는 삶의 흔적/);assert.match(lifeIntroductionView(w,n),new RegExp(w.npcs[1].identity.name));
});
test('request and loan threads show actual states and stop after resolution without inventing goal completion',()=>{
  const sim=new Simulation(42),w=sim.snapshot(),r=w.requests.items[0],n=w.npcs.find(n=>n.id===r.npcId)!;
  assert.ok(lifeThreads(w,n).some(t=>t.id===r.id));
  r.status='resolved';assert.ok(!lifeThreads(w,n).some(t=>t.id===r.id));
  w.loans.push({id:'l-test',borrowerId:n.id,lenderId:'npc1',amount:2,remaining:1,due:w.tick+144,status:'defaulted',sourceEventId:'test'});
  assert.ok(lifeThreads(w,n).some(t=>t.detail.includes('남은 식량 1개')&&t.status.includes('연체')));
  w.loans.at(-1)!.status='repaid';assert.ok(!lifeThreads(w,n).some(t=>t.id==='l-test'));
  assert.ok(lifeThreads(w,n).filter(t=>n.goals.some(g=>g.id===t.id)).every(t=>t.status==='현재 목표'));
});
test('own direct experience changes specific candidate scores, decays, and respects conflict and direction',()=>{
  const w=new Simulation(42).snapshot(),a=w.npcs[0],b=w.npcs[1];a.position={...b.position};a.inventory.food=3;b.inventory.food=0;b.needs.hunger=80;
  const e=socialEvent(w,{kind:'share',actorId:b.id,targetId:a.id,importance:75,description:'직접 받은 도움'});
  const motive=socialMotives(w,a,b);assert.ok(motive.share>0&&motive.share<=6);assert.equal(socialMotives(w,b,a).share,0);
  const withMemory=candidates(w,a).find(c=>c.kind==='Share'&&c.targetId===b.id)!;assert.ok(withMemory.evidence?.includes(e.id));assert.match(withMemory.reason,/보답/);
  const memories=a.memories;a.memories=[];const without=candidates(w,a).find(c=>c.kind==='Share'&&c.targetId===b.id)!;assert.ok(withMemory.score>without.score);assert.equal(socialMotives(w,a,b).share,0);a.memories=memories;
  relationship(a,b.id).resentment=60;assert.equal(socialMotives(w,a,b).share,0);relationship(a,b.id).resentment=0;
  w.tick+=7*144+1;assert.equal(socialMotives(w,a,b).share,0);
});
test('hearsay and other residents private memories never become direct reciprocity',()=>{
  const w=new Simulation(42).snapshot(),a=w.npcs[0],b=w.npcs[1];
  socialEvent(w,{kind:'rumor',actorId:b.id,targetId:a.id,importance:75,description:'도움을 주었다는 소문'});
  socialEvent(w,{kind:'share',actorId:b.id,targetId:'npc2',importance:75,description:'다른 사람에게 준 도움'});
  assert.equal(socialMotives(w,a,b).share,0);assert.deepEqual(socialMotives(w,a,b).evidence,[]);
});
test('relationship measurements and individual meanings survive future changes, escaping profile input',()=>{
  const w=new Simulation(42).snapshot(),a=w.npcs[0],b=w.npcs[1],e=socialEvent(w,{kind:'talk',actorId:a.id,targetId:b.id,importance:50,description:'만남'});
  changeRelationship(w,a,b.id,{trust:5},e,'도움을 기대한다');changeRelationship(w,b,a.id,{trust:-2},e,'아직 경계한다');
  const event=w.events.find(x=>x.kind==='relationship'&&x.actorId===a.id&&x.causeId===e.id)!;
  assert.equal(event.data.trustBefore,35);assert.equal(event.data.trustAfter,40);relationship(a,b.id).trust=90;assert.match(storyEvent(event),/35.0 → 40.0/);
  a.identity.name='<img src=x onerror=alert(1)>';const html=perspectivesView(w,a,b);assert.match(html,/도움을 기대한다/);assert.match(html,/아직 경계한다/);assert.ok(!html.includes('<img src=x'));
  const old={...event,data:{meaning:'이전 기록'}};assert.ok(!storyEvent(old).includes('당시 변화'));
});
test('archive turning points match local history, use stable pagination and exclude routine arrival',async()=>{
  const {store,current,full}=await fixture(),q=new URLSearchParams({epoch:current.epoch,npc:'npc0',mode:'turns'});
  const page=await readBiography(store,current,q),local=localBiography(full,current.epoch,'npc0','turns');
  assert.deepEqual(JSON.parse(JSON.stringify({...page,local:true})),JSON.parse(JSON.stringify(local)));
  assert.equal(page.chapters.length,12);assert.ok(page.next);assert.ok(!page.chapters.some(c=>c.event.description==='평범한 이동'));
  q.set('before',String(page.next));q.set('through',String(page.through));const next=await readBiography(store,current,q);
  assert.ok(next.chapters.every(c=>!page.chapters.some(x=>x.event.id===c.event.id)));
  for(const query of [{epoch:'wrong'}, {npc:'missing'}, {mode:'bad'}, {through:'999999'}, {before:'-1'}, {partner:'npc0'}] as Record<string,string>[])await assert.rejects(()=>readBiography(store,current,new URLSearchParams({...Object.fromEntries(q),...query})));
});
test('pruned request threads retain all archived outcomes and pin future followups out of old pages',async()=>{
  const {store,current,root}=await fixture(),q=new URLSearchParams({epoch:current.epoch,npc:'npc0',mode:'threads'});
  const page=await readBiography(store,current,q),chapter=page.chapters.find(c=>c.event.id===root.id)!;assert.ok(chapter.more);assert.equal(chapter.after.length,6);assert.equal(chapter.after.at(-1)!.data.phase,'completed');
  q.set('root',root.id);const first=await readBiography(store,current,q);assert.equal(first.chapters.length,12);
  q.set('before',String(first.next));const second=await readBiography(store,current,q);assert.equal(first.chapters.length+second.chapters.length,17);
  q.delete('before');q.set('through',String(current.meta.eventCount-21));const earlier=await readBiography(store,current,q);assert.equal(earlier.chapters[0].event.data.phase,'completed');
  q.set('through',String(current.meta.eventCount-22));assert.notEqual((await readBiography(store,current,q)).chapters[0].event.data.phase,'completed');
});
test('shared history needs distinct authenticated creators and discloses no account identities',async()=>{
  const {db,store,current}=await fixture();
  await db.batch(['npc0','npc1','npc2'].map((npc,i)=>db.prepare('INSERT INTO npc_creators VALUES(?,?,?,?)').bind(current.epoch,npc,i===1?'private-b':'private-a',`create-${i}`)));
  const page=await readBiography(store,current,new URLSearchParams({epoch:current.epoch,npc:'npc0',mode:'shared'}));
  assert.equal(page.chapters.length,10);assert.ok(page.chapters.every(c=>c.event.targetId==='npc1'));assert.ok(!JSON.stringify(page).includes('private-'));
  assert.equal((await readBiography(store,current,new URLSearchParams({epoch:current.epoch,npc:'npc0',mode:'shared',partner:'npc2'}))).chapters.length,0);
});
test('biography endpoint enforces login and block policy and accepts no write operations',async()=>{
  const {db,current}=await fixture(),env={DB:db,TEST_AUTH:'1',ASSETS:{fetch:()=>new Response('asset')}} as never;
  const path=`/api/biography?epoch=${current.epoch}&npc=npc0`;
  assert.equal((await worker.fetch(new Request('https://world.test'+path),env)).status,200);
  assert.equal((await worker.fetch(new Request('https://production.test'+path),env)).status,401);
  await db.batch([db.prepare("INSERT INTO world_members VALUES('blocked','b@test','B','participant',1)")]);
  assert.equal((await worker.fetch(new Request('https://world.test'+path,{headers:{'oai-authenticated-user-id':'blocked','oai-authenticated-user-email':'b@test'}}),env)).status,403);
  assert.equal((await worker.fetch(new Request('https://world.test'+path,{method:'POST',headers:{Origin:'https://world.test','Content-Type':'application/json'},body:'{}'}),env)).status,404);
});
test('live biography includes uncommitted history without saving and matches a full export',async()=>{
  const db=database(),store=new LiveWorldStore(db,'story-build');await store.init(1000);let w=await store.read();
  for(const action of [{type:'ai-mode',mode:'off'},{type:'play',running:true}] as const){const c={id:crypto.randomUUID(),revision:w.revision,action},next=await applyCommand(w,c,1000);await store.commit(next.world,next.events,c.id,c.id,[],{action,at:1000});w=next.world;}
  await store.sync({id:crypto.randomUUID(),revision:w.revision,action:{type:'sync'}},15000);
  const reader=new LiveWorldStore(db,'story-build'),live=await reader.read(),full=await reader.export(live.epoch);
  const before=JSON.stringify(await db.prepare('SELECT * FROM world_live').all());
  const page=await readBiography(reader,live,new URLSearchParams({epoch:live.epoch,npc:'npc0'}));
  assert.deepEqual(JSON.parse(JSON.stringify({...page,local:true})),JSON.parse(JSON.stringify(localBiography(full,live.epoch,'npc0','turns'))));
  assert.equal(JSON.stringify(await db.prepare('SELECT * FROM world_live').all()),before);
});

test('guests can follow host proposal and cancellation after the live appointment is pruned',async()=>{
  const {store,current}=await fixture(),w=current.state,initial=w.events.length;
  const root=appendEvent(w,{kind:'gathering',actorId:'npc1',importance:50,description:'주최자의 제안',data:{gatheringId:'guest-story',phase:'proposed'}});
  appendEvent(w,{kind:'gathering',actorId:'npc0',targetId:'npc1',importance:50,description:'초대 수락',data:{gatheringId:'guest-story',phase:'accepted'}});
  const cancelled=appendEvent(w,{kind:'gathering',actorId:'npc1',importance:50,description:'모임 취소',data:{gatheringId:'guest-story',phase:'cancelled'}});
  const added=w.events.slice(initial),next={...current,revision:current.revision+1,state:compactWorld(w),meta:{...current.meta,eventCount:current.meta.eventCount+added.length}};
  await store.commit(next,added,'guest',crypto.randomUUID());
  const q=new URLSearchParams({epoch:next.epoch,npc:'npc0',mode:'threads'});
  const list=await readBiography(store,next,q);assert.ok(list.chapters.some(c=>c.event.id===root.id));
  q.set('root',root.id);const page=await readBiography(store,next,q);assert.equal(page.chapters.length,3);assert.equal(page.chapters[0].event.id,cancelled.id);
  const local=localBiography(w,next.epoch,'npc0','threads',w.events.length,undefined,root.id);assert.equal(local.chapters.length,3);
  q.set('npc','npc2');await assert.rejects(()=>readBiography(store,next,q),/연결된 기록/);
});
