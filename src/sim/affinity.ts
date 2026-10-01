import { attraction, signed } from './attraction';
import type { NPC, WorldState } from './types';
import { retrieveMemories } from './memory-retrieval';

// Personal memories remain private; profile impressions are separate from event evidence.
export function affinity(w: WorldState, n: NPC, other: NPC) {
  const r = n.relationships.find(r => r.npcId === other.id);
  const memories = retrieveMemories(n.memories.filter(m => m.relatedNpcIds.includes(other.id)), w.tick, { npcIds: [other.id] }, 4).map(h => h.memory);
  let experience = 0;
  for (const m of memories) {
    const recency = 1 / (1 + Math.max(0, w.tick - m.createdAt) / (144 * 7));
    experience += m.emotionalImpact / 100 * m.importance / 100 * recency * Math.min(3, m.repetitions);
  }
  const impression = attraction(w, n, other);
  const history = (r ? (r.trust - 35) * .18 + r.affection * .1 - r.resentment * .22 - r.fear * .06 : 0)
    + Math.max(-12, Math.min(12, experience * (2 + n.personality.empathy / 25)));
  const value = history + impression.value;
  return { value, evidence: [...new Set([...(r?.evidence.slice(-3) ?? []), ...memories.slice(-3).map(m => m.sourceEventId)])],
    reason: `신뢰 ${Math.round(r?.trust ?? 35)} · 불만 ${Math.round(r?.resentment ?? 0)} · 경험 ${memories.length}건 · 관계/기억 ${history.toFixed(1)} · 현재 인상 ${signed(impression.value)} (${impression.reason})` };
}
