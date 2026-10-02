import { apprenticeshipSchema, supportSchema, validateLegacy } from './legacy-learning';
import { ambitionSchema } from './ambition';
import { cooperationSchema, validateCooperation } from './cooperation';
import { agricultureSchema, validateAgriculture } from './agriculture';
import { constructionSchema, validateConstruction } from './construction';
import { frontierSchema, validateFrontier } from './frontier';
import { gatheringsSchema, validateGatherings } from './gatherings-validation';
import { requestsSchema, emptyRequests } from './requests-types';
import { cognitionSchema, validateCognition } from './cognition-validation';
import { validateRequests } from './requests-validation';
import { migrateResources } from './employment';
import { OCCUPATIONS, type Occupation } from './types';
import { livingSchema } from './living-types';
import { migrateLiving, CONSUMABLES } from './living';
import { profileSchema } from './character-schema';
import { initializeHeritage } from './heritage';
import { heritageSchema, validateHeritage } from './heritage-validation';
import { initializeUrban } from './urban';
import { urbanSchema, validateUrban } from './urban-validation';
import { initializeCivilization } from './civilization';
import { z } from 'zod';
import { GOAL_KINDS, type WorldState, type Interpretation } from './types';
import { walkable } from './pathfinding';
import { createEconomy, balance } from './economy';
import { distance } from './random';

