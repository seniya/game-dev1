import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { stageForPopulation, developmentDay, occupationAllowed, industryAllowed, availableOccupations } from '../src/sim/development';
import { childhoodTick, safePlayPlace } from '../src/sim/childhood';
import { careTick, injure } from '../src/sim/care';
import { conflictPressure, startConflict, conflictsTick } from '../src/sim/conflicts';
import { reserve, reserved } from '../src/sim/village-actions';
import { createCharacter } from '../src/sim/characters';
import { defaultCharacter } from '../src/ui/characters';
import { appendEvent } from '../src/sim/social';
import { buildEnterprise, urbanBalance } from '../src/sim/urban';
import { compactWorld } from '../src/server/world';
import { balance, createEconomy } from '../src/sim/economy';
import { indexPeople } from '../src/sim/spatial';
import { YEAR_TICKS, type WorldState } from '../src/sim/types';
import { lifeDay } from '../src/sim/life';
import { villageLifeView } from '../src/ui/village-life';
import { domesticTick } from '../src/sim/domestic';
import { LiveWorldStore } from '../src/server/live-store';
import { WorldStore } from '../src/server/store';
import { database } from './helpers/database';

function base(){const s=new Simulation();s.setLLM(false);return s.snapshot();}
function calm(w:WorldState){for(const n of w.npcs){n.needs.hunger=10;n.needs.thirst=10;n.needs.fatigue=10;n.needs.health=100;delete n.currentAction;}indexPeople(w);}
function source(w:WorldState,a=w.npcs[0],b=w.npcs[1]){return appendEvent(w,{kind:'talk',actorId:a.id,targetId:b.id,importance:45,description:'의견이 다른 실제 만남'});}
function settled(population:number){const w=new Simulation(42,population).snapshot();calm(w);for(const n of w.npcs){n.settlementId='v0';n.homeId='b4';}w.storage.food=1000;w.storage.wood=200;w.market.coins=1000;w.economy=createEconomy(w);return w;}
function demandDays(w:WorldState,days=2){for(let i=0;i<days;i++){w.tick=(Math.floor(w.tick/144)+1)*144;const d=w.villageLife!.settlements.v0;d.todayProduced=200;d.todayConsumed=100;developmentDay(w);}}

