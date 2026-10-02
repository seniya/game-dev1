import type { NPC, Occupation, WorldEvent, WorldState } from './types';
import { OCCUPATIONS } from './types';
import { availableOccupations, villagePerson } from './development';
import { appendEvent, changeRelationship } from './social';
import { capacity, isTravelling, stocks } from './civilization';
import { INDUSTRY_JOB } from './urban-types';

/** Bounded factual memory: no imagined past on adoption, at most 8 people per experience kind. */
export function rememberGrowth(w:WorldState,n:NPC,other:NPC,kind:'friend'|'lesson'|'help',e:WorldEvent) {
 if(!w.villageLife||n.identity.age>=18||n.id===other.id)return;
 const memories=villagePerson(w,n).growth??=[];let m=memories.find(m=>m.kind===kind&&m.person===other.id);
 if(m?.source===e.id)return;
 if(!m){const same=memories.filter(x=>x.kind===kind);if(same.length>=8)memories.splice(memories.indexOf(same.sort((a,b)=>a.tick-b.tick)[0]),1);m={kind,person:other.id,source:e.id,first:e.id,count:0,tick:w.tick};memories.push(m);}
 m.source=e.id;m.tick=w.tick;m.count=Math.min(1000,m.count+1);if(kind==='lesson')m.occupation=other.occupation;
}
export function chooseGrownCareer(w:WorldState,n:NPC):boolean {
 if(!w.villageLife)return false;
 const memory=villagePerson(w,n);if(memory.careerSource)return true;
 const learned=memory.growth??[],d=w.villageLife.settlements[n.settlementId],family=n.life.apprenticeship;
 const people=w.npcs.filter(p=>p.alive&&p.settlementId===n.settlementId&&p.identity.age>=18&&p.identity.age<65);
 const foodWorkers=people.filter(p=>['farmer','gatherer'].includes(p.occupation)).length;
 const foodNeed=foodWorkers<Math.ceil(people.length/2)||!!d&&d.production<d.consumption;
 const scores=(Object.keys(availableOccupations(w,n.settlementId)) as Occupation[]).filter(j=>j!=='none').map(job=>{
  let score=job==='farmer'?n.personality.diligence*.15:job==='gatherer'?n.personality.curiosity*.15:n.personality.empathy*.1;
  if(foodNeed&&['farmer','gatherer'].includes(job))score+=16;
  score+=learned.filter(m=>m.kind==='lesson'&&m.occupation===job).reduce((sum,m)=>sum+Math.min(20,m.count*2),0);
  if(['caregiver','homemaker','healer'].includes(job))score+=Math.min(8,learned.filter(m=>m.kind==='help').length*2);
  if(family&&INDUSTRY_JOB[family.kind]===job)score+=Math.min(24,family.lessons*2)+(n.life.ambition==='family'?8:0)-w.living.people[n.id].traits.independence*.15;
  return {job,score};
 }).sort((a,b)=>b.score-a.score||a.job.localeCompare(b.job));
 n.occupation=scores[0]?.job??'none';
 if(family)family.choice=INDUSTRY_JOB[family.kind]===n.occupation?'continue':'independent';
 const evidence=[...new Set([...learned.map(m=>m.source),...(family?[family.source]:[])])];
 const e=appendEvent(w,{kind:'occupation',actorId:n.id,causeId:evidence.at(-1),importance:60,description:`${n.identity.name}이 어린 시절의 배움과 도움, 자신의 성향${foodNeed?', 마을의 먹거리 필요':''}를 생각해 ${OCCUPATIONS[n.occupation]} 일을 선택했다.`,data:{villageLife:true,phase:'grown-career',occupation:n.occupation,foodNeed,evidence}});
 memory.careerSource=e.id;memory.careerTick=w.tick;
 for(const m of learned.filter(m=>m.kind==='friend')){const friend=w.npcs.find(p=>p.id===m.person);if(friend?.alive)changeRelationship(w,n,friend.id,{trust:Math.min(3,m.count)},e,'어릴 때 함께 보낸 실제 놀이 경험을 성인이 되어서도 기억한다.');}
 return true;
}

/** Diagnostic conditions, not a prediction or a promise of births. */
export function growthConditions(w:WorldState,id:string) {
 const people=w.npcs.filter(n=>n.alive&&n.settlementId===id&&!isTravelling(w,n));
 const homes=w.buildings.filter(b=>b.kind==='home'&&b.settlementId===id);
 const occupancy=new Map<string,number>();for(const n of w.npcs.filter(n=>n.alive&&n.settlementId===id))occupancy.set(n.homeId,(occupancy.get(n.homeId)??0)+1);
 const byId=new Map(people.map(n=>[n.id,n]));
 const blocks={age:0,health:0,spacing:0,housing:0,food:0,ready:0};
 for(const a of people){const b=byId.get(a.life.partnerId??'');if(!b||a.id>b.id||a.homeId!==b.homeId)continue;
  if([a,b].some(n=>n.identity.age<18||n.identity.age>45)){blocks.age++;continue;}
  if([a,b].some(n=>n.needs.health<65||n.needs.hunger>60)){blocks.health++;continue;}
  if([a,b].some(n=>w.tick-n.life.lastBirth<144*12*2)){blocks.spacing++;continue;}
  const home=homes.find(h=>h.id===a.homeId),count=occupancy.get(a.homeId)??0;
  if(!home||count>=capacity(home)){blocks.housing++;continue;}
  if(stocks(w,id).food+a.inventory.food+b.inventory.food<(count+1)*4){blocks.food++;continue;}blocks.ready++;
 }
 return {population:people.length,children:people.filter(n=>n.identity.age<18).length,adults:people.filter(n=>n.identity.age>=18&&n.identity.age<65).length,freeBeds:homes.reduce((sum,h)=>sum+Math.max(0,capacity(h)-(occupancy.get(h.id)??0)),0),food:stocks(w,id).food,blocks,careTicks:people.reduce((sum,n)=>sum+(w.villageLife?.people[n.id]?.supervisedTicks??0),0)};
}
