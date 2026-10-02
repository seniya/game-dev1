import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { acquireBusiness, businessQuote, enterpriseDay, inheritBusinesses } from '../src/sim/family-enterprise';
import { buildEnterprise, initializeUrban, industryWork, urbanBalance, urbanDay } from '../src/sim/urban';
import { balance } from '../src/sim/economy';
import { INDUSTRIES, type Industry, INDUSTRY_SKILL } from '../src/sim/urban-types';
import { die, settleEstate } from '../src/sim/life';
import { creditContribution, learnFamilyTrade, chooseFamilyTrade, cooperationTrust } from '../src/sim/legacy-learning';
import { appendEvent } from '../src/sim/social';
import { familyObservation } from '../src/sim/family-observation';
import { familyDashboard, familyTree } from '../src/ui/family-dashboard';
import { compactWorld } from '../src/server/world';
import { database } from './helpers/database';
import worker from '../src/server/worker';
import { WorldStore } from '../src/server/store';
import { LiveWorldStore } from '../src/server/live-store';
import { dynastyAPI } from '../src/server/dynasty';
import { defaultCharacter } from '../src/ui/characters';
import { availableHomes } from '../src/sim/characters';
import type { WorldState } from '../src/sim/types';

function fixture(kind:Industry='field'){
  const w=new Simulation(42,12).snapshot(),n=w.npcs[0];
  const extra=100-n.wealth;w.market.coins-=extra;n.wealth+=extra;n.needs.health=100;n.needs.hunger=10;
  const e=buildEnterprise(w,n.settlementId,kind)!;assert.ok(e);initializeUrban(w);
  e.workers=[n.id];w.urban.citizens[n.id].employer=e.id;const b=w.buildings.find(b=>b.id===e.buildingId)!;n.position={...b.position};b.growth=100;
  for(const g of Object.keys(w.urban.cities[0].goods) as (keyof typeof w.urban.cities[0]['goods'])[]){w.urban.cities[0].goods[g]+=20;w.urban.ledger.opening[g]+=20;}
  acquireBusiness(w,n.id,e.id);return {w,n,e};
}
test('private acquisition, every recipe and maintenance conserve money/materials and survive compaction',()=>{
  for(const kind of INDUSTRIES){const {w,n,e}=fixture(kind),p=e.business!,q=businessQuote(w,e,n),before=p.cash;
    assert.deepEqual(balance(w),{food:0,wood:0,coins:0});assert.equal(industryWork(w,n),true,kind);
    assert.equal(p.cash,before+q.revenue-q.costs-e.wage);assert.equal(p.revenue,q.revenue);assert.equal(p.costs,q.costs);assert.equal(p.wages,e.wage);
    assert.deepEqual(balance(w),{food:0,wood:0,coins:0});assert.ok(Object.values(urbanBalance(w)).every(v=>v===0));
    assert.deepEqual(Simulation.load(JSON.stringify(compactWorld(w))).snapshot().urban.enterprises[0].business,p);
    const cash=p.cash,total=n.wealth;assert.throws(()=>acquireBusiness(w,n.id,e.id));assert.equal(p.cash,cash);assert.equal(n.wealth,total);
  }
  const {w,e}=fixture();w.urban.buildings[e.buildingId].condition=70;urbanDay(w);assert.ok(e.business!.costs>0);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
});
test('private production waits atomically for buyer funds, working capital, inputs or a present worker',()=>{
  for(const reason of ['buyer','capital','inputs','location']){const {w,n,e}=fixture('mill');
    if(reason==='buyer'){w.npcs[1].wealth+=w.market.coins;w.market.coins=0;}
    if(reason==='capital'){n.wealth+=e.business!.cash;e.business!.dividends+=e.business!.cash;e.business!.cash=0;}
    if(reason==='inputs')w.urban.cities[0].goods.grain=0;
    if(reason==='location')n.position={...w.buildings.find(b=>b.id===n.homeId)!.position};
    const before=JSON.stringify(w);assert.equal(industryWork(w,n),false,reason);assert.equal(JSON.stringify(w),before,reason);
  }
});
test('dividends distribute earned profit once, retain operating capital, and allow later losses',()=>{
  const {w,n,e}=fixture();industryWork(w,n);const profit=e.business!.revenue-e.business!.costs-e.business!.wages;
  enterpriseDay(w);assert.equal(e.business!.dividends,Math.max(0,profit));const coins=n.wealth;enterpriseDay(w);assert.equal(n.wealth,coins);assert.equal(e.business!.cash,24);
  w.urban.buildings[e.buildingId].condition=70;urbanDay(w);assert.doesNotThrow(()=>Simulation.load(JSON.stringify(compactWorld(w))));assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
});
test('business shares pass through three deaths without reminting cash; child and spouse can inherit',()=>{
  const {w,n,e}=fixture();const [child,spouse,grandchild]=w.npcs.slice(1,4);child.life.parentIds=[n.id];spouse.life.partnerId=n.id;n.life.partnerId=spouse.id;grandchild.life.parentIds=[child.id];
  const cash=e.business!.cash;die(w,n,'needs');assert.equal(e.business!.shares.find(s=>s.npc===child.id)!.weight,.5);assert.equal(e.business!.shares.find(s=>s.npc===spouse.id)!.weight,.5);
  const after=JSON.stringify(w);settleEstate(w,n,n.life.deathEventId!);assert.equal(JSON.stringify(w),after);
  die(w,child,'needs');assert.equal(e.business!.shares.find(s=>s.npc===grandchild.id)!.weight,.5);die(w,grandchild,'needs');assert.equal(e.business!.community,.5);assert.equal(e.business!.cash,cash);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
});
test('tampered cash, source and duplicate shares are rejected; old public saves remain compatible',()=>{
  const {w,e}=fixture();for(const mutation of [()=>e.business!.cash++,()=>e.business!.source='missing',()=>e.business!.shares.push({...e.business!.shares[0]})]){
    const original=structuredClone(e.business);mutation();assert.throws(()=>Simulation.load(JSON.stringify(w)));e.business=original;
  }
  assert.doesNotThrow(()=>Simulation.load(new Simulation().save()));
});
test('learning teaches actual skills, never employs children, and supports distinct adult careers',()=>{
  const {w,n,e}=fixture();const child=w.npcs[1];child.identity.age=12;child.homeId=n.homeId;child.life.parentIds=[n.id];child.needs.health=100;child.needs.hunger=10;child.occupation='none';w.urban.citizens[n.id].skills[INDUSTRY_SKILL[e.kind]]=40;
  const before=w.urban.citizens[child.id].skills.field;learnFamilyTrade(w,child);assert.equal(w.urban.citizens[child.id].skills.field,before+.5);assert.equal(child.life.apprenticeship!.lessons,1);assert.equal(e.workers.includes(child.id),false);
  learnFamilyTrade(w,child);assert.equal(child.life.apprenticeship!.lessons,1);
  child.identity.age=18;child.personality.curiosity=100;child.personality.diligence=0;w.living.people[child.id].traits.independence=100;assert.equal(chooseFamilyTrade(w,child),true);assert.equal(child.life.apprenticeship!.choice,'independent');assert.equal(child.occupation,'none');
  child.life.apprenticeship!.lessons=60;assert.equal(chooseFamilyTrade(w,child),true);assert.equal(child.life.apprenticeship!.choice,'continue');assert.equal(child.occupation,'farmer');
});
test('contribution credit is direct, daily bounded, evidence-based and excludes observer commands',()=>{
  const w=new Simulation().snapshot(),[a,b,far]=w.npcs;const e=appendEvent(w,{kind:'share',actorId:a.id,targetId:b.id,importance:45,description:'실제 나눔'});
  creditContribution(w,e);const trust=b.relationships.find(r=>r.npcId===a.id)!.trust;assert.equal(b.life.support!.source,e.id);creditContribution(w,e);assert.equal(b.relationships.find(r=>r.npcId===a.id)!.trust,trust);assert.equal(far.life.support,undefined);assert.ok(cooperationTrust(b,a.id,w)>0);
  w.tick=144;creditContribution(w,{...e,data:{observer:true}});assert.equal(b.relationships.find(r=>r.npcId===a.id)!.trust,trust);
  creditContribution(w,{...e,tick:144,id:'fresh'});assert.equal(b.relationships.find(r=>r.npcId===a.id)!.trust,trust+2);
  w.tick+=8*144;assert.equal(cooperationTrust(b,a.id,w),0);
});
test('family observation separates spouse assets, share cash and residence; tree pages escape names',()=>{
  const {w,n,e}=fixture();const child=w.npcs[1],spouse=w.npcs[2];child.life.parentIds=[n.id];n.life.partnerId=spouse.id;n.identity.name='<script>alert(1)</script>';
  const family=familyObservation(w,n.id);assert.equal(family.people.length,2);assert.equal(family.people[0].partner!.id,spouse.id);assert.equal(family.businesses[0].cash,24);assert.equal(family.coins,n.wealth+child.wealth);
  const v={epoch:'test',tick:w.tick,roots:[],dynasty:null,family};const html=familyDashboard(v,false);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('id="dynasty-business"'));assert.ok(familyTree(v).includes('1–2 / 2명'));
});
test('business command enforces owner rights, revision checks and exactly-once payment',async()=>{
  const DB=database(),store=new WorldStore(DB);await store.init(Date.now());let saved=await store.read();const {w,n,e}=fixture();delete e.business; // use a separately balanced pre-acquisition world
  n.wealth+=48;w.market.coins-=24;
  saved={...saved,state:w,revision:saved.revision+1};saved.meta.eventCount=w.events.length;await store.commit(saved,w.events,'fixture',crypto.randomUUID());
  const env={DB,SITE_OWNER_EMAIL:'owner@example.test',ASSETS:{fetch:()=>new Response('asset')}} as never;
  const call=(who:string,body:unknown)=>worker.fetch(new Request('https://world.test/api/command',{method:'POST',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':`${who}@example.test`,Origin:'https://world.test','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
  const command={id:crypto.randomUUID(),revision:saved.revision,action:{type:'business-acquire',npcId:n.id,enterpriseId:e.id}};
  // Establish the owner first so the test guest cannot bootstrap ownership.
  await worker.fetch(new Request('https://world.test/api/world',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test'}}),env);
  assert.equal((await call('guest',command)).status,403);assert.equal((await call('owner',command)).status,200);const after=await store.read();assert.equal((await call('owner',command)).status,200);assert.deepEqual((await store.read()).state.urban.enterprises[0].business,after.state.urban.enterprises[0].business);
  assert.equal((await call('owner',{...command,id:crypto.randomUUID()})).status,409);
});
test('exact published v0.27 engine restores pending progress under its original rules',async()=>{
  const fingerprint='d1c19bfa17149028ebf4ad10664f9b11408d705f703b1c0962cc2bdee535193c';
  const {retainedEngine}=await import('../src/server/engine-registry');const {LegacySimulation}=await retainedEngine(fingerprint)!();
  const DB=database(),store=new WorldStore(DB);await store.init(Date.now());const saved=await store.read(),sim=LegacySimulation.load(JSON.stringify(saved.state));sim.setLLM(false);saved.state=sim.snapshot() as unknown as WorldState;saved.meta.aiMode='off';await DB.batch([DB.prepare('DELETE FROM snapshots WHERE epoch=?').bind(saved.epoch),...store.snapshotStatements(saved.epoch,saved.state),DB.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);sim.step(60,undefined);
  const state=sim.snapshot() as unknown as WorldState,old=new Set(saved.state.events.map(e=>e.id)),count=state.events.filter(e=>!old.has(e.id)).length;
  const meta={...saved.meta,eventCount:saved.meta.eventCount+count};await DB.batch([DB.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:fingerprint,epoch:saved.epoch,ticks:60,meta,started:Date.now(),id:crypto.randomUUID()}))]);
  const recovered=await new LiveWorldStore(DB,'v028').read();assert.deepEqual(recovered.state,JSON.parse(JSON.stringify(compactWorld(state))));assert.equal(await DB.prepare('SELECT * FROM world_live').first(),null);
});
test('family revisit uses archived participant events and independent account bookmarks',async()=>{
  const DB=database(),store=new WorldStore(DB);await store.init(Date.now());let saved=await store.read();const sim=Simulation.load(JSON.stringify(saved.state)),root=sim.createCharacter(defaultCharacter(availableHomes(saved.state).find(h=>h.vacant)!.home.id));
  const state=sim.snapshot();saved={...saved,state,revision:saved.revision+1,meta:{...saved.meta,eventCount:state.events.length}};
  await store.commit(saved,state.events,'fixture',crypto.randomUUID());await DB.batch([DB.prepare("INSERT INTO world_members(id,email,name,role,blocked) VALUES('guest','guest@example.test','guest','participant',0)"),DB.prepare("INSERT INTO npc_creators(epoch,npc,member,command) VALUES(?,?,'guest','test-founder')").bind(saved.epoch,root)]);
  const member={id:'guest',name:'guest',email:'guest@example.test',role:'participant' as const,blocked:0};
  await dynastyAPI(store,member,saved,undefined,{type:'found',epoch:saved.epoch,root});const first=await dynastyAPI(store,member,saved);assert.equal(first.changes!.since,null);
  saved.state.tick++;const e=appendEvent(saved.state,{kind:'migration',actorId:root,importance:50,description:'가문원 이주 기록'});saved.meta.eventCount++;saved.revision++;await store.commit(saved,[e],'fixture',crypto.randomUUID());
  const returned=await dynastyAPI(store,member,{...saved,state:compactWorld(saved.state)});assert.equal(returned.changes!.events[0].id,e.id);assert.equal(returned.changes!.coinDelta,0);
  const again=await dynastyAPI(store,member,saved);assert.equal(again.changes!.events.length,0);assert.equal((await DB.prepare('SELECT count(*) AS n FROM dynasty_visits').first<{n:number}>())!.n,1);
});
test('remembered contribution changes actual voluntary project donation without bypassing money or location',async()=>{
  const {cooperationTick}=await import('../src/sim/cooperation');
  const w=new Simulation().snapshot(),[proposer,donor]=w.npcs,venue=w.buildings.find(b=>b.kind==='market')!;
  donor.personality.empathy=44;donor.needs.hunger=10;donor.position={...venue.position};const funds=80-donor.wealth;w.market.coins-=funds;donor.wealth+=funds;
  const help=appendEvent(w,{kind:'share',actorId:proposer.id,targetId:donor.id,importance:45,description:'직접 받은 식량 도움'});creditContribution(w,help);
  const proposal=appendEvent(w,{kind:'project',actorId:proposer.id,importance:55,description:'함께 지을 집',data:{initiative:'initiative-test',phase:'proposed'}});
  w.cooperation={projects:[{id:'initiative-test',settlementId:proposer.settlementId,proposerId:proposer.id,kind:'home',created:w.tick,status:'collecting',source:proposal.id,latest:proposal.id,donated:0,reason:'주거 부족'}],provisions:[]};
  // Move all existing market money into an unrelated resident, so actual donations are needed.
  w.npcs[2].wealth+=w.market.coins;w.market.coins=0;w.tick=72;
  const control=structuredClone(w);delete control.npcs[1].life.support;cooperationTick(control);
  const before=donor.wealth;cooperationTick(w);assert.equal(donor.wealth,before-2);assert.equal(control.npcs[1].wealth,before);
  const donation=w.events.find(e=>e.data.phase==='donated'&&e.actorId===donor.id)!;assert.ok((donation.data.evidence as string[]).includes(help.id));assert.ok(Number(donation.data.trustBonus)>0);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
});
