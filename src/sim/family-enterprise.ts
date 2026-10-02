import { z } from 'zod';
import type { NPC, WorldState } from './types';
import type { Enterprise, Good } from './urban-types';
import { EXTRA_RECIPES, GOOD_PRICES, INDUSTRY_LABELS, INDUSTRY_SKILL } from './urban-types';
import { market, isTravelling } from './civilization';
import { canWork } from './employment';
import { appendEvent } from './social';
const nat = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), id = z.string().min(1).max(100);
export const businessSchema = z.object({
  shares: z.array(z.object({ npc: id, weight: z.number().positive().max(1) }).strict()).max(30000),
  community: z.number().min(0).max(1), cash: nat, capital: nat, purchase: nat, revenue: nat, costs: nat, wages: nat, dividends: nat,
  source: id, latest: id, since: nat,
}).strict();
export type Business = z.infer<typeof businessSchema>;
export const BUSINESS_PRICE = 24, BUSINESS_CAPITAL = 24;
export function acquireBusiness(w: WorldState, npcId: string, enterpriseId: string, observer = false) {
  const n = w.npcs.find(n => n.id === npcId), e = w.urban.enterprises.find(e => e.id === enterpriseId);
  if (!n || !e || e.business || !canWork(w,n) || isTravelling(w,n) || n.settlementId !== e.settlementId || n.wealth < BUSINESS_PRICE + BUSINESS_CAPITAL + 20 || n.needs.hunger >= 65 || n.needs.health < 50) throw new Error('같은 마을의 건강한 성인과 생활비를 포함한 68코인, 아직 공동 소유인 사업체가 필요합니다.');
  n.wealth -= BUSINESS_PRICE + BUSINESS_CAPITAL; market(w,e.settlementId).coins += BUSINESS_PRICE;
  const event = appendEvent(w,{kind:'industry',actorId:n.id,locationId:e.buildingId,causeId:e.sourceEventId,importance:60,description:`${n.identity.name}이 ${INDUSTRY_LABELS[e.kind]}을 공동체에서 ${BUSINESS_PRICE}코인에 인수하고 운영금 ${BUSINESS_CAPITAL}코인을 넣었다. 생활비 20코인 이상을 남겼다.`,data:{business:e.id,phase:'acquired',purchase:BUSINESS_PRICE,capital:BUSINESS_CAPITAL,observer}});
  e.business = {shares:[{npc:n.id,weight:1}],community:0,cash:BUSINESS_CAPITAL,capital:BUSINESS_CAPITAL,purchase:BUSINESS_PRICE,revenue:0,costs:0,wages:0,dividends:0,source:event.id,latest:event.id,since:w.tick};
}
/** Quote exactly the existing physical recipe before any inventory or money changes. */
export function businessQuote(w: WorldState, e: Enterprise, n: NPC) {
  const c=w.urban.cities.find(c=>c.settlementId===e.settlementId)!,b=w.buildings.find(b=>b.id===e.buildingId)!,m=market(w,e.settlementId),u=w.urban.citizens[n.id];
  const units=1+Math.floor((u.skills[INDUSTRY_SKILL[e.kind]]+u.education*.3)/35);
  let revenue=0,costs=0;
  const recipe=EXTRA_RECIPES[e.kind];
  if(recipe){revenue=Object.entries(recipe.outputs).reduce((s,[g,q])=>s+GOOD_PRICES[g as Good]*q,0);costs=Object.entries(recipe.inputs).reduce((s,[g,q])=>s+GOOD_PRICES[g as Good]*q,0)+(recipe.wood??0)*m.woodPrice;}
  else switch(e.kind){
    case 'field': revenue=Math.min(Math.floor(b.growth),Math.max(1,Math.round(units*2*c.fertility/45)))*GOOD_PRICES.grain;break;
    case 'quarry': revenue=Math.min(units,c.deposits.stone)*GOOD_PRICES.stone;break;
    case 'mine': revenue=Math.min(units,c.deposits.ore)*GOOD_PRICES.ore;break;
    case 'mill': costs=2*GOOD_PRICES.grain;revenue=3*m.foodPrice;break;
    case 'smith': costs=2*GOOD_PRICES.ore+m.woodPrice;revenue=GOOD_PRICES.tools;break;
    case 'garden': revenue=GOOD_PRICES.herbs+GOOD_PRICES.fiber;break;
    case 'weaving': costs=2*GOOD_PRICES.fiber;revenue=GOOD_PRICES.cloth;break;
    case 'tailoring': costs=2*GOOD_PRICES.cloth;revenue=GOOD_PRICES.clothes;break;
    case 'kitchen': costs=2*GOOD_PRICES.grain+GOOD_PRICES.herbs;revenue=2*GOOD_PRICES.meals;break;
    case 'joinery': costs=GOOD_PRICES.tools+3*m.woodPrice;revenue=GOOD_PRICES.furniture;break;
  }
  return {revenue,costs};
}
export function businessReadiness(w: WorldState,e:Enterprise) {
  const p=e.business;if(!p)return '공동체 소유';
  if(w.urban.buildings[e.buildingId].condition<20)return '시설 수리 대기';
  if(!e.workers.length)return '일할 주민을 기다리는 중';
  const n=w.npcs.find(n=>n.id===e.workers[0])!,q=businessQuote(w,e,n);
  if(p.cash<q.costs+e.wage)return '운영금 부족 · 생산 대기';
  if(market(w,e.settlementId).coins<q.revenue)return '시장 매입금 부족 · 생산 대기';
  return '자금 확보 · 재료·성장·현장 노동 조건에 따라 생산';
}
export function inheritBusinesses(w:WorldState,n:NPC,heirs:NPC[],causeId:string) {
  for(const e of w.urban.enterprises){
    const p=e.business,share=p?.shares.find(s=>s.npc===n.id);if(!p||!share)continue;
    p.shares=p.shares.filter(s=>s.npc!==n.id);
    if(heirs.length)for(const heir of heirs){const existing=p.shares.find(s=>s.npc===heir.id);if(existing)existing.weight+=share.weight/heirs.length;else p.shares.push({npc:heir.id,weight:share.weight/heirs.length});}
    else p.community+=share.weight;
    p.shares.sort((a,b)=>a.npc.localeCompare(b.npc));
    p.latest=appendEvent(w,{kind:'inheritance',actorId:n.id,participants:[n.id,...heirs.map(h=>h.id)],locationId:e.buildingId,causeId,importance:60,description:`${n.identity.name}의 ${INDUSTRY_LABELS[e.kind]} 지분 ${(share.weight*100).toFixed(2)}%를 ${heirs.length?'살아 있는 자녀와 배우자에게 균등하게':'마을 공동체에'} 계승했다. 사업 운영금은 사업체에 남는다.`,data:{business:e.id,phase:'shares-inherited',owners:p.shares.map(s=>s.npc),weight:share.weight,recipients:heirs.map(h=>h.id)}}).id;
  }
}
export function enterpriseDay(w:WorldState) {
  // Retain operating capital and unrecovered losses; distribute only earned surplus.
  for(const e of w.urban.enterprises){const p=e.business;if(!p)continue;
    const amount=Math.max(0,Math.min(p.cash-BUSINESS_CAPITAL,p.revenue-p.costs-p.wages-p.dividends));
    if(amount){
      let remaining=amount;const recipients:string[]=[];
      for(const share of p.shares){const n=w.npcs.find(n=>n.id===share.npc);if(!n?.alive)continue;const coins=Math.floor(amount*share.weight);n.wealth+=coins;remaining-=coins;if(coins)recipients.push(n.id);}
      // Rounding stays in the business unless there is a community share.
      const communal=Math.min(remaining,Math.floor(amount*p.community));market(w,e.settlementId).coins+=communal;remaining-=communal;
      const paid=amount-remaining;if(paid){p.cash-=paid;p.dividends+=paid;p.latest=appendEvent(w,{kind:'industry',participants:recipients,locationId:e.buildingId,causeId:p.source,importance:45,description:`${INDUSTRY_LABELS[e.kind]}의 누적 이익에서 ${paid}코인을 지분에 따라 분배했다. 운영금과 미회수 손실은 먼저 남겼다.`,data:{business:e.id,phase:'dividend',coins:paid,communityCoins:communal}}).id;}
    }
  }
  // One voluntary acquisition per settlement per day, restricted to residents with a business motive.
  for(const v of w.civilization.settlements){
    const candidates=w.npcs.filter(n=>canWork(w,n)&&n.settlementId===v.id&&!isTravelling(w,n)&&n.wealth>=68&&n.needs.hunger<65&&n.needs.health>=50&&(n.life.ambition==='wealth'||n.personality.greed>=70)&&!w.urban.enterprises.some(e=>e.business?.shares.some(s=>s.npc===n.id))).sort((a,b)=>b.wealth-a.wealth||a.id.localeCompare(b.id));
    const n=candidates[0];if(!n)continue;
    const e=w.urban.enterprises.find(e=>e.settlementId===v.id&&!e.business&&e.workers.includes(n.id));
    if(e)acquireBusiness(w,n.id,e.id);
  }
}
export function validateBusinesses(w:WorldState,ensure:(c:unknown,m:string)=>void){
  const events=new Map(w.events.map(e=>[e.id,e]));
  for(const e of w.urban.enterprises){const p=e.business;if(!p)continue;
    ensure(new Set(p.shares.map(s=>s.npc)).size===p.shares.length&&p.shares.every(s=>w.npcs.some(n=>n.id===s.npc&&n.alive)),'사업 지분 소유자');
    ensure(Math.abs(p.community+p.shares.reduce((s,x)=>s+x.weight,0)-1)<1e-9,'사업 지분 보존');
    ensure(p.cash===p.capital+p.revenue-p.costs-p.wages-p.dividends,'사업 장부 보존');
    ensure(p.since<=w.tick,'사업 시작 시간');
    ensure(events.get(p.source)?.data.business===e.id&&events.get(p.source)?.data.phase==='acquired'&&events.get(p.latest)?.data.business===e.id,'사업 원본 근거');
  }
}
