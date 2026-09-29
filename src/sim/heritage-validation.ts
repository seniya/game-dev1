import { z } from 'zod';
import { SERVICES } from './urban-types';
import type { WorldState } from './types';
const nat = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), score = z.number().min(0).max(100), id = z.string().min(1).max(100);
export const heritageSchema = z.object({ since: nat,
  habitats: z.array(z.object({ settlementId: id, soil: score, pasture: score, livestock: nat.max(20), opening: nat.max(2), born: nat, lost: nat, harvest: nat, lastEventId: id.optional() }).strict()).max(12),
  councils: z.array(z.object({ settlementId: id, autonomous: z.boolean(), groups: z.array(z.object({ kind: z.enum(['livelihood', 'care', 'exchange']), members: z.array(id).max(3000), priority: z.enum(SERVICES) }).strict()).max(3), lastEventId: id.optional() }).strict()).max(12),
  accords: z.array(z.object({ from: id, to: id, trust: score, tension: score, status: z.enum(['neutral', 'cooperation', 'dispute']), deliveries: nat, reviewed: nat, lastEventId: id.optional(), deliveryEventId: id.optional() }).strict()).max(66),
}).strict();
export function validateHeritage(w: WorldState, ensure: (c: unknown, m: string) => void) {
  const h = w.heritage, villages = new Set(w.civilization.settlements.map(v => v.id)), people = new Set(w.npcs.map(n => n.id)), events = new Map(w.events.map(e => [e.id, e]));
  ensure(h.since <= w.tick, '생태 시작 날짜');
  for (const list of [h.habitats, h.councils]) ensure(list.length === villages.size && new Set(list.map(x => x.settlementId)).size === villages.size && list.every(x => villages.has(x.settlementId)), '생태·의회 지역 참조');
  for (const v of h.habitats) { ensure(v.livestock === v.opening + v.born - v.lost, '가축 보존'); ensure(!v.lastEventId || events.get(v.lastEventId)?.kind === 'ecology', '생태 근거'); }
  for (const c of h.councils) {
    ensure(!c.lastEventId || events.get(c.lastEventId)?.kind === 'council', '의회 근거');
    const members = c.groups.flatMap(g => g.members);
    // Membership records the last daily assembly, so a member can die or migrate later that day.
    ensure(new Set(members).size === members.length && members.every(id => people.has(id)) && new Set(c.groups.map(g => g.kind)).size === c.groups.length, '주민 집단 중복·참조');
  }
  const pairs = new Set<string>();
  for (const r of h.accords) {
    const key = [r.from, r.to].sort().join(':');
    ensure(villages.has(r.from) && villages.has(r.to) && r.from !== r.to && !pairs.has(key) && r.reviewed <= r.deliveries, '도시 관계 참조'); pairs.add(key);
    ensure(!r.lastEventId || events.get(r.lastEventId)?.kind === 'diplomacy', '도시 협약 근거');
    ensure(!r.deliveryEventId || events.get(r.deliveryEventId)?.kind === 'freight', '도시 교역 근거');
  }
  ensure(pairs.size === villages.size * (villages.size - 1) / 2, '도시 관계 누락');
}
