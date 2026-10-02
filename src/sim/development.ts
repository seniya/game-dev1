import type { WorldState, NPC, Occupation } from './types';
import { OCCUPATIONS } from './types';
import { INDUSTRY_JOB, type Industry } from './urban-types';
import { appendEvent } from './social';
import { isTravelling, stocks, market } from './civilization';

export const STAGE_LABELS = ['작은 터전', '자리 잡은 마을', '분업하는 마을', '전문화된 마을', '여러 생활권'];
export const stageForPopulation = (n: number) => n >= 150 ? 4 : n >= 80 ? 3 : n >= 40 ? 2 : n >= 20 ? 1 : 0;
export function occupationStage(job: Occupation): number {
  if (['farmer', 'gatherer', 'homemaker', 'none'].includes(job)) return 0;
  if (['woodcutter', 'carpenter', 'cook'].includes(job)) return 1;
  if (['merchant', 'gardener', 'herbalist', 'caregiver', 'weaver', 'tailor'].includes(job)) return 2;
  if (['healer', 'teacher', 'smith', 'miller', 'mason', 'miner'].includes(job)) return 3;
  return 4;
}
export function villagePerson(w: WorldState, n: NPC) {
  return w.villageLife!.people[n.id] ??= { nextPlay: 0, careerTick: 0 };
}
export function initializeVillageLife(w: WorldState) {
  w.villageLife ??= { revision: 1, since: w.tick, settlements: {}, activities: {}, injuries: [], conflicts: [], people: {}, cooldowns: {}, usedCauses: {}, stats: { contacts: 0, plays: 0, arguments: 0, collisions: 0, injuries: 0, treatments: 0, recoveries: 0, careTicks: 0, outings: 0, returns: 0, careerChanges: 0 } };
  for (const v of w.civilization.settlements) w.villageLife.settlements[v.id] ??= { stage: 0, streak: 0, proposed: 0, unlocked: ['farmer','gatherer','homemaker','none'], demand: {}, previousDemand: {}, reason: '먹거리·채집·집살림을 함께 나눕니다.', lastDay: Math.floor(w.tick / 144), lastAssigned: 0, production: 0, consumption: 0, previousProduction: 0, previousConsumption: 0, todayProduced: 0, todayConsumed: 0 };
  for (const n of w.npcs) villagePerson(w,n);
}
export function occupationAllowed(w: WorldState, settlementId: string, job: Occupation) {
  return !w.villageLife || occupationStage(job) === 0 || !!w.villageLife.settlements[settlementId]?.unlocked.includes(job);
}
export function industryAllowed(w: WorldState, id: string, kind: Industry) {
  if (!w.villageLife) return true;
  // Raw grain requires milling; common farms already produce edible food.
  return occupationAllowed(w,id,kind==='field'?'miller':INDUSTRY_JOB[kind]);
}
export function availableOccupations(w: WorldState, id: string) {
  return Object.fromEntries(Object.entries(OCCUPATIONS).filter(([job]) => occupationAllowed(w,id,job as Occupation)));
}
export function livelihoodLabel(w: WorldState, n: NPC) {
  const job = n.occupation === 'none' ? n.previousOccupation ?? 'none' : n.occupation;
  if (w.villageLife && (w.villageLife.settlements[n.settlementId]?.stage ?? 0) === 0) return job === 'farmer' ? '먹거리 담당' : job === 'gatherer' ? '채집 담당' : OCCUPATIONS[job];
  return OCCUPATIONS[job];
}
export function developmentDay(w: WorldState) {
  if (!w.villageLife) return;
  initializeVillageLife(w);
  const day = Math.floor(w.tick/144);
  for (const v of w.civilization.settlements) {
    const d = w.villageLife.settlements[v.id]; if (d.lastDay === day) continue;
    const people = w.npcs.filter(n=>n.alive && n.settlementId===v.id && !isTravelling(w,n));
    const adults = people.filter(n=>n.identity.age>=18 && n.identity.age<65 && n.needs.health>=50 && w.urban.citizens[n.id].injury<20);
    const desired = stageForPopulation(people.length);
    d.streak = d.proposed===desired ? d.streak+1 : 1; d.proposed=desired; d.lastDay=day;
    if (d.streak>=2 && desired>d.stage) {
      d.stage=desired;
      appendEvent(w,{kind:'urban',importance:55,description:`${v.name}에 ${people.length}명이 정착해 ${STAGE_LABELS[d.stage]}의 일을 검토한다. 수요와 노동력이 있어야 전문 역할이 생긴다.`,data:{phase:'development',settlementId:v.id,stage:d.stage,population:people.length}});
    }
    const c=w.urban.cities.find(c=>c.settlementId===v.id)!, stock=stocks(w,v.id);
    d.previousProduction=d.production; d.previousConsumption=d.consumption;
    d.production=d.todayProduced;d.consumption=d.todayConsumed;d.todayProduced=0;d.todayConsumed=0;
    const kids=people.filter(n=>n.identity.age>=4&&n.identity.age<18).length;
    const ids=new Set(people.map(n=>n.id)),patients=w.villageLife.injuries.filter(i=>ids.has(i.npc)).length;
    const repairs=w.buildings.filter(b=>b.settlementId===v.id&&(w.urban.buildings[b.id]?.condition??100)<85).length;
    d.previousDemand=d.demand;
    d.demand={woodcutter:stock.wood<people.length*2?144:0,carpenter:repairs*36,cook:people.length*5,merchant:people.length*3,gardener:patients*72+Math.max(0,people.length-c.goods.herbs)*2,herbalist:patients*72,caregiver:kids*18+patients*72,tailor:people.filter(n=>w.living.people[n.id].clothing<65).length*18,weaver:c.goods.cloth<people.length?people.length*3:0,healer:patients*144,teacher:kids*24,miller:people.length*2,mason:repairs*36,miner:people.length*2,smith:people.length*2};
    for (const job of Object.keys(OCCUPATIONS) as Occupation[]) if(occupationStage(job)===4)d.demand[job]=people.length;
    const supply=(d.production+d.previousProduction)/2, consumption=(d.consumption+d.previousConsumption)/2;
    const food=stock.food+market(w,v.id).food+people.reduce((s,n)=>s+n.inventory.food,0);
    const candidate=Object.keys(d.demand).find(job=>!d.unlocked.includes(job)&&occupationStage(job as Occupation)<=Math.min(d.stage,desired)&&d.demand[job]>=72&&(d.previousDemand[job]??0)>=72) as Occupation|undefined;
    d.reason=desired===0?'기본 생업과 이웃 돌봄으로 생활합니다.':!candidate?'새 전담 역할에 필요한 수요를 2일간 관찰합니다.':adults.length<4?'일할 수 있는 성인이 부족해 겸업합니다.':consumption===0||supply<consumption||food<consumption?'먹거리 생산과 생활비를 먼저 확보합니다.':stock.wood<8||market(w,v.id).coins+c.treasury<4?'작업 재료와 임금 기금이 부족합니다.':'전담할 이웃을 찾습니다.';
    if(!candidate||adults.length<4||consumption===0||supply<consumption||food<consumption||stock.wood<8||market(w,v.id).coins+c.treasury<4)continue;
    const worker=adults.filter(n=>!w.urban.citizens[n.id].employer && !['farmer','gatherer'].includes(n.occupation)&& w.tick-villagePerson(w,n).careerTick>=288).sort((a,b)=>(b.personality.empathy+b.life.skill)-(a.personality.empathy+a.life.skill))[0];
    if(!worker){d.reason='먹거리 담당 외에 전담할 여유 노동력이 없습니다.';continue;}
    d.unlocked.push(candidate);d.lastAssigned=w.tick;
    const old=worker.occupation;worker.occupation=candidate;villagePerson(w,worker).careerTick=w.tick;w.villageLife.stats.careerChanges++;
    d.reason=`${OCCUPATIONS[candidate]} 수요가 이어져 ${worker.identity.name}이 일을 맡습니다.`;
    appendEvent(w,{kind:'occupation',actorId:worker.id,importance:55,description:d.reason,data:{phase:'specialized',previous:old,occupation:candidate,demand:d.demand[candidate],settlementId:v.id}});
  }
}

