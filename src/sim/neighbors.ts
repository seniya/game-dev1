import { type WorldEvent, type WorldState } from './types';
import { activityStatus } from './activity-status';
import { occupationLabel } from './employment';
import { descendants } from './dynasty';

export interface ObservedGoal { id: string; title: string; condition: string; remaining: string; evidence?: WorldEvent }
export interface NeighborView {
  epoch: string; tick: number; people: ReturnType<typeof neighborPeople>; goals: ObservedGoal[];
  turns: WorldEvent[]; next: number | null; through: number;
}
export function neighborPeople(w: WorldState, ids: Set<string>) {
  return w.npcs.filter(n => ids.has(n.id)).map(n => ({
    id: n.id, name: n.identity.name, alive: n.alive, age: n.identity.age, position: n.position,
    village: w.civilization.settlements.find(v => v.id === n.settlementId)?.name ?? n.settlementId,
    occupation: occupationLabel(w,n), action: activityStatus(w,n).label,
    reason: n.currentAction && n.alive ? n.decision.reason : activityStatus(w,n).reason,
    problems: !n.alive ? [] : [n.needs.hunger >= 65 ? '식량 필요' : '', n.needs.thirst >= 70 ? '물 필요' : '', n.needs.fatigue >= 75 ? '휴식 필요' : '', n.needs.health < 50 ? '건강 악화' : ''].filter(Boolean),
    relations: n.relationships.filter(r => ids.has(r.npcId)).map(r => ({ id: r.npcId, familiarity: r.familiarity, trust: r.trust, affection: r.affection, resentment: r.resentment })),
  }));
}
export const groupGoals = (evidence: (WorldEvent | undefined)[], living: number): ObservedGoal[] => [
  { id: 'meal', title: '첫 공동 식사', condition: '내 주민 2명 이상이 같은 식사 모임을 실제로 완료하기.', remaining: '식사 제안·수락 뒤 같은 장소에서 식사를 마쳐야 합니다.' },
  { id: 'harvest', title: '함께 거둔 수확', condition: '내 주민 2명 이상이 같은 공동 수확을 완료하기.', remaining: '농장의 성장량·참석자·생활 여유가 필요합니다.' },
  { id: 'construction', title: '함께 세운 생활 터전', condition: '내 주민 2명 이상이 임금을 받고 현장 노동한 같은 공사가 완공되기.', remaining: '같은 공사의 현장 노동과 목재·기금·완공을 기다립니다.' },
].map((g, i) => ({ ...g, remaining: living < 2 ? '함께 살아가는 내 주민이 2명 이상 필요합니다.' : g.remaining, evidence: evidence[i] }));

export const legacyGoals = (evidence: (WorldEvent | undefined)[], w: WorldState, root: string): ObservedGoal[] => {
  const ids = descendants(w, root), businesses = w.urban.enterprises.filter(e => e.business?.shares.some(s => ids.has(s.npc)));
  const profit = businesses.reduce((s,e) => s + e.business!.revenue-e.business!.costs-e.business!.wages, 0);
  return [
    { id: 'profit', title: '첫 흑자의 기록', condition: '가문 지분이 있는 사업에서 누적 영업 손익이 양수인 생산 또는 실제 이익 분배 기록.', remaining: businesses.length ? `현재 가문 사업들의 전체 영업 손익 합계 ${profit}코인. 매출에서 원가·수리비·임금을 뺀 값이며 투자금 회수와 다릅니다.` : '먼저 가문원이 사업 지분을 소유해야 합니다. 인수에는 생활비를 포함한 68코인이 필요합니다.' },
    { id: 'ownership', title: '함께 소유하는 사업', condition: '가문원이 포함된 사업의 지분 상속 후 실제 소유자가 2명 이상인 기록.', remaining: '상속인의 자격과 기존 지분에 따라 공동 소유가 생깁니다. 관찰 후계자 선택은 지분을 추가 지급하지 않습니다.' },
    { id: 'legacy', title: '다음 세대의 현장', condition: '가문 후손이 배운 가업을 성년 진로로 선택하고 그 사업장에서 실제 생산하기.', remaining: '부모에게 기술 학습 → 성년 진로 선택 → 해당 사업장 고용·현장 생산이 필요합니다. 다른 진로도 선택할 수 있습니다.' },
  ].map((g, i) => ({ ...g, evidence: evidence[i] }));
};

/** Same predicates as the archive queries; reads never change simulation or grant rewards. */
export function localNeighbors(w: WorldState, epoch: string, ids: Set<string>, before = Infinity, through = w.events.length): NeighborView {
  const events = w.events.slice(0, through);
  const together = (e: WorldEvent) => new Set(e.participants.filter(id => ids.has(id))).size >= 2;
  const completed = (kind: string) => events.find(e => e.kind === 'gathering' && e.data.phase === 'completed' && e.data.gatheringKind === kind && together(e));
  const built = events.find(e => e.kind === 'construction' && e.data.phase === 'completed' && typeof e.data.projectId === 'string' && new Set(events.filter(a => a.tick <= e.tick && a.kind === 'construction' && a.data.phase === 'worked' && a.data.projectId === e.data.projectId && a.actorId && ids.has(a.actorId)).map(a => a.actorId)).size >= 2);
  const turns = events.map((e,i) => ({e,seq:i+1})).filter(({e,seq}) => seq < before && e.kind === 'relationship' && typeof e.data.turn === 'string' && !!e.actorId && ids.has(e.actorId) && !!e.targetId && ids.has(e.targetId)).reverse();
  return { epoch, tick: w.tick, people: neighborPeople(w, ids), goals: groupGoals([completed('meal'), completed('harvest'), built], w.npcs.filter(n=>ids.has(n.id)&&n.alive).length), turns: turns.slice(0,20).map(r=>r.e), next: turns.length>20?turns[19].seq:null, through };
}
export function localLegacyGoals(w: WorldState, root: string) {
  const ids = descendants(w, root), events = w.events;
  const owns = (e: WorldEvent) => Array.isArray(e.data.owners) && e.data.owners.some(id => ids.has(id));
  return legacyGoals([
    events.find(e => e.kind === 'industry' && ((e.data.phase === 'production' && Number(e.data.profit)>0 && owns(e)) || (e.data.phase === 'dividend' && Number(e.data.coins)>0 && e.participants.some(id=>ids.has(id))))),
    events.find(e => e.kind === 'inheritance' && e.data.phase === 'shares-inherited' && owns(e) && (e.data.owners as string[]).length >= 2),
    events.find(e => e.kind === 'industry' && e.data.phase === 'production' && e.data.tradeSuccessor === true && !!e.actorId && e.actorId !== root && ids.has(e.actorId)),
  ],w,root);
}
