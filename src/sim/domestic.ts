import type { WorldState } from './types';
import { reserve, release, available, advanceActivity } from './village-actions';
import { person, neighbours } from './spatial';
import { appendEvent, changeRelationship } from './social';
import { distance, clamp } from './random';
import { villagePerson } from './development';
import { isTravelling } from './civilization';

/** Shared domestic work and teaching use real co-presence and reserve both schedules. */
export function domesticTick(w:WorldState) {
  const s=w.villageLife;if(!s)return;
  for(const [id,a] of Object.entries(s.activities)){
    if(!['learn','domestic'].includes(a.kind))continue;
    const n=person(w,id);if(!n?.alive){delete s.activities[id];continue;}
    if(n.identity.age<18){const adult=person(w,a.partner);if(!adult?.alive||isTravelling(w,adult)||isTravelling(w,n)||w.tick>a.until||s.activities[adult.id]?.partner!==n.id)release(w,n);continue;}
    const child=person(w,a.partner);
    if(!child?.alive||isTravelling(w,n)||isTravelling(w,child)||w.tick>a.until||n.needs.hunger>75||n.needs.thirst>75){release(w,n);if(child&&s.activities[child.id]?.partner===n.id)release(w,child);continue;}
    if(!advanceActivity(w,n))continue;
    if(distance(n.position,child.position)>1||s.activities[child.id]?.partner!==n.id){release(w,n);if(s.activities[child.id]?.partner===n.id)release(w,child);continue;}
    if(a.progress<6)continue;
    if(a.kind==='learn'){
      const skill=w.urban.citizens[child.id];skill.education=clamp(skill.education+.2);child.life.skill=Math.max(child.life.skill,Math.min(n.life.skill,child.life.skill+.1));
      const e=appendEvent(w,{kind:'education',actorId:child.id,targetId:n.id,causeId:a.source,importance:45,description:`${child.identity.name}이 ${n.identity.name}과 같은 곳에서 이야기와 생활 기술을 배웠다.`,data:{villageLife:true,phase:'learned',episodeId:a.source}});
      changeRelationship(w,child,n.id,{trust:1,respect:1},e,'직접 시간을 내어 가르쳐 주었다.');
    }else{
      let food=0;if(n.inventory.food>1&&child.inventory.food<2){n.inventory.food--;child.inventory.food++;food=1;}
      child.needs.social=clamp(child.needs.social+10);child.needs.fatigue=clamp(child.needs.fatigue-8);
      appendEvent(w,{kind:'family',actorId:n.id,targetId:child.id,causeId:a.source,importance:35,description:`${n.identity.name}이 ${child.identity.name}의 식사와 쉬는 시간을 챙겼다.`,data:{villageLife:true,phase:'domestic',food,episodeId:a.source}});
    }
    release(w,n);release(w,child);villagePerson(w,child).nextPlay=w.tick+12;
  }
  if(w.tick%12!==0||w.tick%144<42||w.tick%144>100)return;
  for(const n of w.npcs){if(!['teacher','homemaker','caregiver','cook'].includes(n.occupation)||n.identity.age<18||!available(w,n)||n.currentAction?.kind==='Work')continue;
    const child=neighbours(w,n,6).find(p=>p.identity.age>=4&&p.identity.age<18&&p.settlementId===n.settlementId&&available(w,p)&&w.tick>=villagePerson(w,p).nextPlay);
    if(!child)continue;
    const kind=n.occupation==='teacher'?'learn':'domestic';
    if(reserve(w,n,kind,child.position,`${child.identity.name}과 ${kind==='learn'?'이야기를 나누며 배움':'식사와 휴식'} 시간을 함께합니다.`,{partner:child.id,duration:24}))reserve(w,child,kind,child.position,`${n.identity.name}과 함께 생활을 배우고 쉽니다.`,{partner:n.id,source:s.activities[n.id].source,duration:24});
  }
}
