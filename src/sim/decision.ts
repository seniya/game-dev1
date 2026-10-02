import { prepareCandidates } from './cooperation';
import { constructionCandidate } from './construction';
import { gatheringCandidate } from './gatherings';
import { canWork } from './employment';
import { livingCandidates } from './living';
import { neighbours } from './spatial';
import { canProduce } from './urban';
import { INDUSTRY_LABELS } from './urban-types';
import { stocks, market as villageMarket, localBuilding } from './civilization';
import { type WorldState, type NPC, type Candidate, type Action, type ActionKind } from './types';
import { distance } from './random';
import { affinity } from './affinity';
import { socialMotives } from './social-motives';
import { findPath } from './pathfinding';
import { applyPlan } from './cognition';

const durations: Record<ActionKind, number> = { Attend: 6, Wash: 3, Idle: 2, Move: 1, Sleep: 8, Eat: 1, Drink: 1, Gather: 3, Work: 4, Talk: 2, StoreItem: 1, TakeItem: 1, Share: 1, Theft: 2, Trade: 1, Borrow: 1, Repay: 1 };
export function candidates(w: WorldState, n: NPC): Candidate[] {
  const list: Candidate[] = [];
  const stock = stocks(w, n.settlementId), localMarket = villageMarket(w, n.settlementId);
  const add = (kind: ActionKind, score: number, reason: string, target = n.position, targetId?: string, evidence?: string[]) => list.push({ kind, score: Math.round((score - distance(n.position, target) * .6) * 10) / 10, reason, target: { ...target }, targetId, evidence });
  const has = (kind: string) => n.goals.some(g => g.kind === kind);
  const home = w.buildings.find(b => b.id === n.homeId)!;
  const storage = localBuilding(w, n, 'storage');
  const market = localBuilding(w, n, 'market');
  const farm = w.buildings.filter(b => b.kind === 'farm' && b.settlementId === n.settlementId && !w.urban.enterprises.some(e => e.buildingId === b.id) && b.growth >= 3).sort((a, b) => distance(a.position, n.position) - distance(b.position, n.position))[0] ?? w.buildings.find(b => b.kind === 'farm' && b.settlementId === n.settlementId && !w.urban.enterprises.some(e => e.buildingId === b.id))!;
  const well = localBuilding(w, n, 'well');
  const urban = w.urban.citizens[n.id];
  const night = w.tick % 144 >= 126 || w.tick % 144 < 30;
  const site=constructionCandidate(w,n);if(site)list.push(site);
  const job = canProduce(w, n);
  if (job) add('Work', 76 + n.personality.diligence * .25 - (w.urban.citizens[n.id]?.stress ?? 0) * .15, `${INDUSTRY_LABELS[job.e.kind]} · 임금 ${job.e.wage}코인 · 재료와 기금 확보`, job.b.position, `industry:${job.e.buildingId}`);
  add('Idle', 8, '주변을 살피며 잠시 쉰다.');
  if (n.inventory.food > 0) add('Eat', n.needs.hunger * 1.9 - 25, `배고픔 ${Math.round(n.needs.hunger)} · 소지 식량 ${n.inventory.food}`);
  add('Drink', n.needs.thirst * 1.9 - 22, `갈증 ${Math.round(n.needs.thirst)} · 우물에서 물을 마신다.`, well.position, well.id);
  add('Sleep', n.needs.fatigue * 1.5 - 20 + (night ? 24 : 0) + urban.stress * .15 + urban.injury * .3, `피로 ${Math.round(n.needs.fatigue)}${night ? ' · 밤에는 수면을 우선한다.' : ''}`, home.position, home.id);
  if (n.inventory.food < 2 + Math.floor(n.personality.greed / 30) && stock.food > 0) {
    if (n.dailyTaken < 3) add('TakeItem', n.needs.hunger * 1.2 + n.personality.greed * .3 + (has('secure_food') ? 12 : 0), `공동 식량 ${stock.food} · 오늘 인출 ${n.dailyTaken}/3`, storage.position, storage.id);
    else if (n.needs.hunger > 60 || n.personality.greed > 70) add('Theft', n.needs.hunger * .95 + n.personality.greed * .5 - n.personality.empathy * .4 - storage.level * 7 + (50 - urban.trust) * .1, '인출 한도를 소진했다. 굶주림·탐욕과 타인에 대한 공감을 비교한다.', storage.position, storage.id);
  }
  for (const r of w.resources) {
    if (distance(r.position, n.position) > 20 || r.amount < 1 || (r.kind === 'wood' && n.inventory.wood >= 8)) continue;
    const foodNeed = n.inventory.food < 3 ? n.needs.hunger * .85 : -30;
    add('Gather', r.kind === 'food' ? 18 + foodNeed + (n.occupation === 'gatherer' ? 22 : 0) : 20 + n.personality.diligence * .25 + (n.occupation === 'woodcutter' ? 25 : 0), r.kind === 'food' ? '주변 열매를 채집해 식량을 확보한다.' : '숲에서 목재를 모은다.', r.position, r.id);
  }
  if (farm.growth >= 3 && n.inventory.food < 7) add('Work', 25 + n.personality.diligence * .4 + (n.occupation === 'farmer' ? 25 : 0) + (n.inventory.food < 2 ? n.needs.hunger * .6 : 0), `농장 수확 가능량 ${Math.floor(farm.growth)} · 근면 ${Math.round(n.personality.diligence)}`, farm.position, farm.id);
  const project = n.goals.find(g => ['expand_farm', 'secure_storage', 'build_home'].includes(g.kind));
  if (project && n.inventory.wood + stock.wood >= 8) {
    const b = project.kind === 'expand_farm' ? farm : project.kind === 'build_home' ? home : storage;
    if (b.level < 4) add('Work', 65 + n.personality.diligence * .2, `장기 목표: ${project.reason}`, b.position, `${b.id}:${project.kind}`);
  }
  if (!project && n.occupation === 'carpenter' && farm.level < 4 && n.inventory.wood + stock.wood >= 8) add('Work', 52 + n.personality.diligence * .2, `농장 ${farm.level}단계 · 목재 8개 투자로 성장 속도 +35%p`, farm.position, `${farm.id}:expand_farm`);
  if (n.inventory.food > 3 || n.inventory.wood >= 4) add('StoreItem', 40 + n.personality.empathy * .35 + n.inventory.wood * 2 - n.personality.greed * .2, '여분의 자원을 공동 창고에 보관한다.', storage.position, storage.id);
  if (n.inventory.food < 2 && localMarket.food > 0 && n.wealth >= localMarket.foodPrice) add('Trade', n.needs.hunger * 1.1 + (n.occupation === 'merchant' ? 15 : 0), `시장 식량 가격 ${localMarket.foodPrice} · 재산 ${n.wealth}`, market.position, 'buy');
  if (n.inventory.wood >= 2 && localMarket.coins >= localMarket.woodPrice * 2) add('Trade', 38 + n.personality.greed * .45 + (has('earn_wealth') ? 15 : 0), '목재를 팔아 생활비를 마련한다.', market.position, 'sell');
  for (const other of (w.npcs.length > 400 ? neighbours(w, n, 7).sort((a, b) => distance(n.position, a.position) - distance(n.position, b.position)).slice(0, 24) : neighbours(w, n, 7))) {
    if (!other.alive || other.id === n.id) continue;
    const d = distance(n.position, other.position);
    if (d > 7) continue;
    const rel = other.relationships.find(r => r.npcId === n.id);
    const share=n.inventory.food > 1 && other.inventory.food === 0 && (other.needs.hunger > 60 || other.needs.health < 55);
    const talk=w.tick - n.lastTalk > 18 && w.tick - other.lastTalk > 8 && d <= 4;
    const borrow=n.inventory.food === 0 && n.needs.hunger > 65 && other.inventory.food >= 3 && (rel?.trust ?? 35) >= 30 && !w.loans.some(l => l.borrowerId === n.id && l.status !== 'repaid');
    const trade=n.inventory.food < 2 && other.inventory.food > 3 && n.wealth >= localMarket.foodPrice && (rel?.trust ?? 35) >= 20;
    if(!share&&!talk&&!borrow&&!trade)continue;
    const bond = affinity(w, n, other);
    const consent = borrow ? affinity(w, other, n) : undefined;
    const motives = socialMotives(w, n, other);
    const evidence = [...new Set([...bond.evidence, ...motives.evidence])];
    const experienceReason = motives.reason ? ` · ${motives.reason}` : '';
    if (d > 7) continue;
    if (share) add('Share', 25 + n.personality.empathy * .85 + (has('help_neighbor') ? 15 : 0) - n.needs.hunger * .3 + bond.value + motives.share, `${other.identity.name}의 식량이 없고 ${other.needs.health < 55 ? '몸이 아프다' : '배고픔이 높다'}. ${bond.reason}${experienceReason}`, other.position, other.id, evidence);
    if (talk) add('Talk', (100 - n.needs.social) * .65 + n.personality.sociability * .3 + (has('make_friend') ? 15 : 0) + bond.value + motives.talk, `${other.identity.name}과 대화하고 싶다. 사회적 충족 ${Math.round(n.needs.social)} · ${bond.reason}${experienceReason}`, other.position, other.id, evidence);
    if (borrow) add('Borrow', n.needs.hunger * 1.2 + bond.value + consent!.value * .4 + motives.borrow, `${other.identity.name}에게 식량을 빌릴 수 있다. ${bond.reason} · 상대의 신뢰 ${Math.round(rel?.trust ?? 35)}${experienceReason}`, other.position, other.id, [...new Set([...evidence, ...consent!.evidence])]);
    if (trade) add('Trade', n.needs.hunger * 1.15 + bond.value + 8, `${other.identity.name}의 여분 식량을 ${localMarket.foodPrice}코인에 구매. ${bond.reason}`, other.position, `peer:${other.id}`, evidence);
  }
  for (const loan of w.loans.filter(l => l.borrowerId === n.id && l.status !== 'repaid' && n.inventory.food > 1)) {
    const lender = w.npcs.find(p => p.id === loan.lenderId);
    if (lender?.alive) add('Repay', 55 + n.personality.empathy * .4 + (w.tick >= loan.due - 72 ? 25 : 0), `${lender.identity.name}에게 남은 빚 ${loan.remaining}개 중 ${Math.min(loan.remaining, n.inventory.food - 1)}개 상환`, lender.position, loan.id);
  }
  if (!canWork(w, n)) for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === 'Work' || list[i].kind === 'Gather') list.splice(i, 1);
  prepareCandidates(w, n, list);
  livingCandidates(w, n, list);
  const appointment = gatheringCandidate(w, n); if (appointment) list.push(appointment);
  return list.sort((a, b) => b.score - a.score);
}
export function plan(w: WorldState, n: NPC): { action: Action; candidates: Candidate[] } {
  // Omitted optional actions must get the same insertion order after a JSON round trip.
  if (!n.currentAction) delete n.currentAction;
  const options = candidates(w, n);
  applyPlan(w, n, options);
  options.sort((a, b) => b.score - a.score);
  for (const candidate of options) {
    const path = findPath(w, n.position, candidate.target);
    if (path !== null) return { action: { ...candidate, path, progress: 0, duration: durations[candidate.kind] }, candidates: options.slice(0, 6) };
  }
  return { action: { kind: 'Idle', score: 0, reason: '도달 가능한 행동을 찾지 못했다.', target: { ...n.position }, path: [], progress: 0, duration: 1 }, candidates: options.slice(0, 6) };
}
