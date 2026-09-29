import type { WorldState, WorldEvent } from './types';
export const HISTORY_TOPICS = ['population', 'economy', 'ecology', 'society'] as const;
export type HistoryTopic = typeof HISTORY_TOPICS[number];
export const HISTORY_LABELS: Record<HistoryTopic, string> = { population: '인구와 세대는 어떻게 변했나?', economy: '재산과 생산은 어떻게 변했나?', ecology: '자연과 식량은 어떻게 변했나?', society: '공동결정과 도시 관계는 어떻게 변했나?' };
export const HISTORY_KINDS: Record<HistoryTopic, string[]> = {
  population: ['birth', 'death', 'family', 'inheritance', 'migration', 'settlement'],
  economy: ['inheritance', 'trade', 'industry', 'freight', 'tax', 'public_service', 'construction', 'scarcity'],
  ecology: ['ecology', 'weather', 'scarcity', 'health'],
  society: ['council', 'diplomacy', 'policy', 'share', 'theft', 'migration'],
};
export function historyMatches(w: WorldState, e: WorldEvent, topic: HistoryTopic, settlementId?: string, npcId?: string) {
  if (!HISTORY_KINDS[topic].includes(e.kind) || e.kind === 'health' && e.importance < 45) return false;
  if (npcId && ![e.actorId, e.targetId, ...e.participants].includes(npcId)) return false;
  if (settlementId && e.data.settlementId !== settlementId && e.data.from !== settlementId && e.data.to !== settlementId && !w.buildings.some(b => b.id === e.locationId && b.settlementId === settlementId)) return false;
  return true;
}
export interface HistoryCard { id: string; tick: number; text: string; kind: string; causeId?: string }
export interface HistoryContext { topic: HistoryTopic; cards: HistoryCard[] }
export function historyContext(events: WorldEvent[], topic: HistoryTopic): HistoryContext {
  const selected = events.filter(e => HISTORY_KINDS[topic].includes(e.kind) && (e.kind !== 'health' || e.importance >= 45)).slice(-8);
  return { topic, cards: selected.map(e => ({ id: e.id, tick: e.tick, text: e.description.slice(0, 800), kind: e.kind, ...(e.causeId ? { causeId: e.causeId } : {}) })) };
}
export function validateHistorySelection(input: unknown, context: HistoryContext): string[] | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).join() !== 'evidence') return null;
  const ids = (input as { evidence?: unknown }).evidence;
  if (!Array.isArray(ids) || !ids.length || ids.length > 3 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !context.cards.some(c => c.id === id))) return null;
  return ids as string[];
}
export function familyTree(w: WorldState, npcId: string) {
  const byId = new Map(w.npcs.map(n => [n.id, n]));
  const seen = new Set<string>(), pending = [{ id: npcId, depth: 0 }];
  for (let i = 0; i < pending.length && seen.size < 80; i++) {
    const { id, depth } = pending[i], n = byId.get(id); if (!n || seen.has(id)) continue; seen.add(id);
    if (depth >= 3) continue;
    for (const p of [...n.life.parentIds, ...(n.life.partnerId ? [n.life.partnerId] : []), ...w.npcs.filter(c => c.life.parentIds.includes(id)).map(c => c.id)]) if (!seen.has(p)) pending.push({ id: p, depth: depth + 1 });
  }
  return w.npcs.filter(n => seen.has(n.id)).map(n => ({ id: n.id, name: n.identity.name, alive: n.alive, generation: n.life.generation, parentIds: n.life.parentIds, partnerId: n.life.partnerId, wealth: n.wealth, birthEventId: n.life.birthEventId, deathEventId: n.life.deathEventId }));
}