/** Existing worlds keep acquired professions and facilities; their history is never reset. */
export function adoptVillageLife(w:WorldState) {
  if(w.villageLife)return;
  initializeVillageLife(w);
  for(const v of w.civilization.settlements){const d=w.villageLife!.settlements[v.id];d.stage=stageForPopulation(w.npcs.filter(n=>n.alive&&n.settlementId===v.id&&!isTravelling(w,n)).length);
    for(const n of w.npcs.filter(n=>n.settlementId===v.id))for(const job of [n.occupation,n.previousOccupation])if(job&&!d.unlocked.includes(job))d.unlocked.push(job);
    for(const e of w.urban.enterprises.filter(e=>e.settlementId===v.id)){const job=e.kind==='field'?'miller':INDUSTRY_JOB[e.kind];if(!d.unlocked.includes(job))d.unlocked.push(job);}
    d.reason='이전 세계의 생업과 시설을 보존하고 새 생활 규칙을 적용했습니다.';
  }
  for(const n of w.npcs){const u=w.urban.citizens[n.id];if(!n.alive||u.injury<=0)continue;
    const e=appendEvent(w,{kind:'health',actorId:n.id,causeId:u.healthEventId,importance:45,description:`${n.identity.name}의 기존 부상 상태를 확인하고 회복을 이어간다. 발생 원인을 새로 추정하지 않는다.`,data:{villageLife:true,phase:'injured',cause:'existing',severity:u.injury>=20?'moderate':'minor'}});
    w.villageLife!.injuries.push({id:`vi${w.nextId++}`,npc:n.id,source:e.id,latest:e.id,since:w.tick,remaining:u.injury,severity:u.injury>=20?'moderate':'minor',cause:'existing'});u.healthEventId=e.id;
  }
}
