import { rememberGrowth } from './growth';
import { findPath } from './pathfinding';
import type { NPC, WorldState, WorldEvent } from './types';
import { appendEvent, changeRelationship, socialEvent } from './social';
import { clamp, distance } from './random';
import { neighbours, person } from './spatial';
import { isTravelling } from './civilization';
import { reserve, release, available, advanceActivity } from './village-actions';
import { villagePerson } from './development';

export function injure(w:WorldState,n:NPC,cause:'play'|'work'|'conflict',source:WorldEvent,severity:'minor'|'moderate'='minor') {
  const state=w.villageLife;if(!state||!n.alive||state.injuries.some(i=>i.npc===n.id))return;
  const e=socialEvent(w,{kind:'health',actorId:n.id,causeId:source.id,importance:65,description:`${n.identity.name}이 ${cause==='play'?'놀다가 넘어져':cause==='work'?'작업 사고로':'다툼 중에'} ${severity==='minor'?'가벼운 상처':'휴식과 치료가 필요한 부상'}를 입었다.`,data:{villageLife:true,phase:'injured',episodeId:source.id,cause,severity}});
  state.injuries.push({id:`vi${w.nextId++}`,npc:n.id,source:e.id,latest:e.id,since:w.tick,observedSince:w.tick,remaining:severity==='minor'?12:35,severity,cause});
  state.stats.injuries++;w.urban.citizens[n.id].injury=severity==='minor'?12:35;w.urban.citizens[n.id].healthEventId=e.id;
  release(w,n);delete n.currentAction;
  reserve(w,n,'recover',n.position,'다친 곳을 쉬게 하며 가까운 이웃에게 도움을 요청합니다.',{source:e.id,duration:432});
}
export function healInjury(w:WorldState,n:NPC,amount:number,causeId?:string) {
  const i=w.villageLife?.injuries.find(i=>i.npc===n.id);if(!i)return;
  i.remaining=Math.max(0,i.remaining-amount);if(causeId)i.latest=causeId;
  w.urban.citizens[n.id].injury=i.remaining;
}
export function careTick(w:WorldState) {
  const state=w.villageLife;if(!state)return;
  const metrics=state.careMetrics??={completed:0,firstCareTicks:0,maxFirstCare:0,maxGap:0,unassisted:0};
  for(const i of [...state.injuries]) {
    const n=person(w,i.npc);
    i.observedSince??=w.tick;
    i.maxCareGap=Math.max(i.maxCareGap??0,w.tick-Math.max(i.treatedAt??i.observedSince,i.observedSince));metrics.maxGap=Math.max(metrics.maxGap,i.maxCareGap);
    if(!n?.alive){state.injuries=state.injuries.filter(x=>x!==i);if(i.firstCareAt===undefined)metrics.unassisted++;if(n)release(w,n);continue;}
    // Recovery only while resting, adequately fed and hydrated. One authority owns injury reduction.
    const a=state.activities[n.id];
    if(n.needs.hunger<75&&n.needs.thirst<80&&(a?.kind==='recover'||n.currentAction?.kind==='Sleep'||n.currentAction?.kind==='Idle')) healInjury(w,n,i.severity==='minor'?.17:.07);
    if(i.remaining===0){const e=socialEvent(w,{kind:'health',actorId:n.id,targetId:i.caregiver,causeId:i.latest,importance:55,description:`${n.identity.name}의 상처가 회복되어 생활로 돌아갈 수 있다.`,data:{villageLife:true,phase:'recovered',episodeId:i.source,elapsed:w.tick-i.since,firstCareWait:i.firstCareAt===undefined?-1:i.firstCareAt-(i.observedSince??i.since),observedSince:i.observedSince??i.since,maxCareGap:i.maxCareGap??0}});state.stats.recoveries++;if(i.firstCareAt===undefined)metrics.unassisted++;state.injuries=state.injuries.filter(x=>x!==i);if(a?.kind==='recover')release(w,n);villagePerson(w,n).helpSource=e.id;continue;}
    if(a?.kind==='recover'){
      n.needs.fatigue=clamp(n.needs.fatigue-.9);
      if(n.inventory.food>0&&n.needs.hunger>38){n.inventory.food--;w.economy.totals.consumedFood++;n.needs.hunger=clamp(n.needs.hunger-38);appendEvent(w,{kind:'consumption',actorId:n.id,causeId:i.latest,importance:30,description:`${n.identity.name}이 쉬면서 소지 식량 1개를 먹었다.`,data:{resource:'food',amount:1}});}
      // Mobile patients may obtain water/food through normal survival choices, then rest again.
      if(n.identity.age>=18&&(n.needs.thirst>65||n.needs.hunger>70||w.tick>a.until)){release(w,n);}
    } else if(!isTravelling(w,n)&&n.needs.hunger<60&&n.needs.thirst<60&&!a)reserve(w,n,'recover',n.position,'먹거리와 물을 챙긴 뒤 상처를 쉬게 합니다.',{source:i.latest,duration:72});
  }
  for(const [id,a] of Object.entries(state.activities)) {
    if(a.kind!=='care')continue;
    const helper=person(w,id),patient=person(w,a.partner),injury=state.injuries.find(i=>i.npc===a.partner);
    if(!helper?.alive||!patient?.alive||!injury||isTravelling(w,helper)||isTravelling(w,patient)||helper.needs.hunger>85||helper.needs.thirst>85||w.tick>a.until){if(helper)release(w,helper);continue;}
    if(!a.water && patient.needs.thirst>40) {
      const well=w.buildings.find(b=>b.kind==='well'&&b.settlementId===helper.settlementId)!;
      if(distance(a.target,well.position)>0){const path=findPath(w,helper.position,well.position);if(!path){release(w,helper);continue;}a.target={...well.position};a.path=path;a.progress=0;}
      if(!advanceActivity(w,helper))continue;
      a.water=true;const path=findPath(w,helper.position,patient.position);if(!path){release(w,helper);continue;}a.target={...patient.position};a.path=path;a.progress=0;a.until=w.tick+36;continue;
    }
    if(distance(patient.position,a.target)>0){release(w,helper);continue;}
    if(!advanceActivity(w,helper))continue;
    state.stats.careTicks++;
    if(a.progress<4)continue;
    const c=w.urban.cities.find(c=>c.settlementId===helper.settlementId)!;
    const professional=helper.occupation==='healer'&&c.goods.herbs>0&&c.goods.cloth>0;
    const payer=patient.wealth>=2?patient:undefined;
    const funded=!!payer||c.treasury>=2;
    let treatment=false;
    if(professional&&funded){c.goods.herbs--;c.goods.cloth--;w.urban.ledger.consumed.herbs++;w.urban.ledger.consumed.cloth++;if(payer){payer.wealth-=2;w.urban.citizens[payer.id].expenses+=2;}else{c.treasury-=2;c.spent+=2;}helper.wealth+=2;w.urban.citizens[helper.id].income+=2;w.economy.totals.wages+=2;treatment=true;}
    let food=0;if(helper.inventory.food>0&&patient.inventory.food<2){helper.inventory.food--;patient.inventory.food++;food=1;}
    if(a.water)patient.needs.thirst=clamp(patient.needs.thirst-65);
    patient.needs.fatigue=clamp(patient.needs.fatigue-10);patient.needs.social=clamp(patient.needs.social+8);
    const e=socialEvent(w,{kind:'health',actorId:helper.id,targetId:patient.id,causeId:injury.latest,importance:50,description:`${helper.identity.name}이 ${patient.identity.name}을 찾아와 ${treatment?'약초와 천으로 처치했다':'곁에서 쉬도록 돌보았다'}${food?' · 식량 1개 전달':''}.`,data:{villageLife:true,phase:treatment?'treated':'cared',episodeId:injury.source,food,water:!!a.water,herbs:treatment?1:0,cloth:treatment?1:0,coins:treatment?2:0,payer:payer?.id??'treasury'}});
    if(injury.firstCareAt===undefined){injury.firstCareAt=w.tick;metrics.completed++;metrics.firstCareTicks+=w.tick-(injury.observedSince??injury.since);metrics.maxFirstCare=Math.max(metrics.maxFirstCare,w.tick-(injury.observedSince??injury.since));}
    injury.waitReason=treatment?'처치 후 회복 중':helper.occupation!=='healer'?'이웃의 기본 돌봄 후 휴식 중':!professional?'약초 또는 천이 없어 기본 돌봄 후 휴식 중':'진료비가 없어 기본 돌봄 후 휴식 중';rememberGrowth(w,patient,helper,'help',e);
    injury.latest=e.id;injury.caregiver=helper.id;injury.treatedAt=w.tick;state.stats.treatments++;
    if(treatment)healInjury(w,patient,5,e.id);
    changeRelationship(w,patient,helper.id,{trust:5,affection:3},e,'다쳤을 때 찾아와 돌봐 준 이웃이다.');release(w,helper);
  }
  if(w.tick%6!==0)return;
  for(const i of [...state.injuries].sort((a,b)=>(b.severity==='moderate'?144:0)+w.tick-(b.treatedAt??b.since)-((a.severity==='moderate'?144:0)+w.tick-(a.treatedAt??a.since))||a.id.localeCompare(b.id))){const n=person(w,i.npc);if(!n?.alive||isTravelling(w,n)||i.treatedAt!==undefined&&w.tick-i.treatedAt<36||Object.values(state.activities).some(a=>a.kind==='care'&&a.partner===n.id))continue;
    const helper=neighbours(w,n,w.tick-(i.treatedAt??i.since)>=144?24:12).filter(p=>p.id!==n.id&&p.identity.age>=18&&p.settlementId===n.settlementId&&available(w,p)&&findPath(w,p.position,n.position)!==null).sort((a,b)=>(b.occupation==='healer'?100:0)+b.personality.empathy-((a.occupation==='healer'?100:0)+a.personality.empathy))[0];
    i.waitReason=helper?'도와줄 이웃이 실제 경로로 오는 중':'도달할 수 있는 경로와 여유 있는 돌봄 인력을 기다림';
    if(helper)reserve(w,helper,'care',n.position,`${n.identity.name}의 부상을 보고 곁에서 돌보러 갑니다.`,{source:i.latest,partner:n.id,duration:Math.max(36,(findPath(w,helper.position,n.position)?.length??0)*2+12)});
  }
}
