import { retrieveMemories } from './memory-retrieval';
import { appendEvent, eventById } from './social';
import { GOAL_LABELS, TICKS_PER_DAY, type Candidate, type GoalKind, type NPC, type WorldState } from './types';

export const PLAN_LABELS = { rest: '휴식과 수면', sustain: '식사와 생활 준비', work: '생업과 마을 일', connect: '이웃과 교류' };
export type PlanIntent = keyof typeof PLAN_LABELS;
export interface Reflection { eventId: string; tick: number; goal: GoalKind; text: string; evidence: string[] }
export interface DailyPlan {
  day: number; updatedAt: number; revision: number; signature: string; reason: string;
  blocks: { start: number; end: number; intent: PlanIntent }[];
  focus?: GoalKind; evidence: string[]; interruption?: 'hunger' | 'thirst' | 'fatigue' | 'health';
}
export interface Cognition {
  consideredMemoryIds: string[]; lastReflectionAt: number; reflections: Reflection[];
  plan?: DailyPlan;
  retrieval?: { tick: number; items: { eventId: string; score: number; recency: number; importance: number; relevance: number }[] };
}
export function cognition(n: NPC): Cognition {
  return n.cognition ??= { consideredMemoryIds: [], lastReflectionAt: 0, reflections: [] };
}
// These are grounded summaries of repeated experiences, not model-generated beliefs.
const reflectionRules: { goal: GoalKind; kinds: string[]; text: string }[] = [
  { goal: 'secure_food', kinds: ['scarcity', 'health'], text: '먹거리와 몸 상태의 어려움이 반복되었다. 생활에 필요한 식량을 먼저 챙기고 싶다.' },
  { goal: 'help_neighbor', kinds: ['share', 'repayment'], text: '도움을 나누거나 약속을 지킨 경험이 쌓였다. 여유가 생기면 이웃을 돕고 싶다.' },
  { goal: 'make_friend', kinds: ['talk', 'family', 'education', 'gathering'], text: '함께 이야기하고 배운 경험이 쌓였다. 가까운 사람들과 교류를 이어가고 싶다.' },
  { goal: 'secure_storage', kinds: ['witness'], text: '공동 자원이 사라지는 일을 거듭 목격했다. 창고를 더 안전하게 만들고 싶다.' },
  { goal: 'earn_wealth', kinds: ['trade', 'default'], text: '거래와 생계의 경험이 쌓였다. 생활에 필요한 재산을 마련하고 싶다.' },
];
export function reflect(w: WorldState, n: NPC) {
  const c = cognition(n);
  if (!n.alive || w.tick - c.lastReflectionAt < 36) return;
  const fresh = n.memories.filter(m => !c.consideredMemoryIds.includes(m.id));
  if (fresh.reduce((sum, m) => sum + m.importance, 0) < 180) return;
  // Every input was personally retained; rumor causes and private third-party events never enter synthesis.
  const grounded = fresh.filter(m => { const e = eventById(w, m.sourceEventId); return e?.participants.includes(n.id) && (e.kind !== 'gathering' || e.data.phase === 'completed'); });
  const groups = reflectionRules.map(rule => ({ rule, memories: grounded.filter(m => rule.kinds.includes(eventById(w, m.sourceEventId)!.kind)) }))
    .filter(g => new Set(g.memories.map(m => m.sourceEventId)).size >= 2)
    .sort((a, b) => b.memories.reduce((s, m) => s + m.importance, 0) - a.memories.reduce((s, m) => s + m.importance, 0));
  c.consideredMemoryIds = n.memories.map(m => m.id); c.lastReflectionAt = w.tick;
  const group = groups[0]; if (!group) return;
  const evidence = [...new Set(retrieveMemories(group.memories, w.tick, {}, 4).map(r => r.memory.sourceEventId))];
  const event = appendEvent(w, { kind: 'memory', actorId: n.id, importance: 40, causeId: evidence[0],
    description: `${n.identity.name}의 성찰: ${group.rule.text}`, data: { cognition: 'reflection', model: 'rules', goal: group.rule.goal, evidence } });
  c.reflections.push({ eventId: event.id, tick: w.tick, goal: group.rule.goal, text: group.rule.text, evidence });
  c.reflections = c.reflections.slice(-8);
}
export function urgentNeed(n: NPC): DailyPlan['interruption'] {
  if (n.needs.thirst > 90) return 'thirst';
  if (n.needs.hunger > 88) return 'hunger';
  if (n.needs.fatigue > 94) return 'fatigue';
  if (n.needs.health < 35) return 'health';
  return undefined;
}
const interruptionLabels = { hunger: '배고픔', thirst: '갈증', fatigue: '피로', health: '건강 악화' };
export function preparePlan(w: WorldState, n: NPC): DailyPlan {
  reflect(w, n);
  const c = cognition(n), previous = c.plan, day = Math.floor(w.tick / TICKS_PER_DAY);
  const recent = c.reflections.filter(r => w.tick - r.tick <= 7 * TICKS_PER_DAY).at(-1);
  // The newest grounded preference guides this day without replacing stored model goals.
  const goal = n.goals.at(-1), focus = recent && (!goal || recent.tick > goal.createdAt) ? recent.goal : goal?.kind;
  const signature = `${n.occupation}:${n.homeId}:${goal?.id ?? ''}:${recent?.eventId ?? ''}`;
  const interruption = urgentNeed(n);
  if (!previous || previous.day !== day || previous.signature !== signature || previous.interruption !== interruption) {
    const reason = interruption ? `${interruptionLabels[interruption]} 때문에 당장의 필요를 먼저 해결한다.`
      : previous?.interruption ? '급한 필요를 해결하여 하루 계획으로 돌아간다.'
      : previous?.day === day ? '새 목표·성찰 또는 생활 터전의 변화에 맞춰 남은 하루를 조정한다.' : '새 하루의 생활 리듬과 기억을 바탕으로 계획한다.';
    c.plan = { day, updatedAt: w.tick, revision: previous?.day === day ? previous.revision + 1 : 1, signature, reason,
      blocks: [{ start: 0, end: 30, intent: 'rest' }, { start: 30, end: 54, intent: 'sustain' }, { start: 54, end: 96, intent: 'work' }, { start: 96, end: 126, intent: 'connect' }, { start: 126, end: 144, intent: 'rest' }],
      ...(focus ? { focus } : {}), evidence: [...new Set([...(goal?.sourceEventId ? [goal.sourceEventId] : []), ...(recent ? [recent.eventId] : [])])], ...(interruption ? { interruption } : {}) };
  }
  return c.plan!;
}
const intentActions: Record<PlanIntent, Candidate['kind'][]> = {
  rest: ['Sleep', 'Idle'], sustain: ['Eat', 'Drink', 'Wash', 'TakeItem', 'Gather'], work: ['Work', 'Gather', 'Trade', 'StoreItem'], connect: ['Talk', 'Share', 'Repay'],
};
const goalActions: Record<GoalKind, Candidate['kind'][]> = {
  secure_food: ['Gather', 'TakeItem', 'Trade'], help_neighbor: ['Share', 'Repay'], earn_wealth: ['Work', 'Trade'],
  expand_farm: ['Work'], secure_storage: ['Work'], build_home: ['Work'], make_friend: ['Talk'],
};
function matchesFocus(w: WorldState, option: Candidate, focus?: GoalKind) {
  if (!focus || !goalActions[focus].includes(option.kind)) return false;
  if (['expand_farm', 'secure_storage', 'build_home'].includes(focus)) return option.targetId?.endsWith(`:${focus}`) ?? false;
  if (focus === 'earn_wealth' && option.kind === 'Trade') return option.targetId === 'sell';
  if (focus === 'secure_food') {
    if (option.kind === 'Gather') return w.resources.some(r => r.id === option.targetId && r.kind === 'food');
    if (option.kind === 'Trade') return option.targetId === 'buy' || option.targetId?.startsWith('peer:') || ['goods:meals', 'goods:vegetables', 'goods:fruit', 'goods:bread', 'goods:cheese', 'goods:stew', 'goods:dried_fish'].includes(option.targetId ?? '');
  }
  return true;
}
/** Adds a small preference only to feasible utility candidates; never invents an action or resource. */
export function applyPlan(w: WorldState, n: NPC, options: Candidate[]) {
  const plan = preparePlan(w, n);
  const query = { types: (plan.focus === 'secure_food' || plan.focus === 'earn_wealth' ? ['economic'] : ['social']) as NPC['memories'][number]['type'][] };
  const hits = retrieveMemories(n.memories, w.tick, query);
  cognition(n).retrieval = { tick: w.tick, items: hits.map(h => ({ eventId: h.memory.sourceEventId, score: h.score, recency: h.recency, importance: h.importance, relevance: h.relevance })) };
  for (const h of hits) h.memory.lastRetrievedAt = w.tick;
  const intent = plan.blocks.find(b => w.tick % TICKS_PER_DAY >= b.start && w.tick % TICKS_PER_DAY < b.end)!.intent;
  for (const option of options) {
    if (plan.interruption) {
      const urgent = plan.interruption === 'thirst' ? option.kind === 'Drink' : plan.interruption === 'hunger'
        ? (n.inventory.food > 0 ? option.kind === 'Eat' : option.kind === 'Borrow' || matchesFocus(w, option, 'secure_food'))
        : ['Sleep', 'Eat', 'Drink'].includes(option.kind);
      if (urgent) { option.score += 35; option.reason += ` · ${plan.reason}`; }
      continue;
    }
    const householdPurchase = option.kind === 'Trade' && option.targetId?.startsWith('goods:');
    const scheduled = householdPurchase ? intent === 'sustain' : intentActions[intent].includes(option.kind);
    const focused = matchesFocus(w, option, plan.focus);
    if (!scheduled && !focused) continue;
    option.score += (scheduled ? 3 : 0) + (focused ? 2 : 0);
    option.reason += ` · 하루 계획: ${PLAN_LABELS[intent]}${focused ? ` / ${GOAL_LABELS[plan.focus!]}` : ''}`;
    option.evidence = [...new Set([...(option.evidence ?? []), ...plan.evidence])].slice(0, 12);
  }
}