test('simple start has three livelihoods, three children and no automatic industry',()=>{
 const w=base();assert.equal(w.npcs.filter(n=>n.identity.age>=18&&n.identity.age<65).length,8);
 assert.deepEqual(w.npcs.filter(n=>n.identity.age<18).map(n=>n.identity.age),[2,4,8]);
 assert.deepEqual(new Set(w.npcs.filter(n=>n.identity.age>=18&&n.identity.age<65).map(n=>n.occupation)),new Set(['farmer','gatherer','homemaker']));
 assert.equal(buildEnterprise(w,'v0','mine'),undefined);assert.equal(industryAllowed(w,'v0','field'),false);
 assert.deepEqual(Object.keys(availableOccupations(w,'v0')),['homemaker','farmer','gatherer','none']);
 Simulation.load(JSON.stringify(w));
});
test('all population boundaries have stable stages and require two daily observations',()=>{
 for(const [n,expected] of [[19,0],[20,1],[39,1],[40,2],[79,2],[80,3],[149,3],[150,4]]){
  assert.equal(stageForPopulation(n),expected);const w=settled(n);demandDays(w,1);assert.equal(w.villageLife!.settlements.v0.stage,0);demandDays(w,1);assert.equal(w.villageLife!.settlements.v0.stage,expected);
 }
});
test('specialization needs demand, supply, workers and funds; knowledge survives population loss',()=>{
 const w=settled(40);demandDays(w);const d=w.villageLife!.settlements.v0;
 assert.ok(d.unlocked.length>4);assert.equal(w.villageLife!.stats.careerChanges,1);
 const unlocked=[...d.unlocked];w.npcs.slice(12).forEach(n=>n.alive=false);demandDays(w);assert.ok(unlocked.every(j=>d.unlocked.includes(j)));
 const poor=settled(40);poor.storage.wood=0;demandDays(poor);assert.equal(poor.villageLife!.stats.careerChanges,0);
 const children=settled(40);for(const n of children.npcs)n.identity.age=8;demandDays(children);assert.equal(children.villageLife!.stats.careerChanges,0);
});
test('creating a locked job rejects before any state mutation while unlocked creation succeeds',()=>{
 const w=base(),input={...defaultCharacter('b4'),occupation:'healer' as const},before=JSON.stringify(w);
 assert.throws(()=>createCharacter(w,input),/전문 직업/);assert.equal(JSON.stringify(w),before);
 w.villageLife!.settlements.v0.unlocked.push('healer');assert.equal(createCharacter(w,input).occupation,'healer');
});
test('four-year-olds actually leave and return with a present adult; younger children stay home',()=>{
 const sim=new Simulation();sim.setLLM(false);let moved=false,supervised=false;
 for(let i=0;i<288;i++){sim.step();const w=sim.snapshot(),n=w.npcs.find(n=>n.identity.age===4)!;const a=w.villageLife!.activities[n.id];if(a?.kind==='play'&&!a.path.length){moved=true;const guardian=w.npcs.find(p=>p.id===a.guardian)!;assert.ok(Math.abs(guardian.position.x-n.position.x)+Math.abs(guardian.position.y-n.position.y)<=1);supervised=true;}}
 const w=sim.snapshot();assert.ok(moved&&supervised);assert.ok(w.events.some(e=>e.actorId==='npc9'&&e.data.phase==='returned'));assert.ok(!w.events.some(e=>e.actorId==='npc8'&&e.data.phase==='outing'));
 assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
});
test('age and weather boundaries never permit remote supervision or rainy outings',()=>{
 for(const age of [3,4,6,7,12,13,17]){const w=base();calm(w);w.tick=60;const n=w.npcs[9];n.identity.age=age;n.life.bornTick=w.tick-age*YEAR_TICKS;n.position={...w.buildings.find(b=>b.id===n.homeId)!.position};for(const p of w.npcs)if(p.identity.age>=18){p.needs.hunger=99;}childhoodTick(w);assert.equal(w.villageLife!.activities[n.id]?.kind==='play',age>=7);}
 const w=base();calm(w);w.tick=60;w.weather='rain';childhoodTick(w);assert.ok(!Object.values(w.villageLife!.activities).some(a=>a.kind==='play'));
});
test('paths and caregiver loss leave a child with a recoverable return rather than teleportation',()=>{
 const w=base();calm(w);w.tick=60;w.npcs[9].position={...w.buildings.find(b=>b.id===w.npcs[9].homeId)!.position};childhoodTick(w);const n=w.npcs[9],a=w.villageLife!.activities[n.id]!;assert.equal(a.kind,'play');
 const guardian=w.npcs.find(p=>p.id===a.guardian)!;guardian.alive=false;const before={...n.position};w.tick++;childhoodTick(w);assert.deepEqual(n.position,before);assert.equal(w.villageLife!.activities[n.id].kind,'return');
 assert.ok(safePlayPlace(w,n));
});
test('same encounter can deescalate or become an argument according to personality',()=>{
 for(const aggressive of [false,true]){const w=base();calm(w);const [a,b]=w.npcs;b.position={...a.position};for(const n of [a,b]){n.personality.aggression=aggressive?100:0;n.personality.empathy=aggressive?0:100;w.living.people[n.id].traits.patience=aggressive?0:100;}
 const e=source(w);assert.equal(startConflict(w,a,b,e),true);w.tick+=2;conflictsTick(w);assert.equal(w.villageLife!.stats.arguments,aggressive?1:0);assert.equal(startConflict(w,a,b,e),false);}
});
test('bounded physical conflict links injury, preserves distinct relationships and separates participants',()=>{
 const w=base();calm(w);const [a,b]=w.npcs;for(const n of w.npcs){n.position={x:25,y:20};n.personality.empathy=0;w.living.people[n.id].traits.patience=0;}a.position={x:16,y:22};b.position={...a.position};a.personality.aggression=b.personality.aggression=100;indexPeople(w);
 const e=source(w);assert.ok(startConflict(w,a,b,e));w.tick+=2;conflictsTick(w);w.rng=1;w.tick+=4;conflictsTick(w);
 assert.equal(w.villageLife!.stats.collisions,1);assert.equal(w.villageLife!.injuries.length,1);assert.equal(w.villageLife!.injuries[0].cause,'conflict');
 w.tick+=4;conflictsTick(w);assert.equal(w.villageLife!.conflicts.length,0);assert.equal(startConflict(w,a,b,source(w)),false);
 const saved=Simulation.load(JSON.stringify(compactWorld(w)));assert.equal(saved.snapshot().villageLife!.injuries.length,1);
});
test('adult-child disputes cannot cause physical injury even with maximum aggression',()=>{
 const w=base();calm(w);const a=w.npcs[0],b=w.npcs[9];b.position={...a.position};for(const n of w.npcs){n.personality.empathy=0;w.living.people[n.id].traits.patience=0;}a.personality.aggression=b.personality.aggression=100;indexPeople(w);
 assert.ok(startConflict(w,a,b,source(w,a,b)));w.tick+=2;conflictsTick(w);w.tick+=4;w.rng=1;conflictsTick(w);assert.equal(w.villageLife!.stats.collisions,0);
});
test('injury interrupts work, treatment needs a real visit and spends actual materials and fees once',()=>{
 const w=base();calm(w);const n=w.npcs[0],helper=w.npcs[2];helper.occupation='healer';helper.position={...n.position};const c=w.urban.cities[0];c.goods.herbs=1;c.goods.cloth=1;w.urban.ledger.opening.herbs=1;w.urban.ledger.opening.cloth=1;w.economy=createEconomy(w);
 injure(w,n,'work',source(w),'moderate');const i=w.villageLife!.injuries[0];assert.ok(reserve(w,helper,'care',n.position,'현장 처치',{source:i.latest,partner:n.id}));const cash=n.wealth;
 for(let j=0;j<4;j++){w.tick++;careTick(w);}assert.equal(c.goods.herbs,0);assert.equal(c.goods.cloth,0);assert.equal(n.wealth,cash-2);assert.equal(w.villageLife!.stats.treatments,1);
 careTick(w);assert.equal(n.wealth,cash-2);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});assert.ok(Object.values(urbanBalance(w)).every(v=>v===0));Simulation.load(JSON.stringify(compactWorld(w)));
});
test('basic care without funds or medicine still helps without creating treatment resources',()=>{
 const w=base();calm(w);const n=w.npcs[0],helper=w.npcs[1];helper.position={...n.position};n.wealth=0;w.economy=createEconomy(w);injure(w,n,'play',source(w));
 reserve(w,helper,'care',n.position,'기본 돌봄',{source:w.villageLife!.injuries[0].source,partner:n.id});for(let j=0;j<4;j++){w.tick++;careTick(w);}
 assert.equal(w.events.find(e=>e.data.phase==='cared')?.data.coins,0);assert.ok(!w.events.some(e=>e.data.phase==='treated'));assert.deepEqual(balance(w),{food:0,wood:0,coins:0});
});
test('rest produces a sourced recovery and clears injury exactly once',()=>{
 const w=base();calm(w);const n=w.npcs[0];injure(w,n,'play',source(w));for(let j=0;j<100;j++){w.tick++;careTick(w);}assert.equal(w.villageLife!.injuries.length,0);assert.equal(w.urban.citizens[n.id].injury,0);assert.equal(w.villageLife!.stats.recoveries,1);assert.equal(w.events.filter(e=>e.data.phase==='recovered').length,1);
});
test('mid-outing, dispute and injury resume identically after checkpoint compaction',()=>{
 const w=base();calm(w);w.tick=60;childhoodTick(w);const [a,b]=w.npcs;b.position={...a.position};if(!reserved(w,a)&&!reserved(w,b))startConflict(w,a,b,source(w));injure(w,w.npcs[7],'work',source(w,w.npcs[7],w.npcs[6]),'moderate');
 const checkpoint=JSON.stringify(compactWorld(w)),one=Simulation.load(checkpoint),two=Simulation.load(checkpoint);one.step(288);two.step(288);assert.equal(one.save(),two.save());assert.deepEqual(balance(one.snapshot()),{food:0,wood:0,coins:0});
});
test('validation rejects forged activity references, clocks, paths and injury totals',()=>{
 const w=base();calm(w);injure(w,w.npcs[0],'play',source(w));
 for(const corrupt of [(x:WorldState)=>{x.villageLife!.injuries[0].source='missing';},(x:WorldState)=>{x.villageLife!.activities.npc0.since=x.tick+1;},(x:WorldState)=>{x.urban.citizens.npc0.injury=99;},(x:WorldState)=>{x.villageLife!.activities.npc0.path=[{x:0,y:0}];}]){const x=structuredClone(w);corrupt(x);assert.throws(()=>Simulation.load(JSON.stringify(x)));}
});
test('village overview is read-only and escapes resident-derived text',()=>{
 const w=base();w.villageLife!.settlements.v0.reason='<img onerror=alert(1)>';const before=JSON.stringify(w),html=villageLifeView(w);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('먹거리 담당'));assert.equal(JSON.stringify(w),before);
});
test('teaching requires the actual shared site and grants no adult wages or production to children',()=>{
 const w=base();calm(w);const teacher=w.npcs[0],child=w.npcs[10];teacher.occupation='teacher';teacher.position={...child.position};const before={food:w.economy.totals.producedFood,coins:child.wealth,education:w.urban.citizens[child.id].education};const e=source(w,teacher,child);
 reserve(w,teacher,'learn',child.position,'가르치기',{partner:child.id,source:e.id});reserve(w,child,'learn',child.position,'배우기',{partner:teacher.id,source:e.id});for(let i=0;i<6;i++){w.tick++;domesticTick(w);}assert.ok(w.urban.citizens[child.id].education>before.education);assert.equal(child.wealth,before.coins);assert.equal(w.economy.totals.producedFood,before.food);
});
test('the last deployed engine recovers its pending clock before new village rules',async()=>{
 const fingerprint='946b7eb767208c62184089d580cfe046f0b18bcabe48ca6842eb544123efbb14';
 const {retainedEngine}=await import('../src/server/engine-registry');const {LegacySimulation}=await retainedEngine(fingerprint)!();
 const db=database(),store=new WorldStore(db);await store.init(Date.now());const saved=await store.read();const old=new LegacySimulation(42,12);old.setLLM(false);saved.state=old.snapshot() as unknown as WorldState;saved.meta.aiMode='off';
 await db.batch([db.prepare('DELETE FROM snapshots WHERE epoch=?').bind(saved.epoch),...store.snapshotStatements(saved.epoch,saved.state),db.prepare('UPDATE world SET meta=?').bind(JSON.stringify(saved.meta))]);old.step(60,undefined);
 const after=old.snapshot() as unknown as WorldState,ids=new Set(saved.state.events.map(e=>e.id)),count=after.events.filter(e=>!ids.has(e.id)).length;
 await db.batch([db.prepare('INSERT INTO world_live VALUES(1,?,1,?)').bind(saved.revision,JSON.stringify({build:fingerprint,epoch:saved.epoch,ticks:60,meta:{...saved.meta,eventCount:saved.meta.eventCount+count},started:Date.now(),id:crypto.randomUUID()}))]);
 const recovered=await new LiveWorldStore(db,'village-life').read();assert.deepEqual(recovered.state,JSON.parse(JSON.stringify(compactWorld(after))));assert.equal(recovered.state.villageLife,undefined);
});

