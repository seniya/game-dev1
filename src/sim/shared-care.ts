import type { NPC, WorldState } from './types';
import { findPath } from './pathfinding';
import { distance, clamp } from './random';
import { person, neighbours } from './spatial';
import { isTravelling } from './civilization';
import { reserve, release, available, advanceActivity } from './village-actions';
import { villagePerson } from './development';
import { appendEvent } from './social';

export function supervisedChildren(w:WorldState,adult:NPC) {
 return Object.entries(w.villageLife?.activities??{}).filter(([,a])=>a.guardian===adult.id&&['play','return'].includes(a.kind)).map(([id])=>person(w,id)).filter((n):n is NPC=>!!n?.alive&&!isTravelling(w,n)&&n.identity.age<18);
}
export function guardianOrder(w:WorldState,a:NPC,b:NPC){return (villagePerson(w,a).supervisedTicks??0)-(villagePerson(w,b).supervisedTicks??0)||b.personality.empathy-a.personality.empathy||a.id.localeCompare(b.id);}
export function restedGuardian(w:WorldState,n:NPC){return available(w,n)&&w.tick>=(villagePerson(w,n).restUntil??0);}
export function advanceGuardians(w:WorldState,returnHome:(w:WorldState,n:NPC,source:string,g?:NPC)=>void){
 const s=w.villageLife!;
 for(const [id,a] of Object.entries(s.activities)){
  const n=person(w,id);if(!n?.alive){delete s.activities[id];continue;}
  if(n.identity.age<18||!['escort','supervise','return'].includes(a.kind))continue;
  if(a.handoffFrom){
   const old=person(w,a.handoffFrom),children=old?supervisedChildren(w,old):[],prior=old?s.activities[old.id]:undefined;
   if(!old?.alive||!prior||prior.kind!=='supervise'||!children.length||children.some(c=>distance(c.position,a.target)>1)||isTravelling(w,n)||w.tick>a.until||n.needs.hunger>70||n.needs.thirst>75){release(w,n);continue;}
   if(!advanceActivity(w,n)||distance(n.position,old.position)>1)continue;
   const e=appendEvent(w,{kind:'family',actorId:old.id,targetId:n.id,participants:[old.id,n.id,...children.map(c=>c.id)],causeId:a.source,importance:45,description:`${old.identity.name}이 마당에서 ${n.identity.name}에게 아이 ${children.length}명의 돌봄을 직접 인계하고 일과 휴식으로 돌아갔다.`,data:{villageLife:true,phase:'care-handoff',children:children.map(c=>c.id)}});
   for(const child of children){s.activities[child.id].guardian=n.id;s.activities[child.id].source=e.id;}
   delete a.handoffFrom;a.kind='supervise';a.partner=children[0].id;a.source=e.id;a.until=w.tick+42;a.reason=`아이 ${children.length}명을 인계받아 같은 마당에서 지켜봅니다.`;
   villagePerson(w,old).restUntil=w.tick+72;release(w,old);continue;
  }
  const children=supervisedChildren(w,n),child=children[0];
  if(isTravelling(w,n)||!child){release(w,n);continue;}a.partner=child.id;
  const load=villagePerson(w,n);load.supervisedTicks=(load.supervisedTicks??0)+1;s.stats.careTicks++;
  if(a.kind==='escort'||a.kind==='return'){
   if(a.kind==='escort'&&children.some(c=>distance(n.position,c.position)>1)){
    const path=findPath(w,n.position,child.position);if(path?.length)n.position=path[0];a.path=findPath(w,n.position,a.target)??[];continue;
   }
   const destination=a.kind==='escort'?s.activities[child.id].target:a.target;
   if(distance(a.target,destination)>0){a.target={...destination};a.path=findPath(w,n.position,destination)??[];}
   if(children.every(c=>distance(n.position,c.position)<=1)&&(!a.path.length||children.every(c=>distance(a.path[0],c.position)<=1))){
    if(advanceActivity(w,n)&&a.kind==='escort'){a.kind='supervise';a.reason=`아이 ${children.length}명이 노는 곳에서 지켜봅니다.`;}
   }
  }else{
   const urgent=n.needs.hunger>70||n.needs.thirst>75||n.needs.fatigue>75||w.urban.citizens[n.id].injury>0;
   if(w.tick>a.until||urgent){returnHome(w,child,a.source,n);continue;}
   n.needs.fatigue=clamp(n.needs.fatigue-.25);
   // The old guardian remains on site while a willing neighbor walks to the handoff.
   if(w.tick-a.since>=12&&children.every(c=>distance(c.position,n.position)<=1)&&!Object.values(s.activities).some(x=>x.handoffFrom===id)){
    const next=neighbours(w,n,6).filter(p=>p.id!==id&&p.identity.age>=18&&p.settlementId===n.settlementId&&restedGuardian(w,p)).sort((a,b)=>guardianOrder(w,a,b))[0];
    if(next&&reserve(w,next,'escort',n.position,'마당으로 가서 이웃의 돌봄 순번을 이어받습니다.',{source:a.source,partner:child.id,duration:18}))s.activities[next.id].handoffFrom=n.id;
   }
  }
 }
}
