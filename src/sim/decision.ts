import { type WorldState, type NPC, type Candidate, type Action, type ActionKind } from './types';
import { distance } from './random';
import { findPath } from './pathfinding';

const durations: Record<ActionKind, number> = { Idle: 2, Move: 1, Sleep: 8, Eat: 1, Drink: 1, Gather: 3, Work: 4, Talk: 2, StoreItem: 1, TakeItem: 1, Share: 1, Theft: 2, Trade: 1, Borrow: 1, Repay: 1 };
export function candidates(w: WorldState, n: NPC): Candidate[] {
  const list: Candidate[] = [];
  const add = (kind: ActionKind, score: number, reason: string, target = n.position, targetId?: string) => list.push({ kind, score: Math.round((score - distance(n.position, target) * .6) * 10) / 10, reason, target: { ...target }, targetId });
  const has = (kind: string) => n.goals.some(g => g.kind === kind);
  const home = w.buildings.find(b => b.id === n.homeId)!;
  const storage = w.buildings.find(b => b.kind === 'storage')!;
  const market = w.buildings.find(b => b.kind === 'market')!;
  const farm = w.buildings.find(b => b.kind === 'farm')!;
  const well = w.buildings.find(b => b.kind === 'well')!;
  const night = w.tick % 144 >= 126 || w.tick % 144 < 30;
  add('Idle', 8, '주변을 살피며 잠시 쉰다.');
  if (n.inventory.food > 0) add('Eat', n.needs.hunger * 1.9 - 25, `배고픔 ${Math.round(n.needs.hunger)} · 소지 식량 ${n.inventory.food}`);
  add('Drink', n.needs.thirst * 1.9 - 22, `갈증 ${Math.round(n.needs.thirst)} · 우물에서 물을 마신다.`, well.position, well.id);
  add('Sleep', n.needs.fatigue * 1.5 - 20 + (night ? 24 : 0), `피로 ${Math.round(n.needs.fatigue)}${night ? ' · 밤에는 수면을 우선한다.' : ''}`, home.position, home.id);
  if (n.inventory.food < 2 + Math.floor(n.personality.greed / 30) && w.storage.food > 0) {
    if (n.dailyTaken < 3) add('TakeItem', n.needs.hunger * 1.2 + n.personality.greed * .3 + (has('secure_food') ? 12 : 0), `공동 식량 ${w.storage.food} · 오늘 인출 ${n.dailyTaken}/3`, storage.position, storage.id);
    else if (n.needs.hunger > 60 || n.personality.greed > 70) add('Theft', n.needs.hunger * .95 + n.personality.greed * .5 - n.personality.empathy * .4 - storage.level * 7, '인출 한도를 소진했다. 굶주림·탐욕과 타인에 대한 공감을 비교한다.', storage.position, storage.id);
  }
  for (const r of w.resources) {
    if (r.amount < 1 || (r.kind === 'wood' && n.inventory.wood >= 8)) continue;
    const foodNeed = n.inventory.food < 3 ? n.needs.hunger * .85 : -30;
    add('Gather', r.kind === 'food' ? 18 + foodNeed + (n.occupation === 'gatherer' ? 22 : 0) : 20 + n.personality.diligence * .25 + (n.occupation === 'woodcutter' ? 25 : 0), r.kind === 'food' ? '주변 열매를 채집해 식량을 확보한다.' : '숲에서 목재를 모은다.', r.position, r.id);
  }
  if (farm.growth >= 3 && n.inventory.food < 7) add('Work', 25 + n.personality.diligence * .4 + (n.occupation === 'farmer' ? 25 : 0) + (n.inventory.food < 2 ? n.needs.hunger * .6 : 0), `농장 수확 가능량 ${Math.floor(farm.growth)} · 근면 ${Math.round(n.personality.diligence)}`, farm.position, farm.id);
  const project = n.goals.find(g => ['expand_farm', 'secure_storage', 'build_home'].includes(g.kind));
  if (project && n.inventory.wood + w.storage.wood >= 8) {
    const b = project.kind === 'expand_farm' ? farm : project.kind === 'build_home' ? home : storage;
    if (b.level < 4) add('Work', 65 + n.personality.diligence * .2, `장기 목표: ${project.reason}`, b.position, `${b.id}:${project.kind}`);
  }
  if (n.inventory.food > 3 || n.inventory.wood >= 4) add('StoreItem', 40 + n.personality.empathy * .35 + n.inventory.wood * 2 - n.personality.greed * .2, '여분의 자원을 공동 창고에 보관한다.', storage.position, storage.id);
  if (n.inventory.food < 2 && w.market.food > 0 && n.wealth >= w.market.foodPrice) add('Trade', n.needs.hunger * 1.1 + (n.occupation === 'merchant' ? 15 : 0), `시장 식량 가격 ${w.market.foodPrice} · 재산 ${n.wealth}`, market.position, 'buy');
  if (n.inventory.wood >= 2 && w.market.coins >= w.market.woodPrice * 2) add('Trade', 38 + n.personality.greed * .45 + (has('earn_wealth') ? 15 : 0), '목재를 팔아 생활비를 마련한다.', market.position, 'sell');
  for (const other of w.npcs) {
    if (!other.alive || other.id === n.id) continue;
    const d = distance(n.position, other.position);
    if (d > 7) continue;
    if (n.inventory.food > 1 && other.inventory.food === 0 && (other.needs.hunger > 60 || other.needs.health < 55)) add('Share', 25 + n.personality.empathy * .85 + (has('help_neighbor') ? 15 : 0) - n.needs.hunger * .3, `${other.identity.name}의 식량이 없고 ${other.needs.health < 55 ? '몸이 아프다' : '배고픔이 높다'}.`, other.position, other.id);
    if (w.tick - n.lastTalk > 18 && w.tick - other.lastTalk > 8 && d <= 4) add('Talk', (100 - n.needs.social) * .65 + n.personality.sociability * .3 + (has('make_friend') ? 15 : 0), `${other.identity.name}과 대화하고 싶다. 사회적 충족 ${Math.round(n.needs.social)}`, other.position, other.id);
    const rel = other.relationships.find(r => r.npcId === n.id);
    if (n.inventory.food === 0 && n.needs.hunger > 65 && other.inventory.food >= 3 && (rel?.trust ?? 35) >= 30 && !w.loans.some(l => l.borrowerId === n.id && l.status !== 'repaid')) add('Borrow', n.needs.hunger * 1.2, `${other.identity.name}에게 식량을 빌릴 수 있다.`, other.position, other.id);
  }
  for (const loan of w.loans.filter(l => l.borrowerId === n.id && l.status === 'active' && n.inventory.food >= l.amount + 1)) {
    const lender = w.npcs.find(p => p.id === loan.lenderId);
    if (lender?.alive) add('Repay', 55 + n.personality.empathy * .4 + (w.tick >= loan.due - 72 ? 25 : 0), `${lender.identity.name}에게 빌린 식량 ${loan.amount} 상환`, lender.position, loan.id);
  }
  return list.sort((a, b) => b.score - a.score);
}
export function plan(w: WorldState, n: NPC): { action: Action; candidates: Candidate[] } {
  const options = candidates(w, n);
  for (const candidate of options) {
    const path = findPath(w, n.position, candidate.target);
    if (path !== null) return { action: { ...candidate, path, progress: 0, duration: durations[candidate.kind] }, candidates: options.slice(0, 6) };
  }
  return { action: { kind: 'Idle', score: 0, reason: '도달 가능한 행동을 찾지 못했다.', target: { ...n.position }, path: [], progress: 0, duration: 1 }, candidates: options.slice(0, 6) };
}
