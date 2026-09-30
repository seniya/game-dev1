import { canWork, syncEmployment } from './employment';
import { initializeLiving, homeProfile } from './living';
import { accord, harvest } from './heritage';
import type { WorldState, NPC, Building } from './types';
import { EXTRA_RECIPES, isGrowingIndustry, GOODS, INDUSTRY_SKILL, INDUSTRY_JOB, GOOD_PRICES, INDUSTRIES, SERVICES, emptyGoods, INDUSTRY_LABELS, GOOD_LABELS, SERVICE_LABELS, type Industry, type Citizen, type City, type Service, type Good } from './urban-types';
import { stocks, market, capacity, isTravelling, startMigration } from './civilization';
import { appendEvent, eventById } from './social';
import { clamp, random, distance } from './random';
import { findPath } from './pathfinding';

export function newCitizen(n: NPC): Citizen {
  return { education: 0, nutrition: 65, stress: 10, housing: 70, trust: 50, disease: 0, injury: 0, preference: Math.round(n.personality.sociability), skills: { field: n.life.skill, quarry: 0, mine: 0, mill: 0, smith: 0 }, income: 0, expenses: 0 };
}
export function initializeUrban(w: WorldState) {
  w.urban ??= { since: w.tick, citizens: {}, cities: [], enterprises: [], freight: [], buildings: {}, ledger: { opening: emptyGoods(), produced: emptyGoods(), consumed: emptyGoods() }, samples: [] };
  for (const n of w.npcs) w.urban.citizens[n.id] ??= newCitizen(n);
  for (const b of w.buildings) w.urban.buildings[b.id] ??= { condition: 100, maintenance: b.kind === 'home' ? 1 : 2 };
  for (const v of w.civilization.settlements) if (!w.urban.cities.some(c => c.settlementId === v.id)) {
    const i = Number(v.id.slice(1)), ore = 600 + ((w.seed + i * 197) % 5) * 300, stone = 1200 + ((w.seed + i * 137) % 4) * 400;
    w.urban.cities.push({ settlementId: v.id, fertility: 45 + (w.seed + i * 29) % 56, deposits: { ore, stone, clay: 1200, salt: 800 }, initialDeposits: { ore, stone, clay: 1200, salt: 800 }, goods: emptyGoods(), treasury: 0, taxRate: 10, priority: 'water', services: { road: 0, water: 0, sanitation: 0, clinic: 0, school: 0 }, active: { road: 0, water: 0, sanitation: 0, clinic: 0, school: 0 }, pollution: 0, collected: 0, spent: 0 });
  }
  if (w.version === 7) initializeLiving(w);
}
export function city(w: WorldState, id: string) { return w.urban.cities.find(c => c.settlementId === id)!; }
export function cityMetrics(w: WorldState, id: string) {
  const people = w.npcs.filter(n => n.alive && n.settlementId === id), adults = people.filter(n => n.identity.age >= 18);
  const homes = w.buildings.filter(b => b.kind === 'home' && b.settlementId === id);
  const beds = homes.reduce((s, b) => s + capacity(b), 0), c = city(w, id);
  const employed = adults.filter(n => w.urban.citizens[n.id]?.employer).length;
  const jobs = w.urban.enterprises.filter(e => e.settlementId === id).reduce((s, e) => s + e.capacity - e.workers.length, 0);
  const total = (key: 'stress' | 'trust' | 'housing') => people.reduce((s, n) => s + (w.urban.citizens[n.id]?.[key] ?? 0), 0) / Math.max(1, people.length);
  const food = stocks(w, id).food + market(w, id).food + people.reduce((s, n) => s + n.inventory.food, 0);
  return { population: people.length, beds, vacant: Math.max(0, beds - people.length), employed, adults: adults.length, jobs, food, stress: total('stress'), trust: total('trust'), housing: total('housing'), sick: people.filter(n => w.urban.citizens[n.id]?.disease > 0).length, stage: people.length >= 150 && w.urban.enterprises.filter(e => e.settlementId === id).length >= 4 && c.services.water > 0 ? '도시' : people.length >= 60 ? '읍' : '마을' };
}
export function setPolicy(w: WorldState, id: string, taxRate: number, priority: Service, causeId?: string) {
  if (!Number.isInteger(taxRate) || taxRate < 0 || taxRate > 30 || !SERVICES.includes(priority) || !w.civilization.settlements.some(v => v.id === id)) throw new Error('도시 정책 값이 올바르지 않습니다.');
  initializeUrban(w); const c = city(w, id), previous = c.taxRate;
  c.taxRate = taxRate; c.priority = priority;
  c.policyEventId = c.lastEventId = appendEvent(w, { kind: 'policy', importance: 60, causeId, description: `${id}의 세율을 ${taxRate}%로, 공공투자 우선순위를 ${SERVICE_LABELS[priority]}로 변경했다.`, data: { settlementId: id, previous, taxRate, priority } }).id;
}
function site(w: WorldState, id: string): { x: number; y: number } | undefined {
  const v = w.civilization.settlements.find(v => v.id === id)!;
  const taken = new Set([...w.buildings, ...w.resources].map(b => `${b.position.x},${b.position.y}`));
  for (let y = -10; y < 10; y += 2) for (let x = -12; x < 11; x += 2) {
    const p = { x: v.center.x + x, y: v.center.y + y };
    if (p.x < 0 || p.y < 0 || p.x >= w.width || p.y >= w.height || taken.has(`${p.x},${p.y}`) || w.tiles[p.y * w.width + p.x] !== 'grass' || !findPath(w, v.center, p)) continue;
    return p;
  }
}
export function buildEnterprise(w: WorldState, id: string, kind: Industry) {
  initializeUrban(w); const c = city(w, id), stock = stocks(w, id);
  if (!c || !INDUSTRIES.includes(kind) || stock.wood < 8 || w.urban.enterprises.filter(e => e.settlementId === id).length >= 40) return;
  const position = site(w, id); if (!position) return;
  stock.wood -= 8; w.economy.totals.investedWood += 8;
  const b: Building = { id: `c${w.nextId++}`, kind: isGrowingIndustry(kind) ? 'farm' : 'market', name: INDUSTRY_LABELS[kind], position, level: 1, growth: isGrowingIndustry(kind) ? 20 : 0, settlementId: id };
  w.buildings.push(b); w.urban.buildings[b.id] = { condition: 100, maintenance: 2 };
  if (isGrowingIndustry(kind)) w.tiles[position.y * w.width + position.x] = 'farm';
  const e = appendEvent(w, { kind: 'construction', locationId: b.id, importance: 50, description: `${id} 공동체가 목재 8개로 ${INDUSTRY_LABELS[kind]}을 건설했다.`, data: { settlementId: id, industry: kind, wood: 8 } });
  const enterprise = { id: `u${w.nextId++}`, settlementId: id, buildingId: b.id, kind, capacity: 4, wage: 2, workers: [] as string[], output: 0, sourceEventId: e.id };
  w.urban.enterprises.push(enterprise); return enterprise;
}
export function canProduce(w: WorldState, n: NPC) {
  const e = w.urban.enterprises.find(e => e.id === w.urban.citizens[n.id]?.employer);
  if (!e || e.settlementId !== n.settlementId || !e.workers.includes(n.id) || !canWork(w, n) || isTravelling(w, n)) return;
  const c = city(w, e.settlementId), b = w.buildings.find(b => b.id === e.buildingId)!;
  if (market(w, e.settlementId).coins + c.treasury < e.wage || w.urban.buildings[b.id].condition < 20 || n.needs.health < 40) return;
  if (e.kind === 'field' && b.growth < 2 || e.kind === 'mine' && c.deposits.ore < 1 || e.kind === 'quarry' && c.deposits.stone < 1 || e.kind === 'mill' && c.goods.grain < 2 || e.kind === 'smith' && (c.goods.ore < 2 || stocks(w, e.settlementId).wood < 1)) return;
  if ((e.kind === 'garden' && b.growth < 2) || (e.kind === 'weaving' && c.goods.fiber < 2) || (e.kind === 'tailoring' && c.goods.cloth < 2) || (e.kind === 'kitchen' && (c.goods.grain < 2 || c.goods.herbs < 1)) || (e.kind === 'joinery' && (stocks(w, n.settlementId).wood < 3 || c.goods.tools < 1))) return;
  const recipe = EXTRA_RECIPES[e.kind];
  if (recipe && ((recipe.growth && b.growth < recipe.growth) || (recipe.wood && stocks(w, n.settlementId).wood < recipe.wood) || (recipe.deposit && c.deposits[recipe.deposit] < (recipe.outputs[recipe.deposit] ?? 0)) || Object.entries(recipe.inputs).some(([g, amount]) => c.goods[g as Good] < amount))) return;
  return { e, c, b };
}
export function industryWork(w: WorldState, n: NPC): boolean {
  const job = canProduce(w, n); if (!job || distance(n.position, job.b.position) !== 0) return false;
  const { e, c, b } = job, u = w.urban.citizens[n.id], m = market(w, n.settlementId);
  let amount = 1 + Math.floor((u.skills[INDUSTRY_SKILL[e.kind]] + u.education * .3) / 35), output: string = e.kind;
  const consume = (key: Good, amount: number) => { c.goods[key] -= amount; w.urban.ledger.consumed[key] += amount; };
  if (e.kind === 'field') { amount = Math.min(Math.floor(b.growth), Math.max(1, Math.round(amount * 2 * c.fertility / 45))); b.growth -= amount; harvest(w, e.settlementId, amount); c.goods.grain += amount; w.urban.ledger.produced.grain += amount; output = 'grain'; }
  if (e.kind === 'mine' || e.kind === 'quarry') { const key = e.kind === 'mine' ? 'ore' : 'stone'; amount = Math.min(amount, c.deposits[key]); c.deposits[key] -= amount; c.goods[key] += amount; w.urban.ledger.produced[key] += amount; c.pollution = clamp(c.pollution + .1); output = key; }
  if (e.kind === 'mill') { consume('grain', 2); amount = 3; m.food += amount; w.economy.totals.producedFood += amount; output = 'food'; }
  if (e.kind === 'smith') { consume('ore', 2); stocks(w, n.settlementId).wood--; w.economy.totals.investedWood++; amount = 1; c.goods.tools++; w.urban.ledger.produced.tools++; output = 'tools'; c.pollution = clamp(c.pollution + .15); }
  if (e.kind === 'garden') { amount = 2; b.growth -= 2; harvest(w, e.settlementId, 2); for (const g of ['herbs', 'fiber'] as const) { c.goods[g]++; w.urban.ledger.produced[g]++; } output = 'herbs'; }
  const recipes = { weaving: { input: 'fiber', output: 'cloth' }, tailoring: { input: 'cloth', output: 'clothes' }, kitchen: { input: 'grain', output: 'meals' } } as const;
  if (e.kind === 'weaving' || e.kind === 'tailoring' || e.kind === 'kitchen') { const recipe = recipes[e.kind]; consume(recipe.input, 2); if (e.kind === 'kitchen') consume('herbs', 1); amount = e.kind === 'kitchen' ? 2 : 1; c.goods[recipe.output] += amount; w.urban.ledger.produced[recipe.output] += amount; output = recipe.output; }
  if (e.kind === 'joinery') { consume('tools', 1); stocks(w, n.settlementId).wood -= 3; w.economy.totals.investedWood += 3; amount = 1; c.goods.furniture++; w.urban.ledger.produced.furniture++; output = 'furniture'; }
  const recipe = EXTRA_RECIPES[e.kind];
  if (recipe) {
    for (const [good, quantity] of Object.entries(recipe.inputs)) consume(good as Good, quantity);
    if (recipe.growth) { b.growth -= recipe.growth; harvest(w, e.settlementId, recipe.growth); }
    if (recipe.wood) { stocks(w, e.settlementId).wood -= recipe.wood; w.economy.totals.investedWood += recipe.wood; }
    if (recipe.deposit) c.deposits[recipe.deposit] -= recipe.outputs[recipe.deposit]!;
    amount = 0;
    for (const [good, quantity] of Object.entries(recipe.outputs)) { c.goods[good as Good] += quantity; w.urban.ledger.produced[good as Good] += quantity; amount += quantity; }
    output = Object.keys(recipe.outputs)[0];
  }
  const publicWage = Math.max(0, e.wage - m.coins), tax = Math.floor(e.wage * c.taxRate / 100); m.coins -= e.wage - publicWage; c.treasury -= publicWage; c.spent += publicWage; n.wealth += e.wage - tax; c.treasury += tax; c.collected += tax; u.income += e.wage - tax; w.economy.totals.wages += e.wage;
  w.living.people[n.id].desires.mastery = clamp(w.living.people[n.id].desires.mastery - 3);
  u.skills[INDUSTRY_SKILL[e.kind]] = clamp(u.skills[INDUSTRY_SKILL[e.kind]] + .3); e.output += amount; w.urban.buildings[b.id].condition = Math.max(0, w.urban.buildings[b.id].condition - .05);
  if ((e.kind === 'mine' || e.kind === 'quarry') && random(w) < .002) { u.injury = clamp(u.injury + 12); u.healthEventId = appendEvent(w, { kind: 'health', actorId: n.id, importance: 60, description: `${n.identity.name}이 작업 중 다쳐 휴식과 진료가 필요하다.`, data: { settlementId: n.settlementId, industry: e.kind } }).id; }
  appendEvent(w, { kind: 'industry', actorId: n.id, locationId: b.id, causeId: e.sourceEventId, importance: 25, description: `${n.identity.name}이 ${INDUSTRY_LABELS[e.kind]}에서 ${e.kind === 'garden' ? '약초·섬유 합계' : recipe ? Object.keys(recipe.outputs).map(g => GOOD_LABELS[g as Good]).join('·') + ' 합계' : output === 'food' ? '가공식품' : GOOD_LABELS[output as Good]} ${amount}개를 생산하고 임금 ${e.wage - tax}코인을 받았다.${publicWage ? ` 공공예산이 ${publicWage}코인을 부담했다.` : ''}`, data: { settlementId: n.settlementId, industry: e.kind, output, amount, wage: e.wage, tax, publicWage } });
  return true;
}
export function useTool(w: WorldState, n: NPC): number {
  const c = city(w, n.settlementId); if (!c?.goods.tools || c.goods.tools <= 1 && w.urban.enterprises.some(e => e.settlementId === n.settlementId && e.kind === 'joinery')) return 0;
  c.goods.tools--; w.urban.ledger.consumed.tools++; return 2;
}
export function startFreight(w: WorldState, from: string, to: string, good: Good): boolean {
  const relation = accord(w, from, to); if (relation?.status === 'dispute') return false;
  const a = city(w, from), b = city(w, to); if (!a || !b || from === to || w.urban.freight.some(f => f.from === from && f.to === to && f.good === good)) return false;
  const vs = w.civilization.settlements, path = findPath(w, vs.find(v => v.id === from)!.center, vs.find(v => v.id === to)!.center); if (!path) return false;
  const fee = Math.max(1, Math.ceil(path.length / (16 * (1 + a.active.road))) - (relation?.status === 'cooperation' ? 1 : 0)), buyer = market(w, to);
  const price = GOOD_PRICES[good], amount = Math.min(8 + a.active.road * 4, Math.max(0, a.goods[good] - 4), Math.floor((buyer.coins - fee) / price));
  if (amount <= 0 || b.goods[good] >= 4) return false;
  const carrier = w.npcs.find(n => canWork(w, n) && n.settlementId === from && !isTravelling(w, n)); if (!carrier) return false;
  a.goods[good] -= amount; buyer.coins -= amount * price + fee; carrier.wealth += fee; w.urban.citizens[carrier.id].income += fee;
  const e = appendEvent(w, { kind: 'freight', actorId: carrier.id, causeId: relation?.lastEventId, importance: 45, description: `${from} → ${to}: ${GOOD_LABELS[good]} ${amount}개를 운송한다. 운임 ${fee}코인, 거리 ${path.length}칸.`, data: { from, to, good, amount, fee, phase: 'departed' } });
  w.urban.freight.push({ id: `u${w.nextId++}`, from, to, good, amount, coins: amount * price, fee, path, progress: 0, sourceEventId: e.id });
  return true;
}
export function advanceFreight(w: WorldState) {
  for (const f of [...w.urban.freight]) {
    f.progress = Math.min(f.path.length, f.progress + 1 + city(w, f.from).active.road);
    if (f.progress < f.path.length) continue;
    city(w, f.to).goods[f.good] += f.amount; market(w, f.from).coins += f.coins;
    const delivered = appendEvent(w, { kind: 'freight', causeId: f.sourceEventId, importance: 45, description: `${f.from} → ${f.to}: ${GOOD_LABELS[f.good]} ${f.amount}개와 대금 ${f.coins}코인을 인도했다.`, data: { from: f.from, to: f.to, good: f.good, amount: f.amount, phase: 'arrived' } });
    const relation = accord(w, f.from, f.to); if (relation) { relation.deliveries++; relation.deliveryEventId = delivered.id; }
    w.urban.freight = w.urban.freight.filter(x => x.id !== f.id);
  }
}
export function urbanBalance(w: WorldState) {
  return Object.fromEntries(GOODS.map(g => [g, w.urban.cities.reduce((s, c) => s + c.goods[g], 0) + w.urban.freight.filter(f => f.good === g).reduce((s, f) => s + f.amount, 0) - w.urban.ledger.opening[g] - w.urban.ledger.produced[g] + w.urban.ledger.consumed[g]]));
}
export function urbanDay(w: WorldState) {
  initializeUrban(w);
  for (const n of w.npcs) syncEmployment(w, n);
  const byId = new Map(w.npcs.map(n => [n.id, n]));
  for (const e of w.urban.enterprises) e.workers = e.workers.filter(id => { const n = byId.get(id); return n && canWork(w, n) && n.settlementId === e.settlementId && !isTravelling(w, n); });
  for (const n of w.npcs) { const u = w.urban.citizens[n.id]; u.income = 0; u.expenses = 0; if (!w.urban.enterprises.some(e => e.workers.includes(n.id))) delete u.employer; }
  for (const c of w.urban.cities) {
    const id = c.settlementId, people = w.npcs.filter(n => n.alive && n.settlementId === id), adults = people.filter(n => n.identity.age >= 18 && !isTravelling(w, n));
    const stock = stocks(w, id), m = market(w, id), buildings = w.buildings.filter(b => b.settlementId === id);
    // Households pay rent to living owners, never minting money or deleting unpaid debt.
    let taxTotal = 0, rentTotal = 0;
    const occupancy = new Map<string, number>(); for (const n of people) occupancy.set(n.homeId, (occupancy.get(n.homeId) ?? 0) + 1);
    for (const n of people) {
      const u = w.urban.citizens[n.id], home = buildings.find(b => b.id === n.homeId)!;
      const owner = home.ownerIds?.map(id => byId.get(id)).find(p => p?.alive);
      if (owner && !home.ownerIds!.includes(n.id) && n.identity.age >= 18 && n.wealth > 0) { const rent = Math.min(n.wealth, homeProfile(w, n).rent); n.wealth -= rent; owner.wealth += rent; u.expenses += rent; w.urban.citizens[owner.id].income += rent; rentTotal += rent; }
      const tax = n.identity.age >= 18 ? Math.min(n.wealth, Math.floor(Math.max(0, n.wealth - 10) * c.taxRate / 100)) : 0;
      n.wealth -= tax; u.expenses += tax; taxTotal += tax;
      const condition = w.urban.buildings[home.id].condition;
      const residence = homeProfile(w, n), lifestyle = w.living.people[n.id];
      u.housing = clamp(45 + residence.comfort * .4 + residence.privacy * lifestyle.traits.independence / 500 + lifestyle.furnishings * .15 - Math.max(0, (occupancy.get(home.id) ?? 0) - capacity(home)) * 15 - (100 - condition) * .5);
    }
    c.treasury += taxTotal; c.collected += taxTotal;
    if (taxTotal || rentTotal) c.lastEventId = appendEvent(w, { kind: 'tax', importance: 40, causeId: c.policyEventId, description: `${id}: 생활비 10코인을 제외한 성인 재산에 ${c.taxRate}% 세율을 적용해 ${taxTotal}코인 징수. 임대료 ${rentTotal}코인은 소유자에게 이전했다.`, data: { settlementId: id, tax: taxTotal, rent: rentTotal, treasury: c.treasury } }).id;
    // Existing funds pay construction and service labour; materials are consumed explicitly.
    const eligible = adults.filter(n => canWork(w, n)), worker = eligible[Math.floor(w.tick / 144) % Math.max(1, eligible.length)], service = c.priority;
    if (worker && c.services[service] < 3 && c.treasury >= 12 && stock.wood >= 4 && c.goods.stone >= 2) {
      c.treasury -= 12; c.spent += 12; w.economy.totals.wages += 12; worker.wealth += 12; w.urban.citizens[worker.id].income += 12; stock.wood -= 4; w.economy.totals.investedWood += 4; c.goods.stone -= 2; w.urban.ledger.consumed.stone += 2; c.services[service]++;
      c.lastEventId = appendEvent(w, { kind: 'public_service', actorId: worker.id, importance: 55, causeId: c.lastEventId, description: `${id}이 ${SERVICE_LABELS[service]} ${c.services[service]}단계에 예산 12코인·목재 4개·석재 2개를 투자했다.`, data: { settlementId: id, service, level: c.services[service], coins: 12, wood: 4, stone: 2 } }).id;
      c.priority = SERVICES[(SERVICES.indexOf(service) + 1) % SERVICES.length];
    }
    for (const s of SERVICES) {
      c.active[s] = 0; const cost = c.services[s];
      if (!worker || !cost || c.treasury < cost) continue;
      c.treasury -= cost; c.spent += cost; w.economy.totals.wages += cost; worker.wealth += cost; w.urban.citizens[worker.id].income += cost; c.active[s] = cost;
    }
    for (const b of buildings) {
      const maintenance = w.urban.buildings[b.id]; maintenance.condition = Math.max(0, maintenance.condition - .3);
      if (worker && maintenance.condition < 80 && c.treasury >= maintenance.maintenance && stock.wood > 0) {
        c.treasury -= maintenance.maintenance; c.spent += maintenance.maintenance; w.economy.totals.wages += maintenance.maintenance; worker.wealth += maintenance.maintenance; w.urban.citizens[worker.id].income += maintenance.maintenance; stock.wood--; w.economy.totals.investedWood++; maintenance.condition = Math.min(100, maintenance.condition + 15);
      }
    }
    const existing = w.urban.enterprises.filter(e => e.settlementId === id);
    if (people.length >= 12 && stock.wood >= 8) {
      const order: Industry[] = c.fertility >= 70 ? ['field', 'mill', 'quarry', 'mine', 'smith'] : ['quarry', 'mine', 'smith', 'field', 'mill'];
      order.push('garden', 'weaving', 'tailoring', 'kitchen', 'joinery', ...Object.keys(EXTRA_RECIPES) as Industry[]);
      const missing = order.find(k => !existing.some(e => e.kind === k));
      if (missing) buildEnterprise(w, id, missing);
      else if (existing.length < Math.min(40, Math.floor(people.length / 10)) && m.food < people.length * 2) buildEnterprise(w, id, existing.filter(e => e.kind === 'field').length <= existing.filter(e => e.kind === 'mill').length ? 'field' : 'mill');
    }
    const localJobs = w.urban.enterprises.filter(e => e.settlementId === id);
    // Rotate scarce workers every three days; keep grain production staffed to supply downstream recipes.
    if (localJobs.length > adults.filter(n => canWork(w, n)).length && localJobs.length && Math.floor(w.tick / 144) % 3 === 0) {
      for (const e of localJobs) { for (const id of e.workers) delete w.urban.citizens[id].employer; e.workers = []; }
      localJobs.push(...localJobs.splice(0, (Math.floor(w.tick / 432) * Math.max(1, adults.filter(n => canWork(w, n)).length - 1)) % localJobs.length));
      const field = localJobs.findIndex(e => e.kind === 'field');
      if (field >= 0) localJobs.unshift(...localJobs.splice(field, 1));
    }
    const staffing = Math.max(1, Math.floor(adults.filter(n => canWork(w, n)).length / Math.max(1, localJobs.length)));
    for (const e of localJobs) for (const released of e.workers.splice(Math.min(e.capacity, staffing))) delete w.urban.citizens[released].employer;
    for (const e of localJobs) {
      for (const n of adults.filter(n => canWork(w, n) && !w.urban.citizens[n.id].employer).sort((a, b) => (w.urban.citizens[b.id].skills[INDUSTRY_SKILL[e.kind]] + (b.occupation === INDUSTRY_JOB[e.kind] ? 40 : 0)) - (w.urban.citizens[a.id].skills[INDUSTRY_SKILL[e.kind]] + (a.occupation === INDUSTRY_JOB[e.kind] ? 40 : 0)))) {
        if (e.workers.length >= Math.min(e.capacity, staffing)) break;
        e.workers.push(n.id); w.urban.citizens[n.id].employer = e.id; n.occupation = INDUSTRY_JOB[e.kind];
        appendEvent(w, { kind: 'occupation', actorId: n.id, locationId: e.buildingId, importance: 40, causeId: e.sourceEventId, description: `${n.identity.name}이 ${INDUSTRY_LABELS[e.kind]}에 고용되었다. 작업 완료당 임금 ${e.wage}코인.`, data: { settlementId: id, employer: e.id, industry: e.kind, wage: e.wage } });
      }
    }
    c.pollution = clamp(c.pollution + people.length / 200 - c.active.sanitation * 2 - .2);
    let students = c.active.school * 20, patients = c.active.clinic * 20;
    for (const n of people) {
      const u = w.urban.citizens[n.id], sick = u.disease > 0;
      u.nutrition = clamp(u.nutrition + (n.needs.hunger < 55 ? 2 : -4));
      if (students > 0 && n.identity.age < 18) { u.education = clamp(u.education + 1); students--; }
      if (patients > 0 && (u.disease > 0 || u.injury > 0)) { u.disease = Math.max(0, u.disease - 3); u.injury = Math.max(0, u.injury - 4); patients--; }
      else { u.disease = Math.max(0, u.disease - .5); u.injury = Math.max(0, u.injury - 1); }
      if (!sick && random(w) < Math.max(0, (c.pollution + Math.max(0, people.length - 60) * .1 - c.active.water * 15 - c.active.sanitation * 15)) / 1000) {
        u.disease = 8; u.healthEventId = appendEvent(w, { kind: 'health', actorId: n.id, importance: 60, description: `${n.identity.name}이 지역의 밀집·위생 여건으로 병에 걸렸다.`, data: { settlementId: id, pollution: c.pollution, water: c.active.water, sanitation: c.active.sanitation } }).id;
      }
      u.stress = clamp(u.stress + (u.housing < 50 ? 3 : -1) + (u.nutrition < 40 ? 3 : 0) + (u.disease > 0 ? 2 : 0) + (n.identity.age >= 18 && !u.employer && n.wealth < 5 ? 2 : 0));
      u.trust = clamp(u.trust + (c.active.water + c.active.clinic + c.active.school) * .2 - c.taxRate * .03 - (u.stress > 60 ? 1 : 0));
      // Health stays positive here; the engine's normal death/estate path resolves lethal needs.
      n.needs.health = Math.max(.1, n.needs.health - u.disease * .15 - u.injury * .1);
      n.needs.fatigue = clamp(n.needs.fatigue + u.injury * .2 + u.stress * .02);
    }
    for (const other of w.urban.cities) if (other !== c) for (const good of GOODS) startFreight(w, id, other.settlementId, good);
    const metrics = cityMetrics(w, id);
    const migrant = adults.find(n => w.tick - n.life.lastMove > 1728 && (w.urban.citizens[n.id].stress > 60 || w.urban.citizens[n.id].housing < 50));
    if (migrant) {
      const destinations = w.civilization.settlements.filter(v => v.id !== id).map(v => ({ v, m: cityMetrics(w, v.id) })).filter(x => x.m.vacant > 2 && x.m.food > x.m.population && x.m.stress < metrics.stress).sort((a, b) => (b.m.jobs + b.m.housing / 10 - b.m.population * (100 - w.urban.citizens[migrant.id].preference) / 1000) - (a.m.jobs + a.m.housing / 10 - a.m.population * (100 - w.urban.citizens[migrant.id].preference) / 1000));
      if (destinations[0]) startMigration(w, migrant, destinations[0].v, c.lastEventId);
    }
    const evidence = w.events.slice(-2000).filter(e => e.data.settlementId === id && e.kind === 'industry').slice(-4).map(e => e.id);
    const causeId = c.lastEventId && eventById(w, c.lastEventId)?.kind !== 'urban' ? c.lastEventId : c.policyEventId;
    const event = appendEvent(w, { kind: 'urban', importance: 35, causeId, description: `${id} ${metrics.stage}: 주민 ${metrics.population}명, 사업체 고용 ${metrics.employed}명, 빈 주거 ${metrics.vacant}인, 예산 ${c.treasury}코인.`, data: { settlementId: id, evidence, ...metrics, treasury: c.treasury, pollution: c.pollution } });
    c.lastEventId = event.id;
    w.urban.samples.push({ tick: w.tick, settlementId: id, population: metrics.population, employed: metrics.employed, housing: metrics.beds, food: metrics.food, treasury: c.treasury, stress: metrics.stress, sick: metrics.sick, eventId: event.id });
  }
  w.urban.samples = w.urban.samples.slice(-1080);
}
