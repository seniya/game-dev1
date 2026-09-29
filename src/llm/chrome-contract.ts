import { z } from 'zod';
import { GOAL_KINDS, type GoalKind, type NPC, type WorldEvent, type WorldState, type Interpretation } from '../sim/types';

export const CHROME_CONTEXT_VERSION = 1;
export const CHROME_CONTEXT_LIMIT = 12_000;
export const CHROME_OUTPUT_LIMIT = 2_000;
export const CHROME_TIMEOUT_MS = 60_000;
export const CHROME_LEASE_MS = 90_000;
export const CHROME_DAILY_LIMIT = 36;
export const CHROME_HOURLY_LIMIT = 6;
export const CHROME_COLLECT_MS = 60_000;
export const CHROME_REST_MS = 60_000;
export const CHROME_MODEL = 'chrome-built-in';
const reasons = {
  food_security: '식량 부족의 경험을 바탕으로 먹을 것을 준비하려 한다.',
  mutual_help: '식량을 나눈 경험을 바탕으로 이웃과 협력하려 한다.',
  protect_storage: '절도에 관한 경험을 바탕으로 공동 자원을 보호하려 한다.',
  repay_obligation: '빚과 상환의 경험을 바탕으로 생활의 여유를 마련하려 한다.',
  recover_health: '건강과 생존의 경험을 바탕으로 생활을 돌보려 한다.',
  improve_facilities: '시설을 개선한 경험을 바탕으로 생활 기반을 정비하려 한다.',
} as const;
export type ReasonCode = keyof typeof reasons;
const rules: Record<ReasonCode, { events: string[]; goals: GoalKind[] }> = {
  food_security: { events: ['scarcity'], goals: ['secure_food', 'expand_farm'] },
  mutual_help: { events: ['share'], goals: ['help_neighbor', 'make_friend', 'secure_food'] },
  protect_storage: { events: ['theft', 'witness', 'rumor'], goals: ['secure_storage', 'make_friend'] },
  repay_obligation: { events: ['default', 'loan', 'repayment'], goals: ['earn_wealth', 'secure_food', 'help_neighbor'] },
  recover_health: { events: ['health', 'death'], goals: ['secure_food', 'build_home', 'help_neighbor'] },
  improve_facilities: { events: ['project'], goals: ['expand_farm', 'secure_storage', 'build_home'] },
};
const descriptions: Record<string, string> = {
  scarcity: 'A resident experienced food shortage.', share: 'Food was shared between residents.',
  theft: 'A resident took communal food beyond the withdrawal limit.', witness: 'A resident directly witnessed food theft.',
  rumor: 'A resident heard a report of alleged theft. This is hearsay, not verified fact.',
  default: 'A food debt was not repaid by its deadline.', loan: 'Food was lent between residents.',
  repayment: 'A resident repaid food debt.', health: 'A resident experienced declining health.',
  death: 'A nearby resident died from insufficient survival resources.', project: 'A resident improved a building.',
};
export interface ChromeFact {
  id: string; kind: string; tick: number; knowledge: 'experienced' | 'witnessed' | 'hearsay';
  description: string; roles: { actor?: string; target?: string; reportedSuspect?: string };
  quantities: Record<string, number>;
}
export interface ChromeContext {
  version: 1; npcId: string; tick: number; trigger: ChromeFact; memories: ChromeFact[];
  allowedGoals: GoalKind[]; choices: { reasonCode: ReasonCode; kinds: GoalKind[]; evidence: string[] }[];
  related?: ChromeFact[];
}
// Only explicit rule mappings are exported. Never copy descriptions, data bags, causal ancestors or other residents' memories.
function fact(event: WorldEvent, npc: NPC): ChromeFact | null {
  if (!descriptions[event.kind] || !event.participants.includes(npc.id)) return null;
  const roles: ChromeFact['roles'] = {};
  if (event.actorId) roles.actor = event.actorId;
  if (event.targetId) roles.target = event.targetId;
  if (event.kind === 'rumor' && typeof event.data.suspectId === 'string') roles.reportedSuspect = event.data.suspectId;
  const quantities: Record<string, number> = {};
  const keys = event.kind === 'project' ? ['woodCost', 'level'] : ['share', 'theft', 'loan', 'repayment'].includes(event.kind) ? ['amount', 'remaining'] : [];
  for (const key of keys) if (typeof event.data[key] === 'number' && Number.isFinite(event.data[key])) quantities[key] = event.data[key];
  return { id: event.id, kind: event.kind, tick: event.tick, knowledge: event.kind === 'rumor' ? 'hearsay' : event.kind === 'witness' && event.actorId === npc.id || event.kind === 'death' ? 'witnessed' : 'experienced', description: descriptions[event.kind], roles, quantities };
}
export function chromeContext(world: WorldState, requestId: string, relatedIds: string[] = []): ChromeContext | null {
  const request = world.llm.queue.find(q => q.id === requestId), npc = world.npcs.find(n => n.id === request?.npcId);
  const event = world.events.find(e => e.id === request?.eventId);
  if (!npc?.alive || !event) return null;
  const trigger = fact(event, npc); if (!trigger) return null;
  const known = new Set(npc.memories.map(m => m.sourceEventId));
  const related = world.events.filter(e => relatedIds.includes(e.id) && known.has(e.id) && e.id !== trigger.id).slice(-2).map(e => fact(e, npc)).filter((e): e is ChromeFact => !!e);
  const memories = world.events.filter(e => known.has(e.id) && e.id !== trigger.id && !related.some(r => r.id === e.id)).slice(-(8 - related.length)).map(e => fact(e, npc)).filter((e): e is ChromeFact => !!e);
  const facts = [trigger, ...related, ...memories];
  const choices = (Object.keys(rules) as ReasonCode[]).filter(code => rules[code].events.includes(trigger.kind)).map(reasonCode => ({ reasonCode, kinds: rules[reasonCode].goals, evidence: facts.filter(e => rules[reasonCode].events.includes(e.kind)).map(e => e.id) }));
  const context: ChromeContext = { version: 1, npcId: npc.id, tick: world.tick, trigger, memories, allowedGoals: [...GOAL_KINDS], choices, ...(related.length ? { related } : {}) };
  // Imported arbitrary identifiers must not smuggle prose/instructions into the English contract.
  if (facts.some(f => !/^[a-zA-Z0-9_-]{1,100}$/.test(f.id) || Object.values(f.roles).some(id => !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) || !/^[a-zA-Z0-9_-]{1,100}$/.test(npc.id)) return null;
  return choices.length && JSON.stringify(context).length <= CHROME_CONTEXT_LIMIT ? context : null;
}
const goalSchema = z.object({ kind: z.enum(GOAL_KINDS as [GoalKind, ...GoalKind[]]), reasonCode: z.enum(Object.keys(reasons) as [ReasonCode, ...ReasonCode[]]), evidence: z.array(z.string().max(100)).min(1).max(4) }).strict();
export const chromeResponseSchema = z.object({ goals: z.array(goalSchema).min(1).max(2) }).strict();
export type ChromeResult = z.infer<typeof chromeResponseSchema>;
export class ChromeValidationError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function validateChromeResult(raw: string, context: ChromeContext): ChromeResult {
  const fail = (code: string): never => { throw new ChromeValidationError(code); };
  if (raw.length > CHROME_OUTPUT_LIMIT) fail('output_too_large');
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { fail('invalid_json'); }
  const checked = chromeResponseSchema.safeParse(parsed);
  if (!checked.success) return fail('invalid_shape');
  const value = checked.data;
  if (new Set(value.goals.map(g => g.kind)).size !== value.goals.length) fail('duplicate_goal');
  for (const goal of value.goals) {
    const choice = context.choices.find(c => c.reasonCode === goal.reasonCode);
    if (!choice || !context.allowedGoals.includes(goal.kind) || !choice.kinds.includes(goal.kind)) fail('invalid_goal_reason');
    if (!goal.evidence.includes(context.trigger.id)) fail('missing_trigger');
    if (new Set(goal.evidence).size !== goal.evidence.length) fail('duplicate_evidence');
    if (goal.evidence.some(id => !choice!.evidence.includes(id))) fail('unknown_evidence');
  }
  return value;
}
export function renderChromeResult(result: ChromeResult, context: ChromeContext): Interpretation {
  return { newGoals: result.goals.map(g => ({ kind: g.kind, reason: `${context.trigger.knowledge === 'hearsay' ? '확인되지 않은 소문을 들었다. ' : ''}${reasons[g.reasonCode]} (근거: ${g.evidence.join(', ')})` })), interpretation: 'Chrome AI가 제안한 목표 · 한국어 이유는 서버가 근거와 코드로 구성했습니다.', relationshipInterpretations: [] };
}
export function chromeCandidates(context: ChromeContext): ChromeResult[] {
  // Each complete candidate satisfies the same cross-field rules as server validation.
  return context.choices.flatMap(choice => choice.kinds.filter(kind => context.allowedGoals.includes(kind)).map(kind => ({ goals: [{ kind, reasonCode: choice.reasonCode, evidence: [context.trigger.id, ...(context.related ?? []).map(e => e.id).filter(id => choice.evidence.includes(id))] }] })));
}
export function chromeResponseConstraint(context: ChromeContext) {
  return { type: 'object', enum: chromeCandidates(context) };
}

export function chromeGoalUseful(world: WorldState, npc: NPC, kind: GoalKind): boolean {
  if (!npc.alive || npc.goals.some(g => g.kind === kind)) return false;
  const building = kind === 'build_home' ? world.buildings.find(b => b.id === npc.homeId) : world.buildings.find(b => b.kind === (kind === 'expand_farm' ? 'farm' : 'storage'));
  if (['build_home', 'expand_farm', 'secure_storage'].includes(kind) && (!building || building.level >= 4)) return false;
  return true;
}
export function relevantChromeContext(world: WorldState, context: ChromeContext): ChromeContext {
  const npc = world.npcs.find(n => n.id === context.npcId);
  if (!npc) return { ...context, allowedGoals: [], choices: [] };
  const topic = context.choices[0]?.reasonCode;
  const resolved = topic === 'food_security' && npc.inventory.food >= 2 && npc.needs.hunger < 65
    || topic === 'recover_health' && context.trigger.kind !== 'death' && npc.needs.health >= 70
    || topic === 'repay_obligation' && !world.loans.some(l => l.status !== 'repaid' && (l.lenderId === npc.id || l.borrowerId === npc.id));
  const choices = resolved ? [] : context.choices.map(c => ({ ...c, kinds: c.kinds.filter(kind => chromeGoalUseful(world, npc, kind)) })).filter(c => c.kinds.length);
  return { ...context, choices, allowedGoals: [...new Set(choices.flatMap(c => c.kinds))] };
}
export interface ChromeLease { id: string; epoch: string; generation: string; hash: string; version: 1; token: string; expires: number; context: ChromeContext }
