import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Simulation } from '../src/sim/engine';
import { buildEnterprise, urbanDay, industryWork, startFreight, advanceFreight, urbanBalance, city, setPolicy } from '../src/sim/urban';
import { createEconomy, balance, holdings } from '../src/sim/economy';
import { market, stocks } from '../src/sim/civilization';
import { compactWorld, initialWorld, applyCommand, commandSchema } from '../src/server/world';
import { newCitizen } from '../src/sim/urban';
import { type WorldState } from '../src/sim/types';
const valid = (w: WorldState) => Simulation.load(JSON.stringify(w));
function funded(population = 40) { const w = new Simulation(42, population).snapshot(); w.llm.enabled = false; for (const v of w.civilization.settlements) { stocks(w, v.id).wood = 200; market(w, v.id).coins = 2000; } w.economy = createEconomy(w); return w; }
function employ(w: WorldState, kind: Parameters<typeof buildEnterprise>[2]) {
  const e = buildEnterprise(w, 'v0', kind)!; assert.ok(e); const n = w.npcs.find(n => n.settlementId === 'v0' && !w.urban.citizens[n.id].employer)!;
  e.workers.push(n.id); w.urban.citizens[n.id].employer = e.id; n.position = { ...w.buildings.find(b => b.id === e.buildingId)!.position }; n.currentAction = undefined;
  return { e, n };
}
test('v3 migration preserves property and events without inventing past city records', () => {
  const old: any = new Simulation().snapshot(); old.version = 3; delete old.urban;
  const before = holdings(old), events = JSON.stringify(old.events), w = valid(old).snapshot();
  assert.equal(w.version, 6); assert.deepEqual(holdings(w), before); assert.equal(JSON.stringify(w.events), events); assert.deepEqual(w.urban.samples, []); assert.equal(w.urban.since, w.tick);
});
test('finite mining, tool crafting and milling conserve inputs, wages and production ledgers', () => {
  const w = funded(), money = holdings(w).coins;
  const mine = employ(w, 'mine'), smith = employ(w, 'smith'), field = employ(w, 'field'), mill = employ(w, 'mill');
  assert.equal(industryWork(w, smith.n), false, 'no ore cannot mint tools or wages');
  assert.equal(industryWork(w, mine.n), true); assert.equal(industryWork(w, mine.n), true);
  const wood = holdings(w).wood; assert.equal(industryWork(w, smith.n), true); assert.equal(holdings(w).wood, wood - 1); assert.equal(city(w, 'v0').goods.tools, 1);
  industryWork(w, field.n); industryWork(w, field.n); const food = holdings(w).food;
  assert.equal(industryWork(w, mill.n), true); assert.equal(holdings(w).food, food + 3);
  assert.equal(holdings(w).coins, money); assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(n => n === 0)); valid(w);
  const c = city(w, 'v0'); const remaining = c.deposits.ore; c.initialDeposits.ore -= remaining; c.deposits.ore = 0;
  const wealth = mine.n.wealth; assert.equal(industryWork(w, mine.n), false); assert.equal(mine.n.wealth, wealth); valid(w);
});
test('freight escrows goods and payment, charges real transport costs, and resumes exactly once', () => {
  const w = funded(72), a = city(w, 'v0'), b = city(w, 'v1');
  a.goods.grain = 20; w.urban.ledger.opening.grain = 20; const coins = holdings(w).coins;
  assert.equal(startFreight(w, 'v0', 'v1', 'grain'), true); assert.equal(startFreight(w, 'v0', 'v1', 'grain'), false); assert.equal(holdings(w).coins, coins);
  const loaded = valid(w).snapshot(); while (loaded.urban.freight.length) { loaded.tick++; advanceFreight(loaded); }
  assert.ok(city(loaded, b.settlementId).goods.grain > 0); assert.equal(holdings(loaded).coins, coins); assert.ok(Object.values(urbanBalance(loaded)).every(n => n === 0));
  advanceFreight(loaded); assert.equal(loaded.events.filter(e => e.kind === 'freight' && e.data.phase === 'arrived').length, 1); valid(loaded);
});
test('tax-funded services consume budgets and materials, fail closed without funds, and improve health and schooling', () => {
  const w = funded(12), c = city(w, 'v0'); c.goods.stone = 10; w.urban.ledger.opening.stone = 10;
  for (const n of w.npcs) n.wealth = 100; w.economy = createEconomy(w); const coins = holdings(w).coins;
  setPolicy(w, 'v0', 30, 'clinic'); w.tick = 144; urbanDay(w);
  assert.equal(c.services.clinic, 1); assert.equal(c.active.clinic, 1); assert.equal(c.treasury, c.collected - c.spent); assert.equal(holdings(w).coins, coins); assert.equal(c.goods.stone, 8);
  const child = w.npcs.find(n => n.settlementId === 'v0')!; child.identity.age = 12; child.life.bornTick = w.tick - 12 * 1728; w.urban.citizens[child.id] = newCitizen(child); w.urban.citizens[child.id].disease = 8;
  for (const e of w.urban.enterprises) e.workers = e.workers.filter(id => id !== child.id);
  setPolicy(w, 'v0', 30, 'school'); w.tick += 144; urbanDay(w);
  assert.equal(w.urban.citizens[child.id].education, 1); assert.equal(w.urban.citizens[child.id].disease, 5); valid(w);
  const poor = funded(); setPolicy(poor, 'v0', 0, 'clinic'); urbanDay(poor); assert.equal(city(poor, 'v0').services.clinic, 0); valid(poor);
});
test('building condition and payroll limit work; rent moves wealth to the living owner', () => {
  const w = funded(), { e, n } = employ(w, 'quarry');
  w.urban.buildings[e.buildingId].condition = 10; assert.equal(industryWork(w, n), false);
  w.urban.buildings[e.buildingId].condition = 100; const m = market(w, 'v0'); m.coins = 0; assert.equal(industryWork(w, n), false);
  const home = w.buildings.find(b => b.id === n.homeId)!, owner = w.npcs.find(p => p.id !== n.id && p.settlementId === n.settlementId)!; home.ownerIds = [owner.id];
  setPolicy(w, 'v0', 0, 'road'); w.economy = createEconomy(w); const wealth = n.wealth; urbanDay(w); assert.equal(n.wealth, wealth - 1); assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); valid(w);
});
test('urban corrupted accounts, references, duplicate jobs, and impossible freight are rejected', () => {
  for (const mutate of [(w: WorldState) => city(w, 'v0').goods.tools++, (w: WorldState) => city(w, 'v0').treasury++, (w: WorldState) => city(w, 'v0').deposits.ore++, (w: WorldState) => w.urban.citizens.npc0.employer = 'missing', (w: WorldState) => delete w.urban.buildings.b0, (w: WorldState) => w.urban.cities.push(structuredClone(w.urban.cities[0]))]) {
    const w = funded(); mutate(w); assert.throws(() => valid(w));
  }
});
test('policy commands validate, persist and preserve causal evidence through checkpoint compaction', async () => {
  assert.equal(commandSchema.safeParse({ id: randomUUID(), revision: 0, action: { type: 'policy', settlementId: 'v0', taxRate: 31, priority: 'school' } }).success, false);
  const result = await applyCommand(initialWorld(0), { id: randomUUID(), revision: 0, action: { type: 'policy', settlementId: 'v0', taxRate: 20, priority: 'school' } }, 0);
  assert.equal(city(result.world.state, 'v0').taxRate, 20); assert.ok(result.events.some(e => e.kind === 'policy')); valid(compactWorld(result.world.state));
});
test('1000 and 3000 residents have real housing and bounded server progress; urban save continuation is exact', async () => {
  for (const population of [1000, 3000]) {
    const sim = new Simulation(7, population); sim.setLLM(false); sim.setDetail('v0', 'focused'); sim.step(3);
    const state = sim.snapshot(); assert.equal(state.npcs.length, population); assert.ok(state.buildings.filter(b => b.kind === 'home').reduce((s, b) => s + 2 + b.level * 2, 0) >= population);
    const restored = valid(state); sim.step(2); restored.step(2); assert.equal(restored.save(), sim.save());
    const world = initialWorld(0); world.state = state; world.meta.running = true; world.meta.aiMode = 'off';
    const result = await applyCommand(world, { id: randomUUID(), revision: 0, action: { type: 'sync' } }, 10000); assert.ok(result.world.state.tick - state.tick <= 1); valid(result.world.state);
  }
});

