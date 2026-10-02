import { occupationAllowed } from './development';
import { z } from 'zod';
import type { NPC, WorldState, WorldEvent } from './types';
import { INDUSTRIES, INDUSTRY_JOB, INDUSTRY_SKILL, INDUSTRY_LABELS } from './urban-types';
import { appendEvent, changeRelationship } from './social';
import { distance, clamp } from './random';
import { isTravelling } from './civilization';
const id=z.string().min(1).max(100),nat=z.number().int().nonnegative();
export const apprenticeshipSchema=z.object({mentor:id,enterprise:id,kind:z.enum(INDUSTRIES),lessons:nat.max(100),lastTick:nat,source:id,choice:z.enum(['learning','continue','independent']).optional()}).strict();
export type Apprenticeship=z.infer<typeof apprenticeshipSchema>;
export const supportSchema=z.object({giver:id,tick:nat,source:id}).strict();
export function learnFamilyTrade(w:WorldState,n:NPC){
  if(n.identity.age<12||n.identity.age>=18||n.needs.health<50||n.needs.hunger>=65||isTravelling(w,n))return;
  const mentor=w.npcs.find(p=>p.alive&&n.life.parentIds.includes(p.id)&&p.homeId===n.homeId&&!isTravelling(w,p));if(!mentor)return;
  const enterprise=w.urban.enterprises.find(e=>e.business?.shares.some(s=>s.npc===mentor.id)&&e.settlementId===n.settlementId);if(!enterprise)return;
  const old=n.life.apprenticeship;if(old&&w.tick-old.lastTick<144)return;
  const skill=INDUSTRY_SKILL[enterprise.kind],student=w.urban.citizens[n.id],teacher=w.urban.citizens[mentor.id];
  if(teacher.skills[skill]<=student.skills[skill])return;
  student.skills[skill]=Math.min(teacher.skills[skill],student.skills[skill]+.5);
  const event=appendEvent(w,{kind:'education',actorId:n.id,targetId:mentor.id,locationId:n.homeId,causeId:enterprise.business!.source,importance:45,description:`${n.identity.name}이 집에서 ${mentor.identity.name}에게 ${INDUSTRY_LABELS[enterprise.kind]}의 기술을 배웠다. 아동은 생산·고용에 참여하지 않는다.`,data:{business:enterprise.id,phase:'apprenticeship',skill:student.skills[skill]}});
  n.life.apprenticeship={mentor:mentor.id,enterprise:enterprise.id,kind:enterprise.kind,lessons:Math.min(100,(old?.enterprise===enterprise.id?old.lessons:0)+1),lastTick:w.tick,source:event.id,choice:'learning'};
}
export function chooseFamilyTrade(w:WorldState,n:NPC):boolean {
  const a=n.life.apprenticeship;if(!a)return false;
  const independence=w.living.people[n.id].traits.independence;
  const score=a.lessons*2+n.personality.diligence*.2+(n.life.ambition==='family'?12:0)-n.personality.curiosity*.2-independence*.2;
  const continues=occupationAllowed(w,n.settlementId,INDUSTRY_JOB[a.kind])&&score>=0&&w.urban.enterprises.some(e=>e.id===a.enterprise&&e.settlementId===n.settlementId);
  a.choice=continues?'continue':'independent';n.occupation=continues?INDUSTRY_JOB[a.kind]:'none';
  a.source=appendEvent(w,{kind:'occupation',actorId:n.id,targetId:a.mentor,causeId:a.source,importance:55,description:`${n.identity.name}이 성인이 되어 ${continues?`배운 ${INDUSTRY_LABELS[a.kind]} 일을 이어가기로`:'가업 밖에서 다른 일을 찾아보기로'} 했다. 배운 경험 ${a.lessons}회와 성실성·호기심·독립 성향을 함께 반영했다.`,data:{business:a.enterprise,phase:'career-choice',choice:a.choice,score,lessons:a.lessons}}).id;return true;
}
/** Only direct beneficiaries or nearby witnesses learn; at most one additional credit per receiver/day. */
export function creditContribution(w:WorldState,e:WorldEvent){
  if(e.data.observer===true)return;
  const direct=e.kind==='share'||e.kind==='education';
  const work=e.kind==='construction'&&e.data.phase==='worked';
  const donation=e.kind==='project'&&e.data.phase==='donated';
  if(!direct&&!work&&!donation)return;
  const giver=w.npcs.find(n=>n.id===(e.kind==='education'?e.targetId:e.actorId));if(!giver?.alive)return;
  const targets=direct?w.npcs.filter(n=>n.id===(e.kind==='education'?e.actorId:e.targetId)):w.npcs.filter(n=>n.alive&&n.id!==giver.id&&n.settlementId===giver.settlementId&&distance(n.position,giver.position)<=2).slice(0,4);
  for(const n of targets){if(!n.alive||n.id===giver.id||n.life.support&&Math.floor(n.life.support.tick/144)===Math.floor(w.tick/144))continue;
    n.life.support={giver:giver.id,tick:w.tick,source:e.id};
    changeRelationship(w,n,giver.id,{trust:2,respect:2},e,direct?'직접 받은 도움과 배움을 기억한다.':'가까이서 본 실제 공동체 기여를 기억한다.');
  }
}
export function cooperationTrust(n:NPC,proposerId:string,w:WorldState){
  const support=n.life.support;if(!support||support.giver!==proposerId||w.tick-support.tick>7*144)return 0;
  return clamp((n.relationships.find(r=>r.npcId===proposerId)?.trust??0)-35,0,10);
}
export function validateLegacy(w:WorldState,ensure:(c:unknown,m:string)=>void){
  const events=new Map(w.events.map(e=>[e.id,e]));
  for(const n of w.npcs){const a=n.life.apprenticeship,s=n.life.support;
    if(a)ensure(a.lastTick<=w.tick&&w.npcs.some(p=>p.id===a.mentor)&&w.urban.enterprises.some(e=>e.id===a.enterprise&&e.kind===a.kind)&&events.get(a.source)?.actorId===n.id&&['education','occupation'].includes(events.get(a.source)?.kind??''),'가업 학습 근거');
    if(s)ensure(s.tick<=w.tick&&s.giver!==n.id&&w.npcs.some(p=>p.id===s.giver)&&events.get(s.source)?.tick===s.tick&&['share','education','construction','project'].includes(events.get(s.source)?.kind??''),'기여 경험 근거');
  }
}
