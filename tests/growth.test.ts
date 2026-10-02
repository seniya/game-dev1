import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { rememberGrowth, chooseGrownCareer, growthConditions } from '../src/sim/growth';
import { childhoodTick, safePlayPlace } from '../src/sim/childhood';
import { reserve } from '../src/sim/village-actions';
import { supervisedChildren } from '../src/sim/shared-care';
import { careTick, injure } from '../src/sim/care';
import { resolveMediation } from '../src/sim/conflicts';
import { appendEvent } from '../src/sim/social';
import { indexPeople } from '../src/sim/spatial';
import { compactWorld } from '../src/server/world';
import { growthJourneyView, villageLifeView } from '../src/ui/village-life';
import { balance } from '../src/sim/economy';
function base(){const w=new Simulation(42,12).snapshot();w.tick=60;w.weather='sunny';for(const n of w.npcs){n.needs.hunger=n.needs.thirst=n.needs.fatigue=10;delete n.currentAction;}indexPeople(w);return w;}
function contact(w:ReturnType<typeof base>,a=w.npcs[0],b=w.npcs[1]){return appendEvent(w,{kind:'talk',actorId:a.id,targetId:b.id,importance:40,description:'실제 현장 만남'});}
test('shared sibling outing caps each guardian at three, moves physically and returns together',()=>{
 const w=base(),kids=w.npcs.slice(8,11),adult=w.npcs[0],home=w.buildings.find(b=>b.id===adult.homeId)!;
 for(const n of kids){n.identity.age=4;n.homeId=home.id;n.position={...home.position};}adult.position={...home.position};for(const n of w.npcs)if(n.identity.age>=18&&n!==adult)n.needs.fatigue=80;indexPeople(w);
 childhoodTick(w);assert.equal(supervisedChildren(w,adult).length,3);
 for(let i=0;i<65;i++){w.tick++;indexPeople(w);childhoodTick(w);for(const child of kids){const a=w.villageLife!.activities[child.id];if(a?.kind==='play'&&!a.path.length){const g=w.npcs.find(n=>n.id===a.guardian)!;assert.ok(Math.abs(g.position.x-child.position.x)+Math.abs(g.position.y-child.position.y)<=1);}}}
 assert.ok(w.villageLife!.stats.returns>=3);assert.ok((w.villageLife!.people[adult.id].supervisedTicks??0)>0);
});
test('handoff leaves original guardian on site until successor physically arrives',()=>{
 const w=base(),child=w.npcs[9],old=w.npcs[0],next=w.npcs[1],yard=safePlayPlace(w,child)!;
 child.position={...yard};old.position={...yard};next.position={x:yard.x+1,y:yard.y};const e=contact(w,old,child);
 reserve(w,child,'play',yard,'놀이',{guardian:old.id,source:e.id,duration:42});reserve(w,old,'supervise',yard,'돌봄',{partner:child.id,source:e.id,duration:42});
 reserve(w,next,'escort',yard,'인계하러 이동',{partner:child.id,source:e.id});w.villageLife!.activities[next.id].handoffFrom=old.id;
 indexPeople(w);childhoodTick(w);assert.equal(w.villageLife!.activities[child.id].guardian,old.id);
 w.tick++;indexPeople(w);childhoodTick(w);assert.equal(w.villageLife!.activities[child.id].guardian,next.id);assert.equal(w.villageLife!.activities[old.id],undefined);assert.ok(w.events.some(e=>e.data.phase==='care-handoff'));
 const one=Simulation.load(JSON.stringify(compactWorld(w))),two=Simulation.load(one.save());one.step(48);two.step(48);assert.equal(one.save(),two.save());
});
test('cancelled handoff cannot leave a child supervised by a remote or departed successor',()=>{
 const w=base(),child=w.npcs[9],old=w.npcs[0],next=w.npcs[1],e=contact(w,old,child);old.position={...child.position};
 reserve(w,child,'play',child.position,'놀이',{guardian:old.id,source:e.id});reserve(w,old,'supervise',child.position,'돌봄',{partner:child.id,source:e.id});reserve(w,next,'escort',child.position,'인계',{partner:child.id,source:e.id});w.villageLife!.activities[next.id].handoffFrom=old.id;next.needs.hunger=95;childhoodTick(w);assert.equal(w.villageLife!.activities[child.id].guardian,old.id);assert.equal(w.villageLife!.activities[next.id],undefined);
});
test('factual childhood experience survives compaction and influences permitted adult career once',()=>{
 const w=base(),child=w.npcs[9],mentor=w.npcs[0];mentor.occupation='gatherer';
 for(let i=0;i<15;i++){const e=contact(w,child,mentor);rememberGrowth(w,child,mentor,'lesson',e);rememberGrowth(w,child,mentor,'lesson',e);}
 assert.equal(w.villageLife!.people[child.id].growth![0].count,15);child.identity.age=18;
 assert.ok(chooseGrownCareer(w,child));assert.equal(child.occupation,'gatherer');const count=w.events.length;chooseGrownCareer(w,child);assert.equal(w.events.length,count);
 const restored=Simulation.load(JSON.stringify(compactWorld(w))).snapshot();assert.ok(restored.villageLife!.people[child.id].careerSource);assert.ok(growthJourneyView(restored,child).includes('성년의 진로 선택'));
});
test('childhood friend and help evidence remain distinct; locked occupation never bypasses village conditions',()=>{
 const w=base(),child=w.npcs[9],friend=w.npcs[10],mentor=w.npcs[0];mentor.occupation='healer';
 rememberGrowth(w,child,friend,'friend',contact(w,child,friend));rememberGrowth(w,child,mentor,'help',contact(w,child,mentor));for(let i=0;i<20;i++)rememberGrowth(w,child,mentor,'lesson',contact(w,child,mentor));child.identity.age=18;chooseGrownCareer(w,child);assert.notEqual(child.occupation,'healer');assert.ok(child.relationships.some(r=>r.npcId===friend.id));
});
test('mediation is fulfilled or broken by a new actual contact and not by time or remote claims',()=>{
 for(const broken of [false,true]){const w=base(),[a,b]=w.npcs;b.position={...a.position};const e=appendEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,importance:45,description:'현장 중재',data:{phase:'mediated'}}),key=[a.id,b.id].sort().join(':');w.villageLife!.agreements={[key]:{a:a.id,b:b.id,source:e.id,since:w.tick,until:w.tick+100}};
 resolveMediation(w,a,b,e,broken);assert.ok(w.villageLife!.agreements[key]);w.tick++;resolveMediation(w,a,b,contact(w,a,b),broken);assert.equal(w.villageLife!.agreements[key],undefined);assert.ok(w.events.some(e=>e.data.phase===(broken?'mediation-broken':'mediation-kept')));}
});
test('care records individual first wait and longest gap without double counting or creating resources',()=>{
 const w=base(),patient=w.npcs[0],helper=w.npcs[1];helper.position={...patient.position};injure(w,patient,'work',contact(w),'moderate');const injury=w.villageLife!.injuries[0];w.tick+=20;
 reserve(w,helper,'care',patient.position,'곁에서 돌보기',{partner:patient.id,source:injury.source});for(let i=0;i<4;i++){w.tick++;careTick(w);}assert.equal(injury.firstCareAt,84);assert.equal(w.villageLife!.careMetrics!.maxFirstCare,24);assert.equal(w.villageLife!.careMetrics!.completed,1);careTick(w);assert.equal(w.villageLife!.careMetrics!.completed,1);assert.deepEqual(balance(w),{food:0,wood:0,coins:0});Simulation.load(JSON.stringify(compactWorld(w)));
});
test('growth views explain real conditions, escape memory labels and do not mutate the world',()=>{
 const w=base(),child=w.npcs[9],mentor=w.npcs[0];mentor.identity.name='<img onerror=x>';rememberGrowth(w,child,mentor,'lesson',contact(w,child,mentor));const before=JSON.stringify(w);assert.ok(growthJourneyView(w,child).includes('&lt;img'));assert.ok(villageLifeView(w).includes('성장과 정체의 이유'));assert.equal(growthConditions(w,'v0').population,12);assert.equal(JSON.stringify(w),before);
});
test('forged growth source, future care clock and fabricated mediation cannot load',()=>{
 const w=base(),child=w.npcs[9];rememberGrowth(w,child,w.npcs[0],'lesson',contact(w,child,w.npcs[0]));const bad=structuredClone(w);bad.villageLife!.people[child.id].growth![0].source='missing';assert.throws(()=>Simulation.load(JSON.stringify(bad)));
 injure(w,w.npcs[0],'work',contact(w));w.villageLife!.injuries[0].firstCareAt=w.tick+1;assert.throws(()=>Simulation.load(JSON.stringify(w)));
});

