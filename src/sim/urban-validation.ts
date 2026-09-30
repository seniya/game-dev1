import { z } from 'zod';
import type { WorldState } from './types';
import { GOODS, INDUSTRIES, SERVICES, MINERALS } from './urban-types';
import { urbanBalance } from './urban';
import { walkable } from './pathfinding';
import { distance } from './random';
const nat = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), score = z.number().min(0).max(100), id = z.string().min(1).max(100);
const goods = z.object(Object.fromEntries(GOODS.map(g => [g, nat])) as Record<typeof GOODS[number], typeof nat>).strict();
const services = z.object({ road: nat.max(3), water: nat.max(3), sanitation: nat.max(3), clinic: nat.max(3), school: nat.max(3) }).strict();
const deposits = z.object({ stone: nat, ore: nat, clay: nat, salt: nat }).strict();
export const urbanSchema = z.object({ since: nat,
  citizens: z.record(z.object({ education: score, nutrition: score, stress: score, housing: score, trust: score, disease: score, injury: score, preference: score, skills: z.object({ field: score, quarry: score, mine: score, mill: score, smith: score }).strict(), employer: id.optional(), healthEventId: id.optional(), income: nat, expenses: nat }).strict()),
  cities: z.array(z.object({ settlementId: id, fertility: score, deposits, initialDeposits: deposits, goods, treasury: nat, taxRate: nat.max(30), priority: z.enum(SERVICES), services, active: services, pollution: score, collected: nat, spent: nat, policyEventId: id.optional(), lastEventId: id.optional() }).strict()).max(12),
  enterprises: z.array(z.object({ id, settlementId: id, buildingId: id, kind: z.enum(INDUSTRIES), capacity: nat.min(1).max(40), wage: nat.min(1).max(20), workers: z.array(id).max(40), output: nat, sourceEventId: id.optional() }).strict()).max(480),
  freight: z.array(z.object({ id, from: id, to: id, good: z.enum(GOODS), amount: nat.min(1), coins: nat.min(1), fee: nat.min(1), path: z.array(z.object({ x: nat.max(127), y: nat.max(127) }).strict()).max(16384), progress: nat, sourceEventId: id }).strict()).max(1000),
  buildings: z.record(z.object({ condition: score, maintenance: nat.min(1).max(20) }).strict()),
  ledger: z.object({ opening: goods, produced: goods, consumed: goods }).strict(),
  samples: z.array(z.object({ tick: nat, settlementId: id, population: nat.max(3000), employed: nat.max(3000), housing: nat, food: nat, treasury: nat, stress: score, sick: nat.max(3000), eventId: id }).strict()).max(1080),
}).strict();
export function validateUrban(w: WorldState, ensure: (condition: unknown, message: string) => void) {
  const u = w.urban, npcs = new Map(w.npcs.map(n => [n.id, n])), buildings = new Map(w.buildings.map(b => [b.id, b])), villages = new Set(w.civilization.settlements.map(v => v.id)), events = new Map(w.events.map(e => [e.id, e]));
  ensure(u.since <= w.tick, '도시 회계 시작');
  ensure(Object.keys(u.citizens).length === npcs.size && Object.keys(u.citizens).every(id => npcs.has(id)), '도시 주민 참조');
  ensure(Object.keys(u.buildings).length === buildings.size && Object.keys(u.buildings).every(id => buildings.has(id)), '도시 건물 참조');
  ensure(u.cities.length === villages.size && new Set(u.cities.map(c => c.settlementId)).size === villages.size, '도시 중복/누락');
  for (const c of u.cities) {
    ensure(villages.has(c.settlementId) && c.treasury === c.collected - c.spent, '도시 예산 보존');
    ensure(!c.lastEventId || events.has(c.lastEventId), '도시 원인 사건');
    ensure(!c.policyEventId || events.get(c.policyEventId)?.kind === 'policy', '정책 출처');
    for (const key of MINERALS) ensure(c.deposits[key] <= c.initialDeposits[key], '매장 자원');
    for (const s of SERVICES) ensure(c.active[s] <= c.services[s], '공공 서비스 용량');
  }
  for (const key of MINERALS) ensure(u.cities.reduce((s, c) => s + c.initialDeposits[key] - c.deposits[key], 0) === u.ledger.produced[key], '채굴 회계');
  const employed = new Set<string>(), ids = new Set([...w.npcs, ...w.buildings, ...w.resources, ...w.events, ...w.loans, ...w.civilization.journeys].map(x => x.id));
  for (const e of u.enterprises) {
    ensure(!ids.has(e.id) && /^u\d+$/.test(e.id) && Number(e.id.slice(1)) < w.nextId, '사업체 ID'); ids.add(e.id);
    ensure(villages.has(e.settlementId) && buildings.get(e.buildingId)?.settlementId === e.settlementId && e.workers.length <= e.capacity && (!e.sourceEventId || events.has(e.sourceEventId)), '사업체 위치/정원/출처');
    for (const id of e.workers) { ensure(npcs.get(id)?.alive && npcs.get(id)!.identity.age >= 18 && npcs.get(id)!.settlementId === e.settlementId && !employed.has(id) && u.citizens[id].employer === e.id, '고용 중복/참조'); employed.add(id); }
  }
  for (const [id, c] of Object.entries(u.citizens)) { ensure(!c.employer || employed.has(id), '근로자 고용 참조'); ensure(!c.healthEventId || events.get(c.healthEventId)?.kind === 'health' && events.get(c.healthEventId)?.actorId === id, '건강 사건 출처'); }
  for (const f of u.freight) {
    ensure(!ids.has(f.id) && /^u\d+$/.test(f.id) && Number(f.id.slice(1)) < w.nextId, '화물 ID'); ids.add(f.id);
    ensure(villages.has(f.from) && villages.has(f.to) && f.from !== f.to && f.progress <= f.path.length && events.get(f.sourceEventId)?.kind === 'freight', '운송 참조');
    const from = w.civilization.settlements.find(v => v.id === f.from)!, to = w.civilization.settlements.find(v => v.id === f.to)!;
    ensure(f.path.length > 0 && distance(from.center, f.path[0]) === 1 && distance(to.center, f.path.at(-1)!) === 0 && f.path.every((p, i) => walkable(w, p) && (!i || distance(f.path[i - 1], p) === 1)), '화물 경로');
  }
  for (const s of u.samples) ensure(s.tick <= w.tick && villages.has(s.settlementId) && events.get(s.eventId)?.kind === 'urban' && events.get(s.eventId)?.tick === s.tick && s.employed <= s.population && s.sick <= s.population, '도시 표본/출처');
  ensure(Object.values(urbanBalance(w)).every(n => n === 0), '산업 자원 회계 보존');
}
