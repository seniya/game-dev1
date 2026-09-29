import { z } from 'zod';
import { GOAL_KINDS, type WorldState, type Interpretation } from './types';
import { walkable } from './pathfinding';
import { distance } from './random';

const natural = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1).max(100);
const description = z.string().max(2000);
const score = z.number().min(0).max(100);
const pos = z.object({ x: natural.max(127), y: natural.max(127) }).strict();
const resources = z.object({ food: natural, wood: natural }).strict();
const goalKind = z.enum(GOAL_KINDS as [typeof GOAL_KINDS[number], ...typeof GOAL_KINDS[number][]]);
const actionKind = z.enum(['Idle', 'Move', 'Sleep', 'Eat', 'Drink', 'Gather', 'Work', 'Talk', 'StoreItem', 'TakeItem', 'Share', 'Theft', 'Trade', 'Borrow', 'Repay']);
const candidate = z.object({ kind: actionKind, score: z.number().finite(), reason: description, target: pos, targetId: id.optional() }).strict();
const action = candidate.extend({ path: z.array(pos).max(16384), progress: natural, duration: natural.min(1).max(100) }).strict();
const relationship = z.object({ npcId: id, familiarity: score, trust: score, affection: score, fear: score, resentment: score, respect: score, family: z.boolean(), interpretation: description, evidence: z.array(id) }).strict();
const memory = z.object({ id, type: z.enum(['personal', 'social', 'event', 'economic', 'trauma', 'achievement']), description, importance: score, emotionalImpact: z.number().min(-100).max(100), createdAt: natural, relatedNpcIds: z.array(id), relatedLocationIds: z.array(id), sourceEventId: id, repetitions: natural.min(1) }).strict();
const npc = z.object({
  id, identity: z.object({ name: z.string().min(1).max(80), age: natural.max(150) }).strict(), position: pos, homeId: id,
  occupation: z.enum(['farmer', 'gatherer', 'woodcutter', 'carpenter', 'merchant']), alive: z.boolean(),
  needs: z.object({ hunger: score, thirst: score, fatigue: score, health: score, safety: score, social: score }).strict(),
  personality: z.object({ diligence: score, greed: score, sociability: score, aggression: score, empathy: score, curiosity: score }).strict(),
  inventory: resources, wealth: natural, relationships: z.array(relationship).max(100), memories: z.array(memory).max(40),
  goals: z.array(z.object({ id, kind: goalKind, reason: description, createdAt: natural, sourceEventId: id.optional() }).strict()).max(4),
  currentAction: action.optional(), decision: z.object({ reason: description, candidates: z.array(candidate).max(6), tick: natural }).strict(), dailyTaken: natural.max(3), lastTalk: z.number().int().min(-1000), knownRumors: z.array(id),
}).strict();
const event = z.object({ id, tick: natural, kind: z.enum(['arrival', 'production', 'consumption', 'storage', 'trade', 'loan', 'repayment', 'default', 'share', 'theft', 'witness', 'rumor', 'talk', 'scarcity', 'health', 'death', 'weather', 'relationship', 'memory', 'goal', 'llm', 'experiment', 'failure', 'project']), actorId: id.optional(), targetId: id.optional(), locationId: id.optional(), participants: z.array(id).max(100), importance: score, description, causeId: id.optional(), data: z.record(z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.array(id)])) }).strict();
const world = z.object({
  version: z.literal(1), seed: natural.max(4294967295), rng: natural.min(1).max(4294967295), tick: natural, nextId: natural.min(1), width: natural.min(8).max(128), height: natural.min(8).max(128),
  tiles: z.array(z.enum(['grass', 'water', 'path', 'forest', 'rock', 'farm'])).max(16384),
  buildings: z.array(z.object({ id, kind: z.enum(['home', 'storage', 'farm', 'market', 'well']), name: description, position: pos, level: natural.min(1).max(4), growth: z.number().min(0).max(120) }).strict()).max(1000),
  resources: z.array(z.object({ id, position: pos, kind: z.enum(['food', 'wood']), amount: natural, capacity: natural.min(1) }).strict()).max(1000),
  npcs: z.array(npc).min(10).max(100), storage: resources, market: resources.extend({ coins: natural, foodPrice: natural.min(1), woodPrice: natural.min(1) }).strict(),
  weather: z.enum(['sunny', 'rain', 'cloudy', 'drought']), droughtUntil: natural,
  events: z.array(event).max(1000000), loans: z.array(z.object({ id, lenderId: id, borrowerId: id, amount: natural.min(1), due: natural, status: z.enum(['active', 'repaid', 'defaulted']), sourceEventId: id }).strict()),
  llm: z.object({ enabled: z.boolean(), queue: z.array(z.object({ id, npcId: id, eventId: id, tick: natural, attempts: natural.max(2) }).strict()).max(24), gateKeys: z.array(z.string().max(150)).max(12), dailyByNpc: z.record(natural.max(2)), dailyTotal: natural.max(12), requested: natural, completed: natural, rejected: natural, failed: natural }).strict(),
  stats: z.object({ foodSum: z.number().finite().nonnegative(), samples: natural, deaths: natural.max(100), thefts: natural, shares: natural, conflicts: natural }).strict(),
}).strict();

