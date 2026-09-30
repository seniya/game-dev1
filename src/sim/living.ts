import type { WorldState, NPC, Candidate } from './types';
import { HOMES, HOME_KINDS, type LivingPerson } from './living-types';
import { GOODS, GOOD_LABELS, GOOD_PRICES, type Good } from './urban-types';
import { clamp, distance } from './random';
import { city } from './urban';
import { market, localBuilding, isTravelling } from './civilization';
import { seasonIndex } from './heritage';
import { appendEvent } from './social';

export function newLivingPerson(n: NPC): LivingPerson {
  // Derivation leaves the simulation RNG and historical evidence unchanged during migration.
  const p = n.personality;
  return { traits: { patience: Math.round((p.diligence + p.empathy) / 2), optimism: Math.round(100 - p.aggression * .6), frugality: Math.round((p.diligence + 100 - p.greed) / 2), independence: Math.round(100 - p.sociability * .7) },
    desires: { security: 35, belonging: Math.round(100 - n.needs.social), comfort: 30, mastery: Math.round(p.diligence * .5), prosperity: Math.round(p.greed * .6), novelty: Math.round(p.curiosity * .5) },
    body: { stamina: Math.round(100 - n.needs.fatigue * .5), cleanliness: 80, warmth: 80, pain: 0 }, clothing: 0, furnishings: 0 };
}
export function initializeLiving(w: WorldState) {
  w.living ??= { since: w.tick, people: {}, homes: {} };
  for (const n of w.npcs) w.living.people[n.id] ??= newLivingPerson(n);
  let i = 0;
  for (const b of w.buildings) if (b.kind === 'home') { w.living.homes[b.id] ??= HOME_KINDS[i % HOME_KINDS.length]; i++; }
}
export function homeProfile(w: WorldState, n: NPC) { return HOMES[w.living.homes[n.homeId] ?? 'shared']; }
export function livingTick(w: WorldState, n: NPC) {
  const l = w.living.people[n.id], u = w.urban.citizens[n.id], b = l.body;
  const resting = !n.currentAction?.path.length && (n.currentAction?.kind === 'Sleep' || n.currentAction?.kind === 'Idle');
  const labour = n.currentAction?.kind === 'Work' || n.currentAction?.kind === 'Gather';
  b.stamina = clamp(b.stamina + (resting ? 1.2 : labour ? -.22 : -.06));
  b.cleanliness = clamp(b.cleanliness - (labour ? .07 : .025));
  const insulation = homeProfile(w, n).insulation * (w.urban.buildings[n.homeId]?.condition ?? 100) / 100;
  const targetWarmth = clamp((seasonIndex(w) === 3 ? 38 : 75) + l.clothing * .25 + (resting && n.currentAction?.kind === 'Sleep' ? insulation * .35 : 0) - (w.weather === 'rain' && !resting ? 12 : 0));
  b.warmth = clamp(b.warmth + (targetWarmth - b.warmth) * .03);
  const targetPain = clamp(u.injury * .8 + u.disease * .25 + Math.max(0, 25 - b.stamina) * .2);
  b.pain = clamp(b.pain + (targetPain - b.pain) * .015 - (resting ? .08 : 0));
  if (b.warmth < 35 || b.stamina < 15) n.needs.fatigue = clamp(n.needs.fatigue + .07);
}
export function livingDay(w: WorldState) {
  initializeLiving(w);
  for (const n of w.npcs) if (n.alive) {
    const l = w.living.people[n.id], u = w.urban.citizens[n.id], d = l.desires;
    l.clothing = clamp(l.clothing - 2); l.furnishings = clamp(l.furnishings - .5);
    const target = { security: (100 - n.needs.safety + n.needs.hunger) / 2, belonging: 100 - n.needs.social, comfort: (100 - u.housing + n.needs.fatigue + 100 - l.body.warmth) / 3, mastery: 100 - (n.life.skill + u.education) / 2, prosperity: clamp(70 + n.personality.greed * .3 - n.wealth), novelty: n.personality.curiosity };
    for (const key of Object.keys(d) as (keyof typeof d)[]) d[key] = clamp(d[key] + (target[key] - d[key]) * .25);
    u.stress = clamp(u.stress + (l.body.cleanliness < 25 ? 2 : 0) + l.body.pain * .025 - l.traits.optimism * .012);
  }
}
export const CONSUMABLES = ['herbs', 'clothes', 'meals', 'furniture', 'vegetables', 'fruit', 'bread', 'dried_fish', 'cheese', 'stew', 'blankets', 'medicine', 'pottery'] as const;
export function consumptionNeed(w: WorldState, n: NPC, good: Good): number {
  const l = w.living.people[n.id], u = w.urban.citizens[n.id];
  if (good === 'medicine') return Math.max(l.body.pain, u.disease * 4, u.injury * 3);
  if (good === 'pottery') return l.body.cleanliness < 50 ? 100 - l.body.cleanliness : 0;
  if (good === 'blankets') return l.clothing < 40 ? 100 - l.body.warmth : 0;
  if (['vegetables', 'fruit', 'bread', 'dried_fish', 'cheese', 'stew'].includes(good)) return n.needs.hunger > 40 ? n.needs.hunger : 0;
  if (good === 'herbs') return Math.max(l.body.pain, u.disease * 3, u.injury * 2);
  if (good === 'clothes') return l.clothing < 30 ? Math.max(45, 100 - l.body.warmth) : 0;
  if (good === 'meals') return n.needs.hunger > 30 || u.nutrition < 55 ? Math.max(n.needs.hunger, 100 - u.nutrition) : 0;
  if (good === 'furniture') return l.furnishings < 30 ? l.desires.comfort : 0;
  return 0;
}
export function livingCandidates(w: WorldState, n: NPC, list: Candidate[]) {
  const l = w.living.people[n.id], d = l.desires, b = l.body;
  for (const c of list) {
    let bonus = 0, why = '';
    if (c.kind === 'Sleep') { bonus = b.pain * .35 + (100 - b.stamina) * .2 + d.comfort * .08; why = `체력 ${Math.round(b.stamina)} · 통증 ${Math.round(b.pain)}`; }
    if (c.kind === 'Work' || c.kind === 'Gather') { bonus = d.mastery * .06 + d.prosperity * .06 - b.pain * .3 - Math.max(0, 40 - b.stamina) * .6; why = `성취 욕망 ${Math.round(d.mastery)} · 체력 ${Math.round(b.stamina)}`; }
    if (c.kind === 'Talk') { bonus = d.belonging * .13 + d.novelty * .05 - l.traits.independence * .05; why = `소속 욕망 ${Math.round(d.belonging)}`; }
    if (c.kind === 'Theft') { bonus = -l.traits.patience * .12; why = `인내심 ${Math.round(l.traits.patience)}`; }
    if (c.kind === 'TakeItem' || c.kind === 'StoreItem') { bonus = d.security * .08; why = `안정 욕망 ${Math.round(d.security)}`; }
    c.score = Math.round((c.score + bonus) * 10) / 10;
    if (why) c.reason += ` · ${why}`;
  }
  if (b.cleanliness < 65) {
    const well = localBuilding(w, n, 'well');
    list.push({ kind: 'Wash', score: Math.round((100 - b.cleanliness) * 1.15 - distance(n.position, well.position) * .6), reason: `청결 ${Math.round(b.cleanliness)} · 우물에서 씻어 위생과 기분을 회복한다.`, target: { ...well.position }, targetId: well.id });
  }
  const c = city(w, n.settlementId), shop = localBuilding(w, n, 'market');
  for (const good of CONSUMABLES) {
    const need = consumptionNeed(w, n, good), price = GOOD_PRICES[good];
    const reserve = !['clothes', 'furniture', 'blankets', 'pottery'].includes(good) ? 0 : Math.round(l.traits.frugality / 10) + market(w, n.settlementId).foodPrice * 2;
    if (need < 30 || !c.goods[good] || n.wealth < price + reserve) continue;
    list.push({ kind: 'Trade', score: Math.round(need * 1.15 + 10 - l.traits.frugality * .12 - distance(n.position, shop.position) * .6), reason: `${GOOD_LABELS[good]} ${price}코인 · 필요 ${Math.round(need)} · 검소함 ${Math.round(l.traits.frugality)} · 생활비 유보 ${reserve}`, target: { ...shop.position }, targetId: `goods:${good}` });
  }
}
export function buyConsumerGood(w: WorldState, n: NPC, good: Good): boolean {
  if (!CONSUMABLES.includes(good as typeof CONSUMABLES[number]) || !n.alive || n.identity.age < 18 || isTravelling(w, n)) return false;
  const c = city(w, n.settlementId), price = GOOD_PRICES[good], l = w.living.people[n.id], u = w.urban.citizens[n.id];
  if (!c.goods[good] || n.wealth < price || !w.buildings.some(b => b.kind === 'market' && b.settlementId === n.settlementId && distance(b.position, n.position) === 0)) return false;
  c.goods[good]--; w.urban.ledger.consumed[good]++;
  n.wealth -= price; market(w, n.settlementId).coins += price; u.expenses += price;
  w.economy.totals.trades++; w.economy.totals.tradeVolume += price;
  if (good === 'herbs') { l.body.pain = clamp(l.body.pain - 18); u.disease = clamp(u.disease - 2); u.injury = clamp(u.injury - 2); }
  if (good === 'clothes') l.clothing = 100;
  if (good === 'meals') { n.needs.hunger = clamp(n.needs.hunger - 45); u.nutrition = clamp(u.nutrition + 12); }
  if (good === 'furniture') l.furnishings = 100;
  if (good === 'blankets') { l.clothing = Math.max(l.clothing, 80); l.body.warmth = clamp(l.body.warmth + 25); }
  if (good === 'pottery') l.body.cleanliness = clamp(l.body.cleanliness + 35);
  if (good === 'medicine') { l.body.pain = clamp(l.body.pain - 30); u.disease = clamp(u.disease - 8); u.injury = clamp(u.injury - 5); }
  if (['vegetables', 'fruit', 'bread', 'dried_fish', 'cheese', 'stew'].includes(good)) { n.needs.hunger = clamp(n.needs.hunger - (good === 'vegetables' || good === 'fruit' ? 25 : 45)); u.nutrition = clamp(u.nutrition + 8); }
  l.desires.comfort = clamp(l.desires.comfort - 15); l.desires.novelty = clamp(l.desires.novelty - 8);
  appendEvent(w, { kind: 'consumption', actorId: n.id, importance: 30, description: `${n.identity.name}이 ${GOOD_LABELS[good]} 1개를 ${price}코인에 구입해 생활에 사용했다.`, data: { settlementId: n.settlementId, good, amount: 1, price } });
  return true;
}
export function migrateLiving(w: WorldState) {
  for (const goods of [w.urban.ledger.opening, w.urban.ledger.produced, w.urban.ledger.consumed, ...w.urban.cities.map(c => c.goods)]) for (const good of GOODS) goods[good] ??= 0;
  initializeLiving(w);
}
