import { cooperationTrust } from './legacy-learning';
import { z } from 'zod';
import type { Candidate, NPC, WorldState } from './types';
import { beginConstruction } from './construction';
import { buildPosition } from './frontier';
import { capacity, isTravelling, market, stocks } from './civilization';
import { canWork } from './employment';
import { appendEvent, eventById } from './social';
import { distance } from './random';
import { SEASONS, seasonIndex } from './heritage';

const id = z.string().min(1).max(100), nat = z.number().int().nonnegative();
export const cooperationSchema = z.object({
  projects: z.array(z.object({ id, settlementId: id, proposerId: id, kind: z.enum(['home','farm']), created: nat,
    status: z.enum(['collecting','building','completed','withdrawn']), source: id, latest: id,
    siteId: id.optional(), buildingId: id.optional(), donated: nat, reason: z.string().max(1000),
  }).strict()).max(48),
  provisions: z.array(z.object({ settlementId: id, tick: nat, source: id, food: nat, target: nat, demand: nat,
    harvested: nat, lost: nat, season: z.string().max(10), risk: z.boolean(),
  }).strict()).max(12),
}).strict();
export type Cooperation = z.infer<typeof cooperationSchema>;

export function provisionDay(w: WorldState) {
  const state = w.cooperation ??= {projects: [], provisions: []};
  for (const village of w.civilization.settlements) {
    const people = w.npcs.filter(n => n.alive && n.settlementId === village.id);
    const food = stocks(w,village.id).food + market(w,village.id).food + people.reduce((s,n)=>s+n.inventory.food,0);
    const demand = people.length * 3;
    const ledgers = w.agriculture?.farms.filter(f=>w.buildings.some(b=>b.id===f.buildingId&&b.settlementId===village.id)) ?? [];
    const records = ledgers.map(f=>f.lastEventId?eventById(w,f.lastEventId):undefined).filter(e=>e?.tick===w.tick);
    const harvested = records.reduce((s,e)=>s+Number(e!.data.harvested),0), lost = records.reduce((s,e)=>s+Number(e!.data.cropLoss),0);
    const target = demand * (seasonIndex(w)>=2 ? 3 : 2) + Math.min(demand,lost);
    const previous = state.provisions.find(p=>p.settlementId===village.id);
    const risk = food < target, season = SEASONS[seasonIndex(w)];
    const e = appendEvent(w,{kind:'project',importance:risk?45:20,causeId:previous?.source,
      description:`${village.name}의 ${season} 준비: 식량 ${food}개, 하루 필요량 약 ${demand}개로 ${seasonIndex(w)>=2?3:2}일 비축 목표 ${target}개. 지난 농장 수확 ${harvested}개·피해 ${lost}개.${previous?` 이전 준비 기록보다 식량 ${food-previous.food>=0?'+':''}${food-previous.food}개(생산·소비·교역 합산 결과).`:''} ${risk?'수확·채집·공동 비축을 우선한다.':'현재 비축 목표를 충족했다.'}`,
      data:{provisions:true,settlementId:village.id,food,target,demand,harvested,lost,season,risk,evidence:records.map(e=>e!.id).slice(-12),...(previous?{previousFood:previous.food}:{})}});
    const plan = {settlementId:village.id,tick:w.tick,source:e.id,food,target,demand,harvested,lost,season,risk};
    state.provisions = [...state.provisions.filter(p=>p.settlementId!==village.id),plan];
  }
}