test('a hungry child can receive real food at night without passing adult availability checks',async()=>{
 const {domesticTick}=await import('../src/sim/domestic');const w=base(),child=w.npcs[8],helper=w.npcs[0];w.tick=120;child.needs.hunger=95;child.inventory.food=0;helper.position={...child.position};helper.inventory.food=2;for(const n of w.npcs)if(n!==helper&&n.identity.age>=18)n.needs.hunger=80;indexPeople(w);
 const before=helper.inventory.food+child.inventory.food;domesticTick(w);assert.equal(w.villageLife!.activities[child.id]?.kind,'domestic');for(let i=0;i<6;i++){w.tick++;domesticTick(w);}assert.equal(helper.inventory.food,1);assert.equal(helper.inventory.food+child.inventory.food,before);assert.ok(w.villageLife!.people[child.id].growth?.some(m=>m.kind==='help'));
});

test('legacy injury wait starts at observation instead of inventing an earlier first visit',()=>{
 const w=base(),n=w.npcs[0];injure(w,n,'work',contact(w),'moderate');const injury=w.villageLife!.injuries[0];delete injury.observedSince;injury.treatedAt=w.tick;w.tick+=50;careTick(w);assert.equal(injury.observedSince,w.tick);assert.equal(injury.firstCareAt,undefined);assert.equal(injury.maxCareGap,0);Simulation.load(JSON.stringify(compactWorld(w)));
});
