import { z } from 'zod';
import type { NPC, WorldEvent, WorldState } from './types';
import { GOAL_KINDS, TICKS_PER_DAY } from './types';

const id = z.string().min(1).max(100), natural = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const goal = z.enum(GOAL_KINDS as [typeof GOAL_KINDS[number], ...typeof GOAL_KINDS[number][]]);
const evidence = z.array(id).max(4);
export const cognitionSchema = z.object({
  consideredMemoryIds: z.array(id).max(40), lastReflectionAt: natural,
  reflections: z.array(z.object({ eventId: id, tick: natural, goal, text: z.string().max(2000), evidence: evidence.min(2) }).strict()).max(8),
  plan: z.object({ day: natural, updatedAt: natural, revision: natural.min(1), signature: z.string().max(500), reason: z.string().max(2000),
    blocks: z.array(z.object({ start: natural.max(143), end: natural.min(1).max(144), intent: z.enum(['rest', 'sustain', 'work', 'connect']) }).strict()).min(1).max(8),
    focus: goal.optional(), evidence, interruption: z.enum(['hunger', 'thirst', 'fatigue', 'health']).optional(),
  }).strict().optional(),
  retrieval: z.object({ tick: natural, items: z.array(z.object({ eventId: id, score: z.number().min(0).max(3), recency: z.number().min(0).max(1), importance: z.number().min(0).max(1), relevance: z.number().min(0).max(1) }).strict()).max(8) }).strict().optional(),
}).strict();

export function validateCognition(w: WorldState, n: NPC, events: Map<string, WorldEvent>, ensure: (value: unknown, message: string) => void) {
  for (const m of n.memories) ensure(m.lastRetrievedAt === undefined || m.lastRetrievedAt >= m.createdAt && m.lastRetrievedAt <= w.tick, '기억 검색 시간');
  const c = n.cognition; if (!c) return; // Existing version 9 saves are upgraded lazily at their next decision.
  ensure(c.lastReflectionAt <= w.tick && new Set(c.consideredMemoryIds).size === c.consideredMemoryIds.length, '성찰 처리 시간/중복');
  ensure(new Set(c.reflections.map(r => r.eventId)).size === c.reflections.length, '중복 성찰');
  for (const r of c.reflections) {
    const source = events.get(r.eventId);
    ensure(r.tick <= w.tick && source?.tick === r.tick && source.actorId === n.id && source.kind === 'memory' && source.data.cognition === 'reflection' && source.data.model === 'rules' && source.data.goal === r.goal, '성찰 출처');
    ensure(new Set(r.evidence).size === r.evidence.length && JSON.stringify(source?.data.evidence) === JSON.stringify(r.evidence) && r.evidence.every(id => {
      const e = events.get(id); return e && e.tick <= r.tick && e.participants.includes(n.id) && !['rumor', 'memory'].includes(e.kind);
    }), '성찰 근거/지식 경계');
  }
  if (c.plan) {
    const p = c.plan;
    ensure(p.updatedAt <= w.tick && p.day === Math.floor(p.updatedAt / TICKS_PER_DAY), '하루 계획 시간');
    ensure(p.blocks[0].start === 0 && p.blocks.at(-1)!.end === TICKS_PER_DAY && p.blocks.every((b, i) => b.end > b.start && (!i || p.blocks[i - 1].end === b.start)), '하루 계획 구간');
    ensure(p.evidence.every(id => events.get(id)?.participants.includes(n.id)), '하루 계획 근거');
  }
  if (c.retrieval) ensure(c.retrieval.tick <= w.tick && c.retrieval.items.every(h => {
    const e = events.get(h.eventId); return e && e.tick <= c.retrieval!.tick && e.participants.includes(n.id) && Math.abs(h.score - h.recency - h.importance - h.relevance) < 1e-9;
  }), '검색 근거/점수');
}