test('adoption preserves old people, skills, assets and injury amount without fabricating a cause',async()=>{
 const {LegacySimulation}=await import('../src/server/retained/946b7eb767208c62184089d580cfe046f0b18bcabe48ca6842eb544123efbb14');
 const {adoptVillageLife}=await import('../src/sim/development');const old=new LegacySimulation(42,12).snapshot() as unknown as WorldState;old.urban.citizens.npc0.injury=10;
 const people=JSON.stringify(old.npcs),economy=JSON.stringify(old.economy),rng=old.rng;adoptVillageLife(old);
 assert.equal(JSON.stringify(old.npcs),people);assert.equal(JSON.stringify(old.economy),economy);assert.equal(old.rng,rng);assert.equal(old.villageLife!.injuries[0].remaining,10);assert.equal(old.villageLife!.injuries[0].cause,'existing');
 assert.ok(old.npcs.every(n=>occupationAllowed(old,n.settlementId,n.occupation)));const save=JSON.stringify(old);adoptVillageLife(old);assert.equal(JSON.stringify(old),save);Simulation.load(JSON.stringify(compactWorld(old)));
});
test('reaching adulthood releases childhood reservations and guardian schedules',()=>{
 const w=base();calm(w);const child=w.npcs[9],guardian=w.npcs[0];const e=source(w,child,guardian);reserve(w,child,'play',child.position,'놀이',{guardian:guardian.id,source:e.id});reserve(w,guardian,'supervise',child.position,'보호',{partner:child.id,source:e.id});
 child.life.bornTick=w.tick-18*YEAR_TICKS;lifeDay(w);assert.equal(child.identity.age,18);assert.equal(w.villageLife!.activities[child.id],undefined);assert.equal(w.villageLife!.activities[guardian.id],undefined);
});

test('large starting populations assign every child a living adult without exceeding home capacity',()=>{
 for(const count of [12,300,1000,3000]){const w=new Simulation(42,count).snapshot();const homes=new Map<string,typeof w.npcs>();for(const n of w.npcs){const group=homes.get(n.homeId)??[];group.push(n);homes.set(n.homeId,group);}for(const n of w.npcs.filter(n=>n.identity.age<18))assert.ok(homes.get(n.homeId)!.some(p=>p.identity.age>=18));for(const b of w.buildings.filter(b=>b.kind==='home'))assert.ok((homes.get(b.id)?.length??0)<=2+b.level*2);}
});

test('a lesson releases the child when the teacher disappears',()=>{
 const w=base();calm(w);const teacher=w.npcs[0],child=w.npcs[10],e=source(w,child,teacher);reserve(w,teacher,'learn',child.position,'배움',{partner:child.id,source:e.id});reserve(w,child,'learn',child.position,'배움',{partner:teacher.id,source:e.id});teacher.alive=false;domesticTick(w);assert.equal(w.villageLife!.activities[child.id],undefined);
});