const natural = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().min(1).max(100);
const description = z.string().max(2000);
const score = z.number().min(0).max(100);
const pos = z.object({ x: natural.max(191), y: natural.max(191) }).strict();
const resources = z.object({ food: natural, wood: natural }).strict();
const goalKind = z.enum(GOAL_KINDS as [typeof GOAL_KINDS[number], ...typeof GOAL_KINDS[number][]]);
const actionKind = z.enum(['Attend', 'Wash', 'Idle', 'Move', 'Sleep', 'Eat', 'Drink', 'Gather', 'Work', 'Talk', 'StoreItem', 'TakeItem', 'Share', 'Theft', 'Trade', 'Borrow', 'Repay']);
const candidate = z.object({ kind: actionKind, score: z.number().finite(), reason: description, target: pos, targetId: id.optional(), evidence: z.array(id).max(12).optional() }).strict();
const action = candidate.extend({ path: z.array(pos).max(16384), progress: natural, duration: natural.min(1).max(100) }).strict();
const relationship = z.object({ turn: z.object({ stage: z.enum(['ordinary','close','conflict']), lastTick: natural }).strict().optional(), npcId: id, familiarity: score, trust: score, affection: score, fear: score, resentment: score, respect: score, family: z.boolean(), interpretation: description, evidence: z.array(id) }).strict();
const memory = z.object({ id, type: z.enum(['personal', 'social', 'event', 'economic', 'trauma', 'achievement']), description, importance: score, emotionalImpact: z.number().min(-100).max(100), createdAt: natural, lastRetrievedAt: natural.optional(), relatedNpcIds: z.array(id), relatedLocationIds: z.array(id), sourceEventId: id, repetitions: natural.min(1) }).strict();
const npc = z.object({
  cognition: cognitionSchema.optional(),
  profile: profileSchema.optional(),
  id, identity: z.object({ name: z.string().min(1).max(80), age: natural.max(150) }).strict(), position: pos, homeId: id,
  settlementId: id, life: z.object({ apprenticeship:apprenticeshipSchema.optional(), support:supportSchema.optional(), ambition: ambitionSchema.optional(), bornTick: z.number().int().min(-300000).max(Number.MAX_SAFE_INTEGER), parentIds: z.array(id).max(2), partnerId: id.optional(), generation: natural.max(1000), skill: score, lastBirth: natural, lastMove: natural, deathTick: natural.optional(), birthEventId: id.optional(), deathEventId: id.optional(), estateSettled: z.boolean() }).strict(),
  previousOccupation: z.enum(Object.keys(OCCUPATIONS) as [Occupation, ...Occupation[]]).optional(),
  occupation: z.enum(Object.keys(OCCUPATIONS) as [Occupation, ...Occupation[]]), alive: z.boolean(),
  needs: z.object({ hunger: score, thirst: score, fatigue: score, health: score, safety: score, social: score }).strict(),
  personality: z.object({ diligence: score, greed: score, sociability: score, aggression: score, empathy: score, curiosity: score }).strict(),
  inventory: resources, wealth: natural, relationships: z.array(relationship).max(30000), memories: z.array(memory).max(40),
  goals: z.array(z.object({ id, kind: goalKind, reason: description, createdAt: natural, sourceEventId: id.optional() }).strict()).max(4),
  currentAction: action.optional(), decision: z.object({ reason: description, candidates: z.array(candidate).max(6), tick: natural }).strict(), dailyTaken: natural.max(3), lastTalk: z.number().int().min(-1000), knownRumors: z.array(id),
}).strict();
const event = z.object({ id, tick: natural, kind: z.enum(['arrival', 'production', 'consumption', 'storage', 'trade', 'loan', 'repayment', 'default', 'share', 'theft', 'witness', 'rumor', 'talk', 'scarcity', 'health', 'death', 'weather', 'relationship', 'memory', 'goal', 'llm', 'experiment', 'failure', 'project', 'wage', 'price', 'family', 'birth', 'coming_of_age', 'inheritance', 'education', 'construction', 'settlement', 'migration', 'caravan', 'occupation', 'industry', 'public_service', 'tax', 'urban', 'policy', 'freight', 'ecology', 'council', 'diplomacy', 'request', 'gathering']), actorId: id.optional(), targetId: id.optional(), locationId: id.optional(), participants: z.array(id).max(30000), importance: score, description, causeId: id.optional(), data: z.record(z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.array(id)])) }).strict();
const flow = z.object({ producedFood: natural, producedWood: natural, consumedFood: natural, investedWood: natural, externalFood: natural, trades: natural, tradeVolume: natural, wages: natural }).strict();
const economy = z.object({ arrivals: resources.extend({ coins: natural }).strict().optional(), since: natural, openingFood: natural, openingWood: natural, openingCoins: natural, totals: flow,
  last: flow.extend({ shares: natural, conflicts: natural }).strict(),
  daily: z.array(flow.extend({ day: natural.min(1), tick: natural, population: natural.max(3000), food: natural, storageFood: natural, foodPrice: natural.min(1).max(12), coins: natural, poorest: natural, median: z.number().finite().nonnegative(), richest: natural, shares: natural, conflicts: natural, eventId: id }).strict()).max(10000)
}).strict();
const world = z.object({
  frontier: frontierSchema.optional(),
  cooperation:cooperationSchema.optional(),
  construction:constructionSchema.optional(),
  agriculture:agricultureSchema.optional(),
  gatherings: gatheringsSchema.optional(),
  version: z.literal(9), observation: z.object({ watchIds: z.array(z.string().min(1).max(100)).max(12) }).strict(), requests: requestsSchema, living: livingSchema, heritage: heritageSchema, urban: urbanSchema, seed: natural.max(4294967295), rng: natural.min(1).max(4294967295), tick: natural, nextId: natural.min(1), width: natural.min(8).max(192), height: natural.min(8).max(128),
  tiles: z.array(z.enum(['grass', 'water', 'path', 'forest', 'rock', 'farm'])).max(24576),
  buildings: z.array(z.object({ id, kind: z.enum(['home', 'storage', 'farm', 'market', 'well']), name: description, position: pos, level: natural.min(1).max(4), growth: z.number().min(0).max(120), settlementId: id, ownerIds: z.array(id).max(30000).optional() }).strict()).max(4000),
  resources: z.array(z.object({ id, position: pos, kind: z.enum(['food', 'wood']), amount: natural, capacity: natural.min(1) }).strict()).max(1000),
  npcs: z.array(npc).min(10).max(30000), storage: resources, market: resources.extend({ coins: natural, foodPrice: natural.min(1).max(12), woodPrice: natural.min(1).max(3) }).strict(),
  weather: z.enum(['sunny', 'rain', 'cloudy', 'drought']), droughtUntil: natural,
  civilization: z.object({ settlements: z.array(z.object({ id, name: description, center: pos, foundedAt: natural, sourceEventId: id.optional(), storage: resources, market: resources.extend({ coins: natural, foodPrice: natural.min(1).max(12), woodPrice: natural.min(1).max(3) }).strict() }).strict()).min(1).max(12), journeys: z.array(z.object({ id, kind: z.enum(['migration', 'trade']), from: id, to: id, npcIds: z.array(id).max(3000), path: z.array(pos).max(16384), progress: natural, food: natural, coins: natural, sourceEventId: id, homeId: id.optional() }).strict()).max(1000), focus: id, detail: z.enum(['full', 'focused']) }).strict(),
  economy, events: z.array(event).max(1000000), loans: z.array(z.object({ id, lenderId: id, borrowerId: id, amount: natural.min(1), remaining: natural, due: natural, status: z.enum(['active', 'repaid', 'defaulted']), sourceEventId: id }).strict()),
  llm: z.object({ enabled: z.boolean(), queue: z.array(z.object({ id, npcId: id, eventId: id, tick: natural, attempts: natural.max(2) }).strict()).max(24), gateKeys: z.array(z.string().max(150)).max(12), dailyByNpc: z.record(natural.max(2)), dailyTotal: natural.max(12), requested: natural, completed: natural, rejected: natural, failed: natural }).strict(),
  stats: z.object({ foodSum: z.number().finite().nonnegative(), samples: natural, deaths: natural.max(30000), thefts: natural, shares: natural, conflicts: natural }).strict(),
}).strict();