/** One proposal per village, bounded globally; no resources are created or pledged twice. */
export function cooperationDay(w: WorldState) {
  const state = w.cooperation ??= {projects:[],provisions:[]};
  state.projects = [...state.projects.filter(p=>['collecting','building'].includes(p.status)), ...state.projects.filter(p=>['completed','withdrawn'].includes(p.status)).slice(-32)];
  for (const v of w.civilization.settlements) {
    if (state.projects.some(p=>p.settlementId===v.id&&(['collecting','building'].includes(p.status)||w.tick-p.created<7*144))) continue;
    if (state.projects.filter(p=>['collecting','building'].includes(p.status)).length>=8) break;
    const people=w.npcs.filter(n=>n.alive&&n.settlementId===v.id);
    const beds=w.buildings.filter(b=>b.kind==='home'&&b.settlementId===v.id).reduce((s,b)=>s+capacity(b),0);
    const farms=w.buildings.filter(b=>b.kind==='farm'&&b.settlementId===v.id);
    const provisions=state.provisions.find(p=>p.settlementId===v.id);
    const kind=people.length>=beds-2?'home':people.length>farms.length*12 || provisions?.risk&&provisions.food<provisions.demand&&farms.length<Math.ceil(people.length/6)?'farm':undefined;
    const proposer=people.filter(n=>canWork(w,n)&&!isTravelling(w,n)&&n.needs.health>=50).sort((a,b)=>(b.personality.empathy+b.personality.diligence)-(a.personality.empathy+a.personality.diligence)||a.id.localeCompare(b.id))[0];
    if(!kind||!proposer)continue;
    const reason=kind==='home'?`주민 ${people.length}명에 주거 정원 ${beds}명`:`주민 ${people.length}명에 농장 ${farms.length}곳, 현재 식량 ${provisions?.food??0}개`;
    const project:Cooperation['projects'][number]={id:`initiative-${w.nextId++}`,settlementId:v.id,proposerId:proposer.id,kind,created:w.tick,status:'collecting',source:'',latest:'',donated:0,reason};
    project.source=project.latest=appendEvent(w,{kind:'project',actorId:proposer.id,importance:55,description:`${proposer.identity.name}이 ${kind==='home'?'새집':'농장'} 공동 사업을 제안했다. ${reason}. 공동 목재 ${kind==='home'?12:16}개와 실제 임금 기금을 마련해야 착공한다.`,data:{initiative:project.id,settlementId:v.id,phase:'proposed',buildingKind:kind,...(provisions?{evidence:[provisions.source]}:{})}}).id;
    state.projects.push(project);
  }
}

export function cooperationTick(w:WorldState) {
  for(const p of w.cooperation?.projects??[]) {
    if(p.status==='building') {
      const site=w.construction?.projects.find(s=>s.id===p.siteId);
      if(site?.buildingId){p.status='completed';p.buildingId=site.buildingId;p.latest=appendEvent(w,{kind:'project',actorId:p.proposerId,locationId:site.buildingId,importance:55,causeId:site.lastEventId,description:`주민이 제안한 ${p.kind==='home'?'새집':'농장'} 사업이 현장 노동으로 완공됐다. 첫 이용은 공사 기록에서 이어 확인한다.`,data:{initiative:p.id,settlementId:p.settlementId,phase:'completed',evidence:[p.source]}}).id;}
      continue;
    }
    if(p.status!=='collecting'||w.tick%36!==0)continue;
    if(w.tick-p.created>=14*144){p.status='withdrawn';p.latest=appendEvent(w,{kind:'project',actorId:p.proposerId,importance:45,causeId:p.source,description:'공동 사업이 14일 안에 착공 조건을 마련하지 못해 제안을 거두었다. 기부한 기금과 공동 자재는 마을에 남는다.',data:{initiative:p.id,settlementId:p.settlementId,phase:'withdrawn'}}).id;continue;}
    const stock=stocks(w,p.settlementId),fund=market(w,p.settlementId),wood=p.kind==='home'?12:16,wages=p.kind==='home'?18:36;
    const venue=w.buildings.find(b=>b.kind==='market'&&b.settlementId===p.settlementId)!;
    if(fund.coins<wages)for(const n of w.npcs.filter(n=>n.alive&&n.identity.age>=18&&n.settlementId===p.settlementId&&n.wealth>20&&n.personality.empathy+cooperationTrust(n,p.proposerId,w)>=45&&n.needs.hunger<65&&distance(n.position,venue.position)<=2).slice(0,4)) {
      const amount=Math.min(2,wages-fund.coins,n.wealth-20);if(amount<=0)break;
      n.wealth-=amount;fund.coins+=amount;p.donated+=amount;
      p.latest=appendEvent(w,{kind:'project',actorId:n.id,causeId:p.source,importance:35,locationId:venue.id,description:`${n.identity.name}이 시장에서 공동 사업 임금 기금에 ${amount}코인을 보탰다. 자신의 생활비 20코인을 남겼다.`,data:{initiative:p.id,settlementId:p.settlementId,phase:'donated',coins:amount,...(cooperationTrust(n,p.proposerId,w)>0?{evidence:[n.life.support!.source],trustBonus:cooperationTrust(n,p.proposerId,w)}:{})}}).id;
    }
    if(stock.wood<wood||fund.coins<wages||(w.construction?.projects.filter(s=>!s.buildingId).length??0)>=8||w.buildings.length>=3992)continue;
    const v=w.civilization.settlements.find(v=>v.id===p.settlementId)!;
    let position;
    for(let radius=2;radius<=12&&!position;radius+=2)for(let dy=-radius;dy<=radius&&!position;dy+=2)for(let dx=-radius;dx<=radius;dx+=2){const at={x:v.center.x+dx,y:v.center.y+dy};if(buildPosition(w,v.id,at)){position=at;break;}}
    if(!position)continue;
    p.siteId=beginConstruction(w,p.settlementId,p.kind,position);p.status='building';
    const site=w.construction!.projects.find(s=>s.id===p.siteId)!;
    const event=w.events.find(e=>e.id===site.source)!;event.causeId=p.source;event.actorId=p.proposerId;event.participants=[p.proposerId];event.data.initiative=p.id;
    p.latest=site.source;
  }
}