test('large-world attention bounds preserve physical results across observation detail levels', () => {
  const full = new Simulation(7, 1000), focused = Simulation.load(full.save());
  full.setLLM(false); focused.setLLM(false); focused.setDetail('v0', 'focused');
  full.step(144); focused.step(144);
  const a = full.snapshot(), b = focused.snapshot();
  assert.deepEqual(a.npcs, b.npcs); assert.deepEqual(a.urban.cities, b.urban.cities); assert.deepEqual(a.economy, b.economy); assert.equal(a.rng, b.rng);
  assert.ok(b.events.length < a.events.length); valid(compactWorld(b));
});

test('large manual day advances in saved bounded chunks, resumes after restart and can be cancelled', async () => {
  let world = initialWorld(0); world.state = new Simulation(17, 1000).snapshot(); world.state.llm.enabled = false; world.meta.aiMode = 'off';
  const start = world.state.tick;
  world = (await applyCommand(world, { id: randomUUID(), revision: world.revision, action: { type: 'step', ticks: 144 } }, 0)).world;
  assert.equal(world.state.tick, start + 1); assert.equal(world.meta.pendingTicks, 143); assert.equal(world.meta.running, false);
  world = JSON.parse(JSON.stringify(world));
  world = (await applyCommand(world, { id: randomUUID(), revision: world.revision, action: { type: 'sync' } }, 2000)).world;
  assert.equal(world.state.tick, start + 2); assert.equal(world.meta.pendingTicks, 142);
  world = (await applyCommand(world, { id: randomUUID(), revision: world.revision, action: { type: 'play', running: false } }, 2100)).world;
  assert.equal(world.meta.pendingTicks, 0); assert.equal(world.state.tick, start + 2);
  const next = await applyCommand(world, { id: randomUUID(), revision: world.revision, action: { type: 'sync' } }, 4000); assert.equal(next.world.state.tick, start + 2);
});

test('illness deaths retain their health cause through estate settlement and archival checkpoints', async () => {
  const { appendEvent } = await import('../src/sim/social');
  const w = funded(12), n = w.npcs[0], u = w.urban.citizens[n.id];
  u.disease = 100; n.needs.health = .1;
  const source = appendEvent(w, { kind: 'health', actorId: n.id, importance: 60, description: '질병 진단', data: { disease: 100 } }); u.healthEventId = source.id;
  const sim = valid(w); sim.step(); const next = sim.snapshot();
  assert.equal(next.npcs[0].alive, false); assert.equal(next.npcs[0].life.estateSettled, true);
  const death = next.events.find(e => e.id === next.npcs[0].life.deathEventId)!; assert.equal(death.causeId, source.id); assert.equal(death.data.disease, 100);
  const compact = compactWorld(next); assert.ok(compact.events.some(e => e.id === source.id)); valid(compact); assert.deepEqual(balance(compact), { food: 0, wood: 0, coins: 0 });
});