export function validateSave(input: unknown): WorldState {
  // Version 1 remains readable. Accounting starts at migration; history is not invented.
  if (input && typeof input === 'object' && (input as { version?: number }).version === 1) {
    const legacy = structuredClone(input) as WorldState;
    try {
      (legacy as unknown as { version: number }).version = 2;
      legacy.loans = legacy.loans.map(l => ({ ...l, remaining: l.status === 'repaid' ? 0 : l.amount }));
      legacy.economy = createEconomy(legacy);
      input = legacy;
    } catch { throw new Error('저장 파일 형식 오류: 이전 버전의 세계 데이터가 올바르지 않습니다.'); }
  }
  if (input && typeof input === 'object' && (input as { version?: number }).version === 2) {
    const legacy = structuredClone(input) as WorldState;
    try { initializeCivilization(legacy); (legacy as unknown as { version: number }).version = 3; input = legacy; }
    catch { throw new Error('저장 파일 형식 오류: 이전 세계의 생애·마을 변환에 실패했습니다.'); }
  }
  if (input && typeof input === 'object' && (input as { version?: number }).version === 3) {
    const legacy = structuredClone(input) as WorldState;
    try { initializeUrban(legacy); (legacy as unknown as { version: number }).version = 4; input = legacy; }
    catch { throw new Error('저장 파일 형식 오류: 도시 변환에 실패했습니다.'); }
  }
  if (input && typeof input === 'object' && (input as { version?: number }).version === 4) {
    const legacy = structuredClone(input) as WorldState;
    try { initializeHeritage(legacy); (legacy as unknown as { version: number }).version = 5; input = legacy; }
    catch { throw new Error('저장 파일 형식 오류: 생태·사회 변환에 실패했습니다.'); }
  }
  if (input && typeof input === 'object' && (input as { version?: number }).version === 5) {
    const legacy = structuredClone(input) as WorldState;
    try { migrateLiving(legacy); (legacy as unknown as { version: number }).version = 6; input = legacy; }
    catch { throw new Error('저장 파일 형식 오류: 생활 다양성 변환에 실패했습니다.'); }
  }
  if (input && typeof input === 'object' && (input as { version?: number }).version === 6) {
    const legacy = structuredClone(input) as WorldState;
    try { migrateResources(legacy); (legacy as unknown as { version: number }).version = 7; input = legacy; }
    catch { throw new Error('저장 파일 형식 오류: 자원·고용 상태 변환에 실패했습니다.'); }
  }
  if (input && typeof input === 'object' && (input as { version?: number }).version === 7) {
    const legacy = structuredClone(input) as WorldState;
    (legacy as unknown as { version: number }).version = 8; legacy.requests = emptyRequests(legacy.tick); input = legacy;
  }
  if (input && typeof input === 'object' && (input as { version?: number }).version === 8) {
    const legacy = structuredClone(input) as WorldState;
    if (!Array.isArray(legacy.requests?.items) || legacy.requests.items.some(r => !r || typeof r !== 'object')) throw new Error('저장 파일 형식 오류: 이전 부탁 상태를 읽을 수 없습니다.');
    for (const r of legacy.requests.items) if (r.decisionEventId && r.status !== 'cancelled') { r.followups = []; r.followupSince = legacy.tick; }
    legacy.version = 9; legacy.observation = { watchIds: [] }; input = legacy;
  }
  const parsed = world.safeParse(input);
  if (!parsed.success) throw new Error(`저장 파일 형식 오류: ${parsed.error.issues[0].path.join('.')} (${parsed.error.issues[0].message})`);
  const w = parsed.data as WorldState;
  const ensure = (condition: unknown, message: string) => { if (!condition) throw new Error(`저장 파일 무결성 오류: ${message}`); };
  validateCooperation(w, ensure);
  validateAgriculture(w, ensure);
  validateConstruction(w, ensure);
  validateFrontier(w,ensure);
  ensure(w.tiles.length === w.width * w.height, '지도 크기');
  const ids = new Set<string>(), events = new Map(w.events.map(e => [e.id, e])), npcs = new Set(w.npcs.map(n => n.id)), buildings = new Map(w.buildings.map(b => [b.id, b]));
  const register = (value: string) => { ensure(!ids.has(value), `중복 ID ${value}`); ids.add(value); if (/^[emqlgcj]\d+$/.test(value)) ensure(Number(value.slice(1)) < w.nextId, '다음 ID'); };
  [...w.buildings, ...w.resources, ...w.npcs, ...w.events, ...w.loans, ...w.llm.queue, ...(w.cooperation?.projects??[])].forEach(v => register(v.id));
  ensure(new Set(w.observation.watchIds).size === w.observation.watchIds.length && w.observation.watchIds.every(id => npcs.has(id)), '관심 주민 중복/참조');
  const villages = new Set(w.civilization.settlements.map(v => v.id));
  ensure(villages.size === w.civilization.settlements.length && villages.has('v0') && villages.has(w.civilization.focus), '마을 ID/관찰 대상');
  ensure(w.npcs.filter(n => n.alive).length <= 3000, '생존 인구 상한');
  for (const v of w.civilization.settlements) {
    register(v.id);
    ensure(walkable(w, v.center) && v.foundedAt <= w.tick && (!v.sourceEventId || events.has(v.sourceEventId)), '정착지 위치/출처');
    if (v.id === 'v0') ensure(v.storage.food + v.storage.wood + v.market.food + v.market.wood + v.market.coins === 0, '중앙 재고 중복');
  }
  for (const b of w.buildings) { ensure(walkable(w, b.position) && villages.has(b.settlementId!), '건물 위치/마을'); ensure(!b.ownerIds || new Set(b.ownerIds).size === b.ownerIds.length && b.ownerIds.every(id => npcs.has(id)), '주택 소유권'); }
  const travellers = new Set<string>();
  for (const j of w.civilization.journeys) {
    register(j.id); ensure(villages.has(j.from) && villages.has(j.to) && j.from !== j.to && events.has(j.sourceEventId) && j.progress <= j.path.length, '이동 출처/마을/진행');
    ensure(j.path.every((p, i) => walkable(w, p) && (!i || distance(j.path[i - 1], p) === 1)), '이동 경로');
    for (const id of j.npcIds) { ensure(npcs.has(id) && !travellers.has(id), '이주 주민 중복'); travellers.add(id); }
    if (j.kind === 'migration') {
      const person = w.npcs.find(n => n.id === j.npcIds[0]);
      const target = buildings.get(j.homeId!);
      ensure(person && person.settlementId === j.from && target && (!j.path.length || distance(j.path.at(-1)!, target.position) === 0) && (j.progress === j.path.length || distance(person.position, j.path[j.progress]) === 1), '이주 경로와 현재 위치');
      ensure(j.npcIds.length === 1 && buildings.get(j.homeId!)?.kind === 'home' && buildings.get(j.homeId!)?.settlementId === j.to && j.food === 0 && j.coins === 0, '이주 주택/화물');
    } else ensure(j.npcIds.length === 0 && !j.homeId && j.food > 0 && j.coins > 0, '교역 화물');
  }
  for (const kind of ['farm', 'storage', 'market', 'well', 'home']) ensure(w.buildings.some(b => b.kind === kind), `필수 건물 ${kind}`);
  for (const r of w.resources) { ensure(walkable(w, r.position), '자원 위치'); ensure(r.amount <= r.capacity, '자원 용량'); }
  let lastTick = 0; const seenEvents = new Set<string>();
  for (const e of w.events) {
    ensure(e.tick >= lastTick && e.tick <= w.tick, '사건 시간'); lastTick = e.tick;
    ensure(!e.causeId || seenEvents.has(e.causeId), '사건 원인');
    ensure(!Array.isArray(e.data.evidence) || e.data.evidence.every(id => seenEvents.has(id)), '선택 사건 근거');
    seenEvents.add(e.id);
    ensure(!e.actorId || npcs.has(e.actorId), '사건 행위자'); ensure(!e.targetId || npcs.has(e.targetId), '사건 대상');
    ensure(!e.locationId || buildings.has(e.locationId), '사건 위치'); ensure(e.participants.every(n => npcs.has(n)), '사건 참여자');
  }
  for (const n of w.npcs) {
    validateCognition(w, n, events, ensure);
    if (n.profile) ensure(n.profile.createdAt <= w.tick && events.get(n.profile.arrivalEventId)?.tick === n.profile.createdAt && events.get(n.profile.arrivalEventId)?.actorId === n.id && events.get(n.profile.arrivalEventId)?.kind === 'arrival' && events.get(n.profile.arrivalEventId)?.data.createdCharacter === true, '생성 주민 출처');
    if (n.id.startsWith('npc-created-')) ensure(Number(n.id.slice(12)) < w.nextId, '생성 ID 순서');
    if (n.id.startsWith('npc-born-')) ensure(Number(n.id.slice(9)) < w.nextId, '출생 ID 순서');
    ensure(walkable(w, n.position) && buildings.get(n.homeId)?.kind === 'home', '주민 위치/집');
    ensure(villages.has(n.settlementId) && buildings.get(n.homeId)?.settlementId === n.settlementId, '주민 소속 마을');
    ensure(n.life.bornTick <= w.tick && n.life.lastBirth <= w.tick && n.life.lastMove <= w.tick, '생애 시간');
    ensure(new Set(n.life.parentIds).size === n.life.parentIds.length && n.life.parentIds.every(id => id !== n.id && w.npcs.some(p => p.id === id && p.life.bornTick < n.life.bornTick && p.life.generation < n.life.generation)), '부모/세대 참조');
    ensure(!n.life.partnerId || w.npcs.some(p => p.id === n.life.partnerId && p.id !== n.id && p.alive && n.alive && p.life.partnerId === n.id), '배우자 참조');
    ensure(!n.life.birthEventId || events.get(n.life.birthEventId)?.kind === 'birth' && events.get(n.life.birthEventId)?.actorId === n.id && events.get(n.life.birthEventId)?.tick === n.life.bornTick, '출생 출처');
    ensure(!n.life.deathEventId || !n.alive && events.get(n.life.deathEventId)?.kind === 'death' && events.get(n.life.deathEventId)?.actorId === n.id && events.get(n.life.deathEventId)?.tick === n.life.deathTick, '사망 출처');
    ensure(n.life.estateSettled === !n.alive && (n.life.deathTick === undefined || !n.alive && n.life.deathTick <= w.tick), '상속/사망 상태');
    ensure(n.alive === (n.needs.health > 0), '생존 상태'); ensure(n.alive || !n.currentAction, '사망 주민 행동');
    ensure(n.decision.tick <= w.tick && n.lastTalk <= w.tick, '판단 시간');
    ensure(new Set(n.relationships.map(r => r.npcId)).size === n.relationships.length, '중복 관계');
    for (const r of n.relationships) ensure(r.npcId !== n.id && npcs.has(r.npcId) && r.evidence.every(e => events.has(e)) && (!r.turn || r.turn.lastTick <= w.tick), '관계 대상/출처');
    for (const m of n.memories) { register(m.id); ensure(events.has(m.sourceEventId) && m.createdAt <= w.tick && m.relatedNpcIds.every(id => npcs.has(id)) && m.relatedLocationIds.every(id => buildings.has(id)), '기억 출처'); }
    for (const g of n.goals) { register(g.id); ensure(g.createdAt <= w.tick && (!g.sourceEventId || events.has(g.sourceEventId)), '목표 출처'); }
    ensure(n.knownRumors.every(id => { const seen = events.get(id); return seen?.kind === 'witness' && seen.causeId && events.get(seen.causeId)?.kind === 'theft'; }), '소문 출처');
    for (const c of n.decision.candidates) ensure(!c.evidence || c.evidence.every(id => events.has(id)), '판단 후보 근거');
    if (n.currentAction) {
      const a = n.currentAction; let previous = n.position;
      for (const p of a.path) { ensure(walkable(w, p) && distance(previous, p) === 1, '이동 경로'); previous = p; }
      ensure(distance(previous, a.target) === 0 && walkable(w, a.target) && a.progress < a.duration, '행동 진행');
      const buildingKinds: Partial<Record<typeof a.kind, string>> = { Sleep: 'home', Wash: 'well', Drink: 'well', StoreItem: 'storage', TakeItem: 'storage', Theft: 'storage' };
      if (buildingKinds[a.kind]) ensure(w.buildings.some(b => b.kind === buildingKinds[a.kind] && distance(b.position, a.target) === 0), '행동 건물');
      if (a.kind === 'Gather') ensure(w.resources.some(r => r.id === a.targetId && distance(r.position, a.target) === 0), '채집 대상');
      if (a.kind === 'Work') ensure(a.targetId?.startsWith('construction:') ? w.construction?.projects.some(p=>p.id===a.targetId!.slice(13)&&distance(p.position,a.target)===0) : w.buildings.some(b => b.id === (a.targetId?.startsWith('industry:') ? a.targetId.slice(9) : a.targetId?.split(':')[0]) && distance(b.position, a.target) === 0), '작업 대상');
      if (['Share', 'Talk', 'Borrow'].includes(a.kind)) ensure(a.targetId && a.targetId !== n.id && npcs.has(a.targetId), '사회 행동 대상');
      if (a.kind === 'Repay') ensure(w.loans.some(l => l.id === a.targetId && l.borrowerId === n.id), '상환 대상');
      if (a.kind === 'Trade') {
        if (a.targetId?.startsWith('peer:')) ensure(npcs.has(a.targetId.slice(5)) && a.targetId.slice(5) !== n.id, '주민 거래 대상');
        else if (a.targetId?.startsWith('goods:')) ensure(CONSUMABLES.some(g => a.targetId === `goods:${g}`) && w.buildings.some(b => b.kind === 'market' && b.settlementId === n.settlementId && distance(b.position, a.target) === 0), '생활 상품 거래 대상');
        else ensure((a.targetId === 'buy' || a.targetId === 'sell') && w.buildings.some(b => b.kind === 'market' && distance(b.position, a.target) === 0), '거래 유형/시장');
      }
      ensure(!a.evidence || a.evidence.every(id => events.has(id)), '행동 판단 근거');
    }
  }
  for (const l of w.loans) ensure(l.borrowerId !== l.lenderId && npcs.has(l.borrowerId) && npcs.has(l.lenderId) && events.get(l.sourceEventId)?.kind === 'loan' && l.remaining <= l.amount && (l.status === 'repaid' ? l.remaining === 0 : l.remaining > 0), '대여 계약');
  for (const q of w.llm.queue) ensure(npcs.has(q.npcId) && events.get(q.eventId)?.participants.includes(q.npcId) && q.tick <= w.tick, 'LLM 요청 출처');
  ensure(Object.keys(w.llm.dailyByNpc).every(id => npcs.has(id)), 'LLM 예산 주민');
  ensure(Object.values(balance(w)).every(v => v === 0), '자원/화폐 회계 보존');
  ensure(w.economy.since <= w.tick, '회계 시작 시간');
  let sampleTick = w.economy.since;
  for (const d of w.economy.daily) {
    ensure(d.tick > sampleTick && d.tick <= w.tick && d.tick % 144 === 0 && d.day === d.tick / 144 && events.get(d.eventId)?.kind === 'price' && events.get(d.eventId)?.tick === d.tick && events.get(d.eventId)?.data.price === d.foodPrice, '일별 표본/출처'); sampleTick = d.tick;
    ensure(d.poorest <= d.median && d.median <= d.richest, '재산 분포');
  }
  for (const key of Object.keys(w.economy.totals) as (keyof typeof w.economy.totals)[]) ensure(w.economy.last[key] <= w.economy.totals[key], '회계 누적량');
  ensure(w.living.since <= w.tick, '생활 상태 시작 시간');
  ensure(Object.keys(w.living.people).length === npcs.size && Object.keys(w.living.people).every(id => npcs.has(id)), '생활 주민 참조');
  ensure(Object.keys(w.living.homes).length === w.buildings.filter(b => b.kind === 'home').length && Object.keys(w.living.homes).every(id => buildings.get(id)?.kind === 'home'), '주거 유형 참조');
  validateGatherings(w, ensure, register);
  validateRequests(w, ensure, register);
  validateUrban(w, ensure);
  validateLegacy(w,ensure);
  validateHeritage(w, ensure);
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

export { event as eventSchema };