/** Small score adjustments only; survival, consent and physical action rules still decide. */
export function prepareCandidates(w:WorldState,n:NPC,list:Candidate[]) {
  const plan=w.cooperation?.provisions.find(p=>p.settlementId===n.settlementId);
  const project=w.cooperation?.projects.find(p=>p.settlementId===n.settlementId&&p.status==='collecting');
  for(const c of list) {
    let bonus=0,reason='',source='';
    if(plan?.risk && w.tick-plan.tick<=144) {
      if(c.kind==='Work'&&w.buildings.some(b=>b.id===c.targetId&&b.kind==='farm'))bonus=18;
      if(c.kind==='Gather'&&w.resources.some(r=>r.id===c.targetId&&r.kind==='food')&&n.inventory.food<5)bonus=12;
      if(c.kind==='StoreItem'&&n.inventory.food>3)bonus=15;
      if(bonus){reason=`${plan.season} 비축 준비 · 식량 ${plan.food}/${plan.target}`;source=plan.source;}
    }
    if(project&&stocks(w,n.settlementId).wood<(project.kind==='home'?12:16)) {
      if(c.kind==='Gather'&&w.resources.some(r=>r.id===c.targetId&&r.kind==='wood')||c.kind==='StoreItem'&&n.inventory.wood>=4){bonus+=14;reason+=' · 주민 공동 사업의 목재 마련';source=project.source;}
    }
    if(bonus){c.score+=bonus;c.reason+=` · ${reason}`;c.evidence=[...new Set([...(c.evidence??[]),source])];}
  }
}

export function validateCooperation(w:WorldState,ensure:(v:unknown,message:string)=>void) {
  const state=w.cooperation;if(!state)return;
  ensure(new Set(state.projects.map(p=>p.id)).size===state.projects.length,'공동 사업 중복');
  ensure(state.projects.filter(p=>['collecting','building'].includes(p.status)).length<=8,'공동 사업 상한');
  for(const p of state.projects){
    ensure(/^initiative-\d+$/.test(p.id)&&Number(p.id.slice(11))<w.nextId&&p.created<=w.tick,'공동 사업 ID·시각');
    ensure(w.npcs.some(n=>n.id===p.proposerId)&&w.civilization.settlements.some(v=>v.id===p.settlementId),'공동 사업 주민·마을');
    ensure(w.events.some(e=>e.id===p.source&&e.data.initiative===p.id&&e.data.phase==='proposed'&&e.actorId===p.proposerId&&e.tick===p.created&&e.data.settlementId===p.settlementId&&e.data.buildingKind===p.kind)&&w.events.some(e=>e.id===p.latest&&(e.data.initiative===p.id||p.siteId&&e.data.projectId===p.siteId)),'공동 사업 근거');
    ensure(['collecting','withdrawn'].includes(p.status)?!p.siteId:!!p.siteId,'공동 사업 착공 단계');
    ensure(p.status==='building'?w.construction?.projects.some(s=>s.id===p.siteId&&s.settlementId===p.settlementId&&s.kind===p.kind):true,'공동 사업 공사');
    ensure(p.status==='completed'?w.buildings.some(b=>b.id===p.buildingId&&b.kind===p.kind&&b.settlementId===p.settlementId):!p.buildingId,'공동 사업 완공');
  }
  ensure(new Set(state.provisions.map(p=>p.settlementId)).size===state.provisions.length,'비축 계획 중복');
  for(const p of state.provisions)ensure(p.tick<=w.tick&&w.civilization.settlements.some(v=>v.id===p.settlementId)&&w.events.some(e=>e.id===p.source&&e.data.provisions&&e.tick===p.tick&&e.data.food===p.food&&e.data.target===p.target&&e.data.settlementId===p.settlementId)&&p.risk===(p.food<p.target),'비축 계획 근거');
}
