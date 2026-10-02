import type { WorldState, Economy, EconomyFlow } from './types';
import { appendEvent } from './social';
import { dayOf } from './random';

export const emptyFlow = (): EconomyFlow => ({ producedFood: 0, producedWood: 0, consumedFood: 0, investedWood: 0, externalFood: 0, trades: 0, tradeVolume: 0, wages: 0 });
export function holdings(w: WorldState) {
  const regional = w.civilization?.settlements.filter(v => v.id !== 'v0').reduce((a, v) => ({ food: a.food + v.storage.food + v.market.food, wood: a.wood + v.storage.wood + v.market.wood, coins: a.coins + v.market.coins }), { food: 0, wood: 0, coins: 0 }) ?? { food: 0, wood: 0, coins: 0 };
  const transit = w.civilization?.journeys.reduce((a, j) => ({ food: a.food + j.food, coins: a.coins + j.coins }), { food: 0, coins: 0 }) ?? { food: 0, coins: 0 };
  const urbanCoins = (w.urban?.cities.reduce((s, c) => s + c.treasury, 0) ?? 0) + (w.urban?.freight.reduce((s, f) => s + f.coins, 0) ?? 0);
  return w.npcs.reduce((a, n) => ({ food: a.food + n.inventory.food, wood: a.wood + n.inventory.wood, coins: a.coins + n.wealth }),
    { food: w.storage.food + w.market.food + regional.food + transit.food, wood: w.storage.wood + w.market.wood + regional.wood, coins: w.market.coins + regional.coins + transit.coins + urbanCoins + (w.urban?.enterprises.reduce((s,e)=>s+(e.business?.cash??0),0)??0) });
}
export function createEconomy(w: WorldState): Economy {
  const h = holdings(w);
  return { since: w.tick, openingFood: h.food, openingWood: h.wood, openingCoins: h.coins, totals: emptyFlow(), daily: [], last: { ...emptyFlow(), shares: w.stats.shares, conflicts: w.stats.conflicts } };
}
export function balance(w: WorldState) {
  const h = holdings(w), e = w.economy, t = e.totals;
  return { food: h.food - (e.openingFood + (e.arrivals?.food ?? 0) + t.producedFood + t.externalFood - t.consumedFood), wood: h.wood - (e.openingWood + (e.arrivals?.wood ?? 0) + t.producedWood - t.investedWood), coins: h.coins - e.openingCoins - (e.arrivals?.coins ?? 0) };
}
// Daily integer quotes: bounded to 1..12 and at most one coin per day.
export function updatePrices(w: WorldState) {
  const living = w.npcs.filter(n => n.alive && n.settlementId === 'v0'), hungry = living.filter(n => n.inventory.food < 2 && n.needs.hunger > 45).length;
  const foodStock = w.storage.food + w.market.food + living.reduce((s, n) => s + n.inventory.food, 0), demand = living.length * 3 + hungry * 2;
  const desired = Math.max(1, Math.min(12, Math.round(3 * demand / Math.max(1, foodStock))));
  const previous = w.market.foodPrice;
  w.market.foodPrice += Math.sign(desired - previous);
  const woodStock = w.storage.wood + w.market.wood + living.reduce((s, n) => s + n.inventory.wood, 0);
  const woodTarget = woodStock < living.length * 2 ? 3 : woodStock > living.length * 8 ? 1 : 2;
  w.market.woodPrice += Math.sign(woodTarget - w.market.woodPrice);
  const e = appendEvent(w, { kind: 'price', importance: 25, description: `식량 가격 ${previous} → ${w.market.foodPrice}코인. 식량 ${foodStock}개, 수요 기준 ${demand}개, 식량이 필요한 주민 ${hungry}명.`,
    data: { previous, price: w.market.foodPrice, desired, foodStock, demand, hungry, woodPrice: w.market.woodPrice, woodStock } });
  return e;
}
export function sampleDay(w: WorldState) {
  const e = w.economy, h = holdings(w), living = w.npcs.filter(n => n.alive), wealth = living.map(n => n.wealth).sort((a, b) => a - b);
  const flow = emptyFlow();
  for (const key of Object.keys(flow) as (keyof EconomyFlow)[]) flow[key] = e.totals[key] - e.last[key];
  const source = updatePrices(w);
  e.daily.push({ ...flow, day: dayOf(w.tick) - 1, tick: w.tick, population: living.length, food: h.food, storageFood: w.storage.food, foodPrice: w.market.foodPrice, coins: h.coins,
    poorest: wealth[0] ?? 0, median: wealth.length ? (wealth[Math.floor((wealth.length - 1) / 2)] + wealth[Math.floor(wealth.length / 2)]) / 2 : 0, richest: wealth.at(-1) ?? 0,
    shares: w.stats.shares - e.last.shares, conflicts: w.stats.conflicts - e.last.conflicts, eventId: source.id });
  e.last = { ...e.totals, shares: w.stats.shares, conflicts: w.stats.conflicts };
}
