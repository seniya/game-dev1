import { canWork } from './employment';
import type { WorldState, NPC } from './types';
import { TICKS_PER_DAY, DAYS_PER_YEAR } from './types';
import { city, cityMetrics, setPolicy } from './urban';
import { stocks } from './civilization';
import { appendEvent } from './social';
import { clamp, distance } from './random';
import { SERVICES, SERVICE_LABELS, type Service } from './urban-types';

export interface Habitat { settlementId: string; soil: number; pasture: number; livestock: number; opening: number; born: number; lost: number; harvest: number; lastEventId?: string }
export interface Council { settlementId: string; autonomous: boolean; groups: { kind: 'livelihood' | 'care' | 'exchange'; members: string[]; priority: Service }[]; lastEventId?: string }
export interface Accord { from: string; to: string; trust: number; tension: number; status: 'neutral' | 'cooperation' | 'dispute'; deliveries: number; reviewed: number; lastEventId?: string; deliveryEventId?: string }
export interface Heritage { since: number; habitats: Habitat[]; councils: Council[]; accords: Accord[] }
export const SEASONS = ['봄', '여름', '가을', '겨울'];
export function seasonIndex(w: WorldState) { return Math.floor(w.tick / TICKS_PER_DAY / (DAYS_PER_YEAR / 4)) % 4; }
export function initializeHeritage(w: WorldState, fresh = false) {
  w.heritage ??= { since: w.tick, habitats: [], councils: [], accords: [] };
  for (const v of w.civilization.settlements) {
    if (!w.heritage.habitats.some(h => h.settlementId === v.id)) w.heritage.habitats.push({ settlementId: v.id, soil: 80, pasture: 70, livestock: fresh ? 2 : 0, opening: fresh ? 2 : 0, born: 0, lost: 0, harvest: 0 });
    if (!w.heritage.councils.some(c => c.settlementId === v.id)) w.heritage.councils.push({ settlementId: v.id, autonomous: true, groups: [] });
  }
  const vs = w.civilization.settlements;
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) if (!accord(w, vs[i].id, vs[j].id)) w.heritage.accords.push({ from: vs[i].id, to: vs[j].id, trust: 40, tension: 0, status: 'neutral', deliveries: 0, reviewed: 0 });
}
export function accord(w: WorldState, a: string, b: string) { return w.heritage?.accords.find(r => r.from === a && r.to === b || r.from === b && r.to === a); }
export function harvest(w: WorldState, id: string, amount: number) { const h = w.heritage?.habitats.find(h => h.settlementId === id); if (h) h.harvest += amount; }
export function cropMultiplier(w: WorldState, id: string) { const h = w.heritage.habitats.find(h => h.settlementId === id); return [.95, 1.15, 1.25, .65][seasonIndex(w)] * (.55 + (h?.soil ?? 80) / 160); }
export function setCouncil(w: WorldState, id: string, enabled: boolean) {
  const c = w.heritage.councils.find(c => c.settlementId === id); if (!c) throw new Error('도시 의회가 없습니다.');
  c.autonomous = enabled;
  c.lastEventId = appendEvent(w, { kind: 'council', importance: 55, description: `${id}: 주민 공동결정 ${enabled ? '시작' : '중단'}.`, data: { settlementId: id, enabled } }).id;
}
export function ecologyDay(w: WorldState) {
  initializeHeritage(w);
  const season = seasonIndex(w);
  for (const h of w.heritage.habitats) {
    const c = city(w, h.settlementId), people = w.npcs.filter(n => n.alive && n.settlementId === h.settlementId), farmers = people.filter(n => canWork(w, n));
    const fields = w.buildings.filter(b => b.kind === 'farm' && b.settlementId === h.settlementId).length;
    const beforeSoil = h.soil;
    h.soil = clamp(h.soil + (w.weather === 'rain' ? 1.2 : .45) - h.harvest / Math.max(1, fields) * .018 - c.pollution * .002);
    h.pasture = clamp(h.pasture + (w.weather === 'drought' ? 0 : season === 3 ? 1 : 5) - h.livestock * .7);
    let born = 0, lost = 0, feed = 0, food = 0;
    if (farmers.length && h.livestock === 0 && c.goods.grain >= 12 && h.pasture > 50) {
      // A newly domesticated pair uses grain; it is recorded as a stock addition, never hidden in opening balances.
      feed = 12; c.goods.grain -= feed; w.urban.ledger.consumed.grain += feed; born = 2;
    } else if (h.livestock > 0) {
      feed = Math.min(c.goods.grain, Math.ceil(h.livestock / 2)); c.goods.grain -= feed; w.urban.ledger.consumed.grain += feed;
      if (!farmers.length || h.pasture < 10 && feed < Math.ceil(h.livestock / 2)) lost = 1;
      else {
        food = Math.min(farmers.length * 2, h.livestock); stocks(w, h.settlementId).food += food; w.economy.totals.producedFood += food;
        if (season === 0 && w.tick % (3 * TICKS_PER_DAY) === 0 && h.livestock >= 2 && h.livestock < 20 && h.pasture > 40 && feed > 0) born = 1;
      }
    }
    h.livestock += born - lost; h.born += born; h.lost += lost;
    h.lastEventId = appendEvent(w, { kind: 'ecology', importance: 45, description: `${h.settlementId} ${SEASONS[season]}: 토양 ${beforeSoil.toFixed(1)}→${h.soil.toFixed(1)}, 목초 ${h.pasture.toFixed(1)}, 가축 ${h.livestock}마리. 사료 곡물 ${feed}개, 축산 식량 ${food}개.`, data: { settlementId: h.settlementId, season: SEASONS[season], soilBefore: beforeSoil, soil: h.soil, harvest: h.harvest, pasture: h.pasture, livestock: h.livestock, born, lost, feed, food } }).id;
    h.harvest = 0;
  }
  // Natural resources become owned production only when gathered, as in the original ledger.
  for (const r of w.resources) {
    const v = [...w.civilization.settlements].sort((a, b) => distance(a.center, r.position) - distance(b.center, r.position))[0];
    const h = w.heritage.habitats.find(h => h.settlementId === v.id)!;
    const growth = r.kind === 'wood' ? (w.weather === 'drought' || h.soil < 25 ? 1 : season === 3 ? 2 : 3) : w.weather === 'drought' ? 0 : season === 3 ? 0 : w.weather === 'rain' ? 2 : 1;
    r.amount = Math.min(r.capacity, r.amount + growth);
  }
}
function preference(w: WorldState, n: NPC, parents: Set<string>): Service {
  const u = w.urban.citizens[n.id];
  if (u.disease > 0 || u.injury > 0) return 'clinic';
  if (city(w, n.settlementId).pollution > 30) return 'sanitation';
  if (n.needs.thirst > 60) return 'water';
  if (n.life.parentIds.length || parents.has(n.id)) return 'school';
  return n.occupation === 'merchant' || n.occupation === 'woodcutter' ? 'road' : 'water';
}
export function societyDay(w: WorldState) {
  initializeHeritage(w);
  const parents = new Set(w.npcs.filter(n => n.alive && n.identity.age < 18).flatMap(n => n.life.parentIds));
  const choices = new Map(w.npcs.filter(n => n.alive && n.identity.age >= 18).map(n => [n.id, preference(w, n, parents)]));
  for (const council of w.heritage.councils) {
    const adults = w.npcs.filter(n => n.alive && n.identity.age >= 18 && n.settlementId === council.settlementId);
    council.groups = (['livelihood', 'care', 'exchange'] as const).map(kind => {
      const members = adults.filter(n => (n.occupation === 'merchant' ? 'exchange' : n.life.partnerId ? 'care' : 'livelihood') === kind);
      const votes = SERVICES.map(priority => ({ priority, count: members.filter(n => choices.get(n.id) === priority).length }));
      return { kind, members: members.map(n => n.id), priority: votes.sort((a, b) => b.count - a.count)[0].priority };
    });
    if (w.tick % (3 * TICKS_PER_DAY) || !adults.length || !council.autonomous) continue;
    const tally = SERVICES.map(priority => ({ priority, count: adults.filter(n => choices.get(n.id) === priority).length })).sort((a, b) => b.count - a.count);
    const chosen = tally[0];
    const e = appendEvent(w, { kind: 'council', importance: 55, description: `${council.settlementId} 주민 ${adults.length}명의 생활 여건을 반영한 공동결정: ${SERVICE_LABELS[chosen.priority]} ${chosen.count}표.`, data: { settlementId: council.settlementId, voters: adults.length, priority: chosen.priority, votes: chosen.count, tally: tally.map(v => `${v.priority}:${v.count}`) } });
    council.lastEventId = e.id;
    setPolicy(w, council.settlementId, city(w, council.settlementId).taxRate, chosen.priority, e.id);
  }
  if (w.tick % (3 * TICKS_PER_DAY)) return;
  for (const r of w.heritage.accords) {
    const a = cityMetrics(w, r.from), b = cityMetrics(w, r.to), deliveries = r.deliveries - r.reviewed;
    const shortage = a.food < a.population || b.food < b.population;
    const previous = r.status;
    r.tension = clamp(r.tension + (shortage ? 15 : -10) - Math.min(10, deliveries * 2));
    r.trust = clamp(r.trust + Math.min(12, deliveries * 4) + (shortage ? -3 : 2)); r.reviewed = r.deliveries;
    r.status = r.tension >= 60 ? 'dispute' : r.trust >= 50 && r.tension < 30 ? 'cooperation' : 'neutral';
    if (r.status !== previous || deliveries) r.lastEventId = appendEvent(w, { kind: 'diplomacy', causeId: deliveries ? r.deliveryEventId : undefined, importance: 60, description: `${r.from}·${r.to}: ${r.status === 'cooperation' ? '교역 협약' : r.status === 'dispute' ? '자원 분쟁으로 신규 산업 교역 중단' : '통상 관계'}. 식량 부족 ${shortage ? '있음' : '없음'}, 최근 인도 ${deliveries}건, 신뢰 ${r.trust}, 긴장 ${r.tension}.`, data: { from: r.from, to: r.to, previous, status: r.status, shortage, deliveries, trust: r.trust, tension: r.tension, evidence: [w.heritage.habitats.find(h => h.settlementId === r.from)?.lastEventId, w.heritage.habitats.find(h => h.settlementId === r.to)?.lastEventId].filter((s): s is string => !!s) } }).id;
  }
}
