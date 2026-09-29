import type { NPC, WorldState } from './types';

// Reads only this resident's own relationships and remembered experiences.
export function affinity(w: WorldState, n: NPC, other: NPC) {
  const r = n.relationships.find(r => r.npcId === other.id);
  const memories = n.memories.filter(m => m.relatedNpcIds.includes(other.id));
  let experience = 0;
  for (const m of memories) {
    const recency = 1 / (1 + Math.max(0, w.tick - m.createdAt) / (144 * 7));
    experience += m.emotionalImpact / 100 * m.importance / 100 * recency * Math.min(3, m.repetitions);
  }
  const value = (r ? (r.trust - 35) * .18 + r.affection * .1 - r.resentment * .22 - r.fear * .06 : 0)
    + Math.max(-12, Math.min(12, experience * (2 + n.personality.empathy / 25)));
  return { value, evidence: [...new Set([...(r?.evidence.slice(-3) ?? []), ...memories.slice(-3).map(m => m.sourceEventId)])],
    reason: `신뢰 ${Math.round(r?.trust ?? 35)} · 불만 ${Math.round(r?.resentment ?? 0)} · 경험 ${memories.length}건 · 관계/기억 가중치 ${value.toFixed(1)}` };
}
