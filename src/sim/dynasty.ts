import { YEAR_TICKS, type NPC, type WorldEvent, type WorldState } from './types';
import { capacity, isTravelling, stocks } from './civilization';
export interface Dynasty { root: string; active: string; revision: number; chain: { npc: string; tick: number }[] }
export interface Deeds { shares: number; teaching: number; improvements: number; labor: number }
export const emptyDeeds = (): Deeds => ({ shares: 0, teaching: 0, improvements: 0, labor: 0 });
/** Breadth-first traversal counts each descendant once, even when two family branches meet. */
export function descendants(w: WorldState, root: string): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const n of w.npcs) for (const p of n.life.parentIds) { const list = children.get(p) ?? []; list.push(n.id); children.set(p, list); }
  const generations = new Map([[root, 0]]), queue = [root];
  for (let i = 0; i < queue.length; i++) for (const id of children.get(queue[i]) ?? []) if (!generations.has(id)) { generations.set(id, generations.get(queue[i])! + 1); queue.push(id); }
  // Parent generation precedes child generation in validated saves. Use the longest route.
  for (const n of w.npcs.filter(n => generations.has(n.id) && n.id !== root).sort((a, b) => a.life.generation - b.life.generation)) {
    generations.set(n.id, 1 + Math.max(...n.life.parentIds.filter(id => generations.has(id)).map(id => generations.get(id)!)));
  }
  return generations;
}
export function successorIds(w: WorldState, dynasty: Dynasty): string[] {
  const active = w.npcs.find(n => n.id === dynasty.active);
  if (!active || active.alive) return [];
  const family = descendants(w, active.id);
  return w.npcs.filter(n => n.alive && family.has(n.id) && n.id !== active.id).map(n => n.id);
}
export function succeed(w: WorldState, dynasty: Dynasty, npcId: string): Dynasty {
  if (!successorIds(w, dynasty).includes(npcId)) throw new Error('가문 계승은 사망한 아바타의 살아 있는 후손만 선택할 수 있습니다.');
  return { ...dynasty, active: npcId, revision: dynasty.revision + 1, chain: [...dynasty.chain, { npc: npcId, tick: w.tick }] };
}
export function deedsFromEvents(events: WorldEvent[], ids: Set<string>): Deeds {
  const result = emptyDeeds();
  for (const e of events) {
    if (e.data.observer === true) continue;
    if (e.kind === 'education' && e.targetId && ids.has(e.targetId)) result.teaching++;
    if (!e.actorId || !ids.has(e.actorId)) continue;
    if (e.kind === 'share') result.shares++;
    if (e.kind === 'project') result.improvements++;
    if (e.kind === 'construction' && e.data.phase === 'worked') result.labor++;
  }
  return result;
}
export function familyOutlook(w: WorldState, n: NPC): string {
  if (!n.alive) return '남겨진 후손의 삶에서 가문의 다음 장을 이어보세요.';
  if (n.identity.age < 18) return '성장하는 시기입니다. 성인이 된 뒤 가족을 이룰 수 있습니다.';
  const partner = w.npcs.find(p => p.id === n.life.partnerId && p.alive);
  if (!partner) return '가족의 시작은 서로의 관계입니다. 두 성인이 서로 신뢰 40·애정 10 이상이고 함께 살 빈 주거가 있어야 합니다.';
  if ([n, partner].some(p => p.identity.age > 45)) return '자녀를 낳는 나이(18–45세)를 지났습니다. 가족과의 관계와 다음 세대의 성장을 지켜보세요.';
  if (n.homeId !== partner.homeId || n.settlementId !== partner.settlementId || [n,partner].some(p => isTravelling(w,p))) return '두 사람이 같은 집과 마을에서 함께 지낼 수 있어야 합니다. 이동 중에는 출산하지 않습니다.';
  if ([n, partner].some(p => p.needs.health < 65 || p.needs.hunger > 60)) return '두 사람 모두 건강 65 이상·배고픔 60 이하가 되도록 생활을 회복할 시간이 필요합니다.';
  const home = w.buildings.find(b => b.id === n.homeId)!, residents = w.npcs.filter(p => p.alive && p.homeId === home.id).length;
  if (residents >= capacity(home)) return '함께 사는 집에 자녀를 맞을 빈자리가 없습니다. 주거 확장과 이주가 기회를 바꿀 수 있습니다.';
  if (stocks(w,n.settlementId).food+n.inventory.food+partner.inventory.food < (residents+1)*4) return '가족을 늘릴 식량 여유가 부족합니다. 공동 창고와 두 사람의 식량을 합쳐 확인합니다.';
  const remaining = Math.max(...[n,partner].map(p => YEAR_TICKS*2-(w.tick-p.life.lastBirth)));
  if (remaining > 0) return `입주·이전 출산 뒤의 준비 기간이 약 ${Math.ceil(remaining/144)}일 남았습니다. 다른 생활 조건도 계속 충족해야 합니다.`;
  return '현재 가족의 기본 생활 조건이 갖춰졌습니다. 다음 생애 갱신 때 인구 한도를 포함한 모든 조건을 다시 확인합니다.';
}
export function dynastyStats(w: WorldState, rootId: string, activeId: string) {
  const family = descendants(w, rootId), members = w.npcs.filter(n => family.has(n.id)), living = members.filter(n => n.alive);
  const aliveIds = new Set(living.map(n => n.id)), active = w.npcs.find(n => n.id === activeId)!;
  const homeShares = w.buildings.filter(b => b.kind === 'home' && b.ownerIds?.length).reduce((sum, b) => sum + b.ownerIds!.filter(id => aliveIds.has(id)).length / b.ownerIds!.length, 0);
  return { outlook: familyOutlook(w, active), children: w.npcs.filter(n => n.life.parentIds.includes(activeId)).length, descendants: members.length - 1, livingDescendants: living.filter(n => n.id !== rootId).length,
    generations: Math.max(0, ...family.values()) + 1, villages: new Set(living.map(n => n.settlementId)).size,
    coins: living.reduce((sum, n) => sum + n.wealth, 0), activeCoins: active.wealth, homeShares,
    members: members.map(n => ({ id: n.id, name: n.identity.name, alive: n.alive, age: n.identity.age, generation: family.get(n.id)! + 1, village: w.civilization.settlements.find(v => v.id === n.settlementId)?.name ?? n.settlementId })) };
}
export interface DynastyView {
  epoch: string; tick: number; dynasty: Dynasty | null; roots: { id: string; name: string; alive: boolean }[];
  stats?: ReturnType<typeof dynastyStats>; deeds?: Deeds; activeDeeds?: Deeds; history?: WorldEvent[];
  active?: Pick<NPC, 'id' | 'identity' | 'alive' | 'life'>; successors?: string[];
  openingCoins?: number | null; estateCoins?: number | null;
}