export function validateSave(input: unknown): WorldState {
  const parsed = world.safeParse(input);
  if (!parsed.success) throw new Error(`저장 파일 형식 오류: ${parsed.error.issues[0].path.join('.')} (${parsed.error.issues[0].message})`);
  const w = parsed.data as WorldState;
  const ensure = (condition: unknown, message: string) => { if (!condition) throw new Error(`저장 파일 무결성 오류: ${message}`); };
  ensure(w.tiles.length === w.width * w.height, '지도 크기');
  const ids = new Set<string>(), events = new Map(w.events.map(e => [e.id, e])), npcs = new Set(w.npcs.map(n => n.id)), buildings = new Map(w.buildings.map(b => [b.id, b]));
  const register = (value: string) => { ensure(!ids.has(value), `중복 ID ${value}`); ids.add(value); if (/^[emqlg]\d+$/.test(value)) ensure(Number(value.slice(1)) < w.nextId, '다음 ID'); };
  [...w.buildings, ...w.resources, ...w.npcs, ...w.events, ...w.loans, ...w.llm.queue].forEach(v => register(v.id));
  for (const b of w.buildings) ensure(walkable(w, b.position), '건물 위치');
  for (const kind of ['farm', 'storage', 'market', 'well', 'home']) ensure(w.buildings.some(b => b.kind === kind), `필수 건물 ${kind}`);
  for (const r of w.resources) { ensure(walkable(w, r.position), '자원 위치'); ensure(r.amount <= r.capacity, '자원 용량'); }
  let lastTick = 0; const seenEvents = new Set<string>();
  for (const e of w.events) {
    ensure(e.tick >= lastTick && e.tick <= w.tick, '사건 시간'); lastTick = e.tick;
    ensure(!e.causeId || seenEvents.has(e.causeId), '사건 원인'); seenEvents.add(e.id);
    ensure(!e.actorId || npcs.has(e.actorId), '사건 행위자'); ensure(!e.targetId || npcs.has(e.targetId), '사건 대상');
    ensure(!e.locationId || buildings.has(e.locationId), '사건 위치'); ensure(e.participants.every(n => npcs.has(n)), '사건 참여자');
  }
  for (const n of w.npcs) {
    ensure(walkable(w, n.position) && buildings.get(n.homeId)?.kind === 'home', '주민 위치/집');
    ensure(n.alive === (n.needs.health > 0), '생존 상태'); ensure(n.alive || !n.currentAction, '사망 주민 행동');
    ensure(n.decision.tick <= w.tick && n.lastTalk <= w.tick, '판단 시간');
    ensure(new Set(n.relationships.map(r => r.npcId)).size === n.relationships.length, '중복 관계');
    for (const r of n.relationships) ensure(r.npcId !== n.id && npcs.has(r.npcId) && r.evidence.every(e => events.has(e)), '관계 대상/출처');
    for (const m of n.memories) { register(m.id); ensure(events.has(m.sourceEventId) && m.createdAt <= w.tick && m.relatedNpcIds.every(id => npcs.has(id)) && m.relatedLocationIds.every(id => buildings.has(id)), '기억 출처'); }
    for (const g of n.goals) { register(g.id); ensure(g.createdAt <= w.tick && (!g.sourceEventId || events.has(g.sourceEventId)), '목표 출처'); }
    ensure(n.knownRumors.every(id => events.get(id)?.kind === 'witness'), '소문 출처');
    if (n.currentAction) {
      const a = n.currentAction; let previous = n.position;
      for (const p of a.path) { ensure(walkable(w, p) && distance(previous, p) === 1, '이동 경로'); previous = p; }
      ensure(distance(previous, a.target) === 0 && walkable(w, a.target) && a.progress < a.duration, '행동 진행');
      const buildingKinds: Partial<Record<typeof a.kind, string>> = { Sleep: 'home', Drink: 'well', StoreItem: 'storage', TakeItem: 'storage', Theft: 'storage', Trade: 'market' };
      if (buildingKinds[a.kind]) ensure(w.buildings.some(b => b.kind === buildingKinds[a.kind] && distance(b.position, a.target) === 0), '행동 건물');
      if (a.kind === 'Gather') ensure(w.resources.some(r => r.id === a.targetId && distance(r.position, a.target) === 0), '채집 대상');
      if (a.kind === 'Work') ensure(w.buildings.some(b => b.id === a.targetId?.split(':')[0] && distance(b.position, a.target) === 0), '작업 대상');
      if (['Share', 'Talk', 'Borrow'].includes(a.kind)) ensure(a.targetId && a.targetId !== n.id && npcs.has(a.targetId), '사회 행동 대상');
      if (a.kind === 'Repay') ensure(w.loans.some(l => l.id === a.targetId && l.borrowerId === n.id), '상환 대상');
      if (a.kind === 'Trade') ensure(a.targetId === 'buy' || a.targetId === 'sell', '거래 유형');
    }
  }
  for (const l of w.loans) ensure(l.borrowerId !== l.lenderId && npcs.has(l.borrowerId) && npcs.has(l.lenderId) && events.has(l.sourceEventId), '대여 계약');
  for (const q of w.llm.queue) ensure(npcs.has(q.npcId) && events.get(q.eventId)?.participants.includes(q.npcId) && q.tick <= w.tick, 'LLM 요청 출처');
  ensure(Object.keys(w.llm.dailyByNpc).every(id => npcs.has(id)), 'LLM 예산 주민');
  // Keep the original property order so a save/load round trip is byte-identical.
  // The strict schema above has validated every field without coercion or defaults.
  return structuredClone(input) as WorldState;
}

const interpretation = z.object({
  newGoals: z.array(z.object({ kind: goalKind, reason: z.string().min(1).max(300) }).strict()).max(2),
  interpretation: z.string().min(1).max(600),
  relationshipInterpretations: z.array(z.object({ npcId: id, meaning: z.string().min(1).max(300) }).strict()).max(4),
}).strict();
export function validateInterpretation(input: unknown): Interpretation | null { const result = interpretation.safeParse(input); return result.success ? result.data : null; }
