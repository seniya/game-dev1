import { type WorldState, type NPC, type Settlement, type Building, YEAR_TICKS } from './types';
import { appendEvent } from './social';
import { findPath } from './pathfinding';
import { distance } from './random';

export function village(w: WorldState, n: NPC): Settlement { return w.civilization.settlements.find(v => v.id === n.settlementId)!; }
export function stocks(w: WorldState, id: string) { return id === 'v0' ? w.storage : w.civilization.settlements.find(v => v.id === id)!.storage; }
export function market(w: WorldState, id: string) { return id === 'v0' ? w.market : w.civilization.settlements.find(v => v.id === id)!.market; }
export function localBuilding(w: WorldState, n: NPC, kind: Building['kind']) {
  return w.buildings.filter(b => b.kind === kind && b.settlementId === n.settlementId).sort((a, b) => distance(a.position, n.position) - distance(b.position, n.position))[0] ?? w.buildings.find(b => b.kind === kind)!;
}
export function capacity(b: Building) { return 2 + b.level * 2; }
export function residents(w: WorldState, id: string) { return w.npcs.filter(n => n.alive && n.settlementId === id); }
export function initializeCivilization(w: WorldState) {
  w.civilization ??= { settlements: [], journeys: [], focus: 'v0', detail: 'full' };
  if (!w.civilization.settlements.length) w.civilization.settlements.push({ id: 'v0', name: '느티마을', center: { x: 16, y: 12 }, foundedAt: w.tick, storage: { food: 0, wood: 0 }, market: { food: 0, wood: 0, coins: 0, foodPrice: 3, woodPrice: 2 } });
  for (const b of w.buildings) { b.settlementId ??= 'v0'; if (b.kind === 'home') b.ownerIds ??= w.npcs.filter(n => n.homeId === b.id && n.alive).map(n => n.id); }
  for (const n of w.npcs) {
    if (!n.life) n.life = { bornTick: w.tick - n.identity.age * YEAR_TICKS, parentIds: [], generation: 0, skill: 10, lastBirth: w.tick, lastMove: w.tick, estateSettled: !n.alive };
    // Initial residents are adults at the first tick; no invented historical events.
    if (n.life.bornTick === 0 && n.identity.age > 0 && !n.life.parentIds.length) n.life.bornTick = w.tick - n.identity.age * YEAR_TICKS;
    n.settlementId ??= 'v0';
  }
}
function expandMap(w: WorldState) {
  if (w.width >= 128 && w.height >= 72) return;
  const old = w.tiles, width = w.width, height = w.height;
  w.width = 128; w.height = 72;
  w.tiles = Array.from({ length: w.width * w.height }, (_, i) => {
    const x = i % w.width, y = Math.floor(i / w.width);
    return x < width && y < height ? old[y * width + x] : y % 24 === 12 || x % 32 === 16 ? 'path' : 'grass';
  });
}
function addVillage(w: WorldState): Settlement {
  expandMap(w);
  const i = w.civilization.settlements.length, x = (i % 4) * 32 + 16, y = Math.floor(i / 4) * 24 + 12;
  const v: Settlement = { id: `v${i}`, name: ['느티마을', '강너머마을', '들녘마을', '솔바람마을'][i % 4] + (i >= 4 ? String(Math.floor(i / 4) + 1) : ''), center: { x, y }, foundedAt: w.tick, storage: { food: 0, wood: 0 }, market: { food: 0, wood: 0, coins: 0, foodPrice: 3, woodPrice: 2 } };
  w.civilization.settlements.push(v);
  const specs: [Building['kind'], number, number][] = [['storage', 0, -2], ['market', 1, 2], ['well', -4, -1], ['farm', 5, -5], ['home', -7, -6], ['home', -3, -7], ['home', 2, -8], ['home', -9, 4], ['home', -5, 6], ['home', 4, 6]];
  for (const [kind, dx, dy] of specs) {
    const position = { x: x + dx, y: y + dy };
    w.buildings.push({ id: `c${w.nextId++}`, kind, name: `${v.name} ${kind === 'home' ? '집' : kind === 'farm' ? '농장' : kind === 'well' ? '우물' : kind === 'market' ? '시장' : '창고'}`, position, level: 1, growth: kind === 'farm' ? 30 : 0, settlementId: v.id, ...(kind === 'home' ? { ownerIds: [] } : {}) });
    w.tiles[position.y * w.width + position.x] = kind === 'farm' ? 'farm' : 'grass';
  }
  for (let j = 0; j < 14; j++) {
    const position = { x: x - 12 + j % 7 * 2, y: y + 8 + Math.floor(j / 7) * 2 };
    w.resources.push({ id: `r-new-${w.nextId++}`, position, kind: j % 2 ? 'wood' : 'food', amount: 8, capacity: 24 });
  }
  return v;
}
export function populateSettlements(w: WorldState) {
  const count = Math.min(12, Math.ceil(w.npcs.length / 36));
  while (w.civilization.settlements.length < count) addVillage(w);
  if (count === 1) return;
  for (const b of w.buildings) if (b.kind === 'home') b.ownerIds = [];
  w.npcs.forEach((n, i) => {
    const v = w.civilization.settlements[i % count], homes = w.buildings.filter(b => b.kind === 'home' && b.settlementId === v.id), home = homes[Math.floor(i / count) % homes.length];
    n.settlementId = v.id; n.homeId = home.id; n.position = { ...home.position }; home.ownerIds!.push(n.id);
  });
  // Initial endowments are part of opening accounts, never runtime production.
  for (const v of w.civilization.settlements.slice(1)) { v.storage.food = 28; v.storage.wood = 12; v.market.food = 20; v.market.coins = 180; }
}
export function isTravelling(w: WorldState, n: NPC) { return w.civilization.journeys.some(j => j.kind === 'migration' && j.npcIds.includes(n.id)); }
export function startMigration(w: WorldState, n: NPC, to: Settlement, causeId?: string): boolean {
  if (!n.alive || n.identity.age < 18 || n.settlementId === to.id || isTravelling(w, n)) return false;
  const group = w.npcs.filter(p => p.alive && p.settlementId === n.settlementId && (p.id === n.id || p.id === n.life.partnerId || p.identity.age < 18 && p.life.parentIds.includes(n.id)));
  if (group.some(p => isTravelling(w, p))) return false;
  const home = w.buildings.find(b => b.kind === 'home' && b.settlementId === to.id && w.npcs.filter(p => p.alive && p.homeId === b.id).length + w.civilization.journeys.filter(j => j.homeId === b.id).reduce((s, j) => s + j.npcIds.length, 0) + group.length <= capacity(b));
  const path = home && findPath(w, n.position, home.position);
  if (!home || !path || group.some(p => distance(p.position, n.position) > 8 || !findPath(w, p.position, home.position))) return false;
  const e = appendEvent(w, { kind: 'migration', actorId: n.id, participants: group.map(p => p.id), importance: 60, causeId, locationId: home.id, description: `${n.identity.name}의 가족 ${group.length}명이 주거와 식량 여건을 따라 ${to.name}으로 이주를 시작했다.`, data: { from: n.settlementId, to: to.id, distance: path.length, phase: 'departed' } });
  // Each member follows an actual route from their own tile in the usual movement system.
  for (const p of group) {
    const ownPath = findPath(w, p.position, home.position)!;
    w.civilization.journeys.push({ id: `j${w.nextId++}`, kind: 'migration', from: p.settlementId, to: to.id, npcIds: [p.id], path: ownPath, progress: 0, food: 0, coins: 0, homeId: home.id, sourceEventId: e.id });
    p.currentAction = undefined; p.life.lastMove = w.tick;
  }
  return true;
}
export function advanceJourneys(w: WorldState) {
  for (const j of [...w.civilization.journeys]) {
    const moving = j.npcIds.map(id => w.npcs.find(n => n.id === id)!).filter(n => n.alive);
    if (j.progress < j.path.length) { const p = j.path[j.progress++]; moving.forEach(n => { n.position = { ...p }; }); }
    if (j.progress < j.path.length && (j.kind === 'trade' || moving.length)) continue;
    if (j.kind === 'trade') {
      market(w, j.to).food += j.food; market(w, j.from).coins += j.coins;
      w.economy.totals.trades++; w.economy.totals.tradeVolume += j.food;
      appendEvent(w, { kind: 'caravan', importance: 45, causeId: j.sourceEventId, description: `${j.from} → ${j.to} 교역이 도착했다. 식량 ${j.food}개와 대금 ${j.coins}코인을 인도했다.`, data: { from: j.from, to: j.to, food: j.food, coins: j.coins, phase: 'arrived' } });
    } else for (const n of moving) {
      n.settlementId = j.to; n.homeId = j.homeId!; n.currentAction = undefined;
      const home = w.buildings.find(b => b.id === n.homeId)!; home.ownerIds ??= []; if (!home.ownerIds.length) home.ownerIds.push(n.id);
      appendEvent(w, { kind: 'migration', actorId: n.id, locationId: home.id, importance: 55, causeId: j.sourceEventId, description: `${n.identity.name}이 새 마을의 집에 도착했다. 소지품과 재산을 그대로 옮겼다.`, data: { from: j.from, to: j.to, phase: 'arrived' } });
    }
    w.civilization.journeys = w.civilization.journeys.filter(p => p.id !== j.id);
  }
}
export function startTrade(w: WorldState, from: Settlement, to: Settlement): boolean {
  if (from.id === to.id || w.civilization.journeys.some(j => j.kind === 'trade' && j.from === from.id && j.to === to.id)) return false;
  const seller = market(w, from.id), buyer = market(w, to.id), reserve = residents(w, from.id).length * 2;
  const amount = Math.min(12, Math.max(0, seller.food - reserve), Math.floor(buyer.coins / seller.foodPrice));
  if (!amount || buyer.food >= Math.max(6, residents(w, to.id).length) || seller.foodPrice > buyer.foodPrice) return false;
  const path = findPath(w, from.center, to.center); if (!path) return false;
  const cost = amount * seller.foodPrice; seller.food -= amount; buyer.coins -= cost;
  const e = appendEvent(w, { kind: 'caravan', importance: 45, description: `${from.name}의 여분 식량 ${amount}개를 ${to.name}에 ${cost}코인으로 교역한다. 도착 전까지 화물과 대금은 운송 중이다.`, data: { from: from.id, to: to.id, food: amount, coins: cost, phase: 'departed', distance: path.length } });
  w.civilization.journeys.push({ id: `j${w.nextId++}`, kind: 'trade', from: from.id, to: to.id, npcIds: [], path, progress: 0, food: amount, coins: cost, sourceEventId: e.id });
  return true;
}
export function buildHouse(w: WorldState, v: Settlement, kind: 'home' | 'farm' = 'home'): Building | undefined {
  const cost = kind === 'home' ? 12 : 16;
  const stock = stocks(w, v.id); if (stock.wood < cost) return;
  const occupied = new Set([...w.buildings, ...w.resources].map(b => `${b.position.x},${b.position.y}`));
  for (let dy = -9; dy <= 8; dy += 3) for (let dx = -10; dx <= 10; dx += 3) {
    const p = { x: v.center.x + dx, y: v.center.y + dy };
    if (p.x < 0 || p.y < 0 || p.x >= w.width || p.y >= w.height || occupied.has(`${p.x},${p.y}`) || w.tiles[p.y * w.width + p.x] !== 'grass' || !findPath(w, v.center, p)) continue;
    stock.wood -= cost; w.economy.totals.investedWood += cost;
    const b: Building = { id: `c${w.nextId++}`, kind, name: `${v.name} ${kind === 'home' ? '새집' : '새 농장'}`, position: p, level: 1, growth: 0, settlementId: v.id, ownerIds: [] }; w.buildings.push(b);
    if (kind === 'farm') { delete b.ownerIds; w.tiles[p.y * w.width + p.x] = 'farm'; }
    appendEvent(w, { kind: 'construction', locationId: b.id, importance: 50, description: `${v.name}이 주거 부족에 대응하여 공동 목재 ${cost}개로 ${kind === 'home' ? capacity(b) + '인 주택' : '생산 농장'}을 지었다.`, data: { wood: cost, settlementId: v.id, capacity: kind === 'home' ? capacity(b) : 0 } });
    return b;
  }
}
export function regionalDay(w: WorldState) {
  for (const v of [...w.civilization.settlements]) {
    const people = residents(w, v.id), stock = stocks(w, v.id), m = market(w, v.id);
    if (v.id !== 'v0') {
      const need = people.length * 3, supply = stock.food + m.food + people.reduce((s, n) => s + n.inventory.food, 0);
      m.foodPrice += Math.sign(Math.max(1, Math.min(12, Math.round(3 * need / Math.max(1, supply)))) - m.foodPrice);
    }
    const homes = w.buildings.filter(b => b.kind === 'home' && b.settlementId === v.id);
    const beds = homes.reduce((s, b) => s + capacity(b), 0);
    if (people.length >= beds - 2) buildHouse(w, v);
    // Production capacity grows through investment when the settlement is crowded.
    const farms = w.buildings.filter(b => b.kind === 'farm' && b.settlementId === v.id);
    if (people.length > farms.length * 12 && stock.wood >= 16) {
      buildHouse(w, v, 'farm');
    }
    if (people.length >= 16 && stock.wood >= 60 && stock.food >= 24 && w.civilization.settlements.length < 12) {
      const next = addVillage(w); stock.wood -= 60; w.economy.totals.investedWood += 60; stock.food -= 24; next.storage.food += 24;
      const coins = Math.min(30, m.coins); m.coins -= coins; next.market.coins += coins;
      const e = appendEvent(w, { kind: 'settlement', importance: 60, description: `${v.name}이 목재 60개를 투자해 ${next.name}을 세우고 식량 24개·시장 기금 ${coins}코인을 옮겼다.`, data: { from: v.id, to: next.id, wood: 60, food: 24, coins } }); next.sourceEventId = e.id;
      const founder = people.find(n => n.identity.age >= 18 && !isTravelling(w, n)); if (founder) startMigration(w, founder, next, e.id);
    }
    for (const to of w.civilization.settlements) if (to.id !== v.id) startTrade(w, v, to);
    const crowded = people.length > beds || stock.food + m.food < people.length;
    if (crowded) {
      const migrant = people.find(n => n.identity.age >= 18 && w.tick - n.life.lastMove > YEAR_TICKS && !isTravelling(w, n));
      const better = w.civilization.settlements.find(other => other.id !== v.id && stocks(w, other.id).food + market(w, other.id).food > residents(w, other.id).length * 2);
      if (migrant && better) startMigration(w, migrant, better);
    }
    // Labour follows actual local vacancies; retained skill records experience.
    if (w.tick % YEAR_TICKS === 0) for (const n of people.filter(n => n.identity.age >= 18 && !isTravelling(w, n))) {
      const farmers = people.filter(p => p.occupation === 'farmer').length;
      const job = farmers < people.length / 3 ? 'farmer' : stock.wood < 12 && !people.some(p => p.occupation === 'woodcutter') ? 'woodcutter' : n.occupation;
      if (job !== n.occupation) { const previous = n.occupation; n.occupation = job; appendEvent(w, { kind: 'occupation', actorId: n.id, importance: 40, description: `${n.identity.name}이 마을의 생산 수요에 따라 직업을 바꾸었다.`, data: { previous, occupation: job, settlementId: v.id } }); }
    }
  }
}
