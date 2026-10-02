import type { WorldState, NPC, WorldEvent } from './types';
import { socialEvent, changeRelationship, eventById } from './social';
import { random, distance } from './random';
import { person, neighbours } from './spatial';
import { available, release, reserved } from './village-actions';
import { injure } from './care';
import { isTravelling } from './civilization';

const pair=(a:string,b:string)=>[a,b].sort().join(':');
export function conflictPressure(w:WorldState,n:NPC,other:NPC) {
  const r=n.relationships.find(r=>r.npcId===other.id),l=w.living.people[n.id];
  return n.personality.aggression*.45+(r?.resentment??0)*.25+n.needs.fatigue*.1+n.needs.hunger*.08+w.urban.citizens[n.id].stress*.12+l.body.pain*.08-l.traits.patience*.25-n.personality.empathy*.15-(r?.trust??35)*.08-(r?.fear??0)*.1;
}
export function startConflict(w:WorldState,a:NPC,b:NPC,source:WorldEvent) {
  const s=w.villageLife;if(!s||!a.alive||!b.alive||a.id===b.id||a.settlementId!==b.settlementId||distance(a.position,b.position)>1||isTravelling(w,a)||isTravelling(w,b)||reserved(w,a)||reserved(w,b)||s.usedCauses[source.id]||w.tick<(s.cooldowns[pair(a.id,b.id)]??0)||!source.participants.includes(a.id)||!source.participants.includes(b.id))return false;
  if(w.urban.citizens[a.id].injury>0||w.urban.citizens[b.id].injury>0)return false;
  const e=socialEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,causeId:source.id,importance:50,description:`${a.identity.name}이 ${b.identity.name}에게 불만을 말하며 설명을 구했다.`,data:{villageLife:true,phase:'complaint',episodeId:source.id}});
  resolveMediation(w,a,b,source,true);
  s.usedCauses[source.id]=w.tick+288;s.conflicts.push({id:`vc${w.nextId++}`,source:source.id,latest:e.id,a:a.id,b:b.id,since:w.tick,next:w.tick+2,phase:'complaint',injured:false});
  for(const n of [a,b]){delete n.currentAction;n.decision={reason:'방금 만남에서 생긴 불만을 말하고 상대의 반응을 기다립니다.',candidates:[],tick:w.tick};}return true;
}
/** Resolve promises only on a new real contact, never from elapsed time alone. */
export function resolveMediation(w:WorldState,a:NPC,b:NPC,source:WorldEvent,broken:boolean){
 const agreements=w.villageLife?.agreements,key=pair(a.id,b.id),p=agreements?.[key];
 if(!p||w.tick<=p.since||distance(a.position,b.position)>1||!a.alive||!b.alive||!source.participants.includes(a.id)||!source.participants.includes(b.id))return;
 const e=socialEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,causeId:p.source,importance:50,description:`${a.identity.name}과 ${b.identity.name}이 다시 만났을 때 ${broken?'다시 불만을 내며 중재 약속을 지키지 못했다':'차분히 이야기를 나누며 중재 약속을 지켰다'}.`,data:{villageLife:true,phase:broken?'mediation-broken':'mediation-kept',evidence:[source.id]}});
 for(const [n,other] of [[a,b],[b,a]])changeRelationship(w,n,other.id,broken?{trust:-3,resentment:3}:{trust:2,resentment:-1},e,broken?'다음 만남에서 약속을 지키지 못했다.':'다음 만남의 행동으로 신뢰를 조금 쌓았다.');
 delete agreements![key];
}
export function contactConflict(w:WorldState,a:NPC,b:NPC,source:WorldEvent,play=false) {
  if(!w.villageLife)return;w.villageLife.stats.contacts++;
  const pressure=Math.max(conflictPressure(w,a,b),conflictPressure(w,b,a));
  if(pressure<15||random(w)>(play?.08:.035)){resolveMediation(w,a,b,source,false);return;}
  const e=socialEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,causeId:source.id,importance:45,description:play?`${a.identity.name}과 ${b.identity.name}이 놀이 차례에 서로 다른 의견을 냈다.`:`${a.identity.name}이 ${b.identity.name}의 말에 동의하지 않아 불편함을 표현했다.`,data:{villageLife:true,phase:'disagreement',episodeId:source.id}});
  startConflict(w,a,b,e);
}
export function conflictsTick(w:WorldState) {
  const s=w.villageLife;if(!s)return;
  for(const [key,p] of Object.entries(s.agreements??{}))if(w.tick>p.until||!person(w,p.a)?.alive||!person(w,p.b)?.alive){socialEvent(w,{kind:'relationship',actorId:p.a,targetId:p.b,causeId:p.source,importance:30,description:'다음 만남에서 중재 약속을 확인하지 못한 채 관찰 기간이 끝났다.',data:{villageLife:true,phase:'mediation-unobserved'}});delete s.agreements![key];}
  for(const [key,until] of Object.entries(s.cooldowns))if(until<=w.tick)delete s.cooldowns[key];
  for(const [key,until] of Object.entries(s.usedCauses))if(until<=w.tick)delete s.usedCauses[key];
  for(const c of [...s.conflicts]) {
    const a=person(w,c.a),b=person(w,c.b);
    const close=()=>{s.conflicts=s.conflicts.filter(x=>x!==c);s.cooldowns[pair(c.a,c.b)]=w.tick+(c.injured?288:144);};
    if(!a?.alive||!b?.alive||isTravelling(w,a)||isTravelling(w,b)||distance(a.position,b.position)>1||[a,b].some(n=>n.needs.hunger>85||n.needs.thirst>85||n.needs.health<35)){
      socialEvent(w,{kind:'relationship',actorId:c.a,targetId:c.b,causeId:c.latest,importance:35,description:'만남을 이어갈 수 없어 대화를 중단하고 생활과 안전을 먼저 챙겼다.',data:{villageLife:true,phase:'separated',episodeId:c.source}});close();continue;
    }
    if(w.tick<c.next)continue;
    const pressure=Math.max(conflictPressure(w,a,b),conflictPressure(w,b,a));
    if(c.phase==='complaint'){
      if(pressure<25){const e=socialEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,causeId:c.latest,importance:45,description:`${a.identity.name}과 ${b.identity.name}이 의견 차이를 말로 정리하고 물러났다.`,data:{villageLife:true,phase:'deescalated',episodeId:c.source}});changeRelationship(w,a,b.id,{trust:1},e,'의견이 달랐지만 차분히 끝냈다.');close();continue;}
      c.latest=socialEvent(w,{kind:'relationship',actorId:a.id,targetId:b.id,causeId:c.latest,importance:55,description:`${a.identity.name}과 ${b.identity.name}의 말다툼이 커졌다. 주변에서 말릴 수 있다.`,data:{villageLife:true,phase:'argument',episodeId:c.source}}).id;c.phase='argument';c.next=w.tick+4;s.stats.arguments++;w.stats.conflicts++;continue;
    }
    if(c.phase==='argument'){
      const mediator=neighbours(w,a,1).find(p=>p.id!==a.id&&p.id!==b.id&&p.identity.age>=18&&available(w,p)&&p.personality.empathy+w.living.people[p.id].traits.patience>110);
      const comparable=(a.identity.age<18)===(b.identity.age<18);
      const collides=!mediator&&comparable&&pressure>35&&random(w)<Math.min(.05,(pressure-35)/1000);
      const e=socialEvent(w,{kind:'relationship',actorId:mediator?.id??a.id,targetId:b.id,participants:[...new Set([a.id,b.id,...(mediator?[mediator.id]:[])])],causeId:c.latest,importance:collides?65:50,description:mediator?`${mediator.identity.name}이 사이에 서서 두 사람을 말렸다.`:collides?`${a.identity.name}과 ${b.identity.name}이 언쟁 끝에 서로 밀쳤다.`:`${a.identity.name}과 ${b.identity.name}이 거리를 두고 말다툼을 끝냈다.`,data:{villageLife:true,phase:mediator?'mediated':collides?'collision':'separated',episodeId:c.source}});
      if(mediator){delete mediator.currentAction;const agreements=s.agreements??={};if(Object.keys(agreements).length<1500)agreements[pair(a.id,b.id)]={a:a.id,b:b.id,source:e.id,since:w.tick,until:w.tick+144*7};}
      changeRelationship(w,a,b.id,{resentment:collides?10:3,trust:collides?-8:-2},e,'이번 다툼으로 조심스러운 마음이 남았다.');changeRelationship(w,b,a.id,{resentment:collides?12:2,fear:collides?4:0},e,'상대와의 거리를 다시 생각한다.');
      c.latest=e.id;c.phase='aftermath';c.next=w.tick+4;
      if(collides){s.stats.collisions++;c.injured=true;injure(w,b,'conflict',e,b.identity.age<18?'minor':'moderate');}
      continue;
    }
    const apologizer=a.personality.empathy+w.living.people[a.id].traits.patience>=b.personality.empathy+w.living.people[b.id].traits.patience?a:b,other=apologizer===a?b:a;
    if(apologizer.personality.empathy>45){
      const offer=socialEvent(w,{kind:'relationship',actorId:apologizer.id,targetId:other.id,causeId:c.latest,importance:45,description:`${apologizer.identity.name}이 말다툼에 대해 사과했다.`,data:{villageLife:true,phase:'apology',episodeId:c.source}});
      const accepts=conflictPressure(w,other,apologizer)<20&&!c.injured;
      const reply=socialEvent(w,{kind:'relationship',actorId:other.id,targetId:apologizer.id,causeId:offer.id,importance:45,description:`${other.identity.name}이 ${accepts?'사과를 받아들였다':'아직 마음을 정리할 시간이 필요하다고 했다'}.`,data:{villageLife:true,phase:accepts?'reconciled':'distance',episodeId:c.source}});
      if(accepts)changeRelationship(w,other,apologizer.id,{trust:2,resentment:-3},reply,'사과를 듣고 다시 이야기할 여지가 생겼다.');
    }
    close();
  }
}
