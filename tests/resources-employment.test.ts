import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { EXTRA_RECIPES, GOODS, BASIC_RESOURCE_LABELS, PRODUCTS, INDUSTRY_JOB, type Industry, type Good } from '../src/sim/urban-types';
import { OCCUPATIONS, YEAR_TICKS } from '../src/sim/types';
import { city, buildEnterprise, industryWork, urbanBalance, urbanDay, startFreight, advanceFreight } from '../src/sim/urban';
import { balance, createEconomy, holdings } from '../src/sim/economy';
import { canWork, syncEmployment, workStatus } from '../src/sim/employment';
import { candidates } from '../src/sim/decision';
import { buyConsumerGood } from '../src/sim/living';
import { defaultCharacter } from '../src/ui/characters';
import { lifeDay } from '../src/sim/life';
import { WorldStore } from '../src/server/store';
import { database } from './helpers/database';
import { stateChange } from '../src/server/journal';
import { applyCommand } from '../src/server/world';
const valid = (w: unknown) => Simulation.load(JSON.stringify(w));
function funded() {
  const w = new Simulation(42, 30).snapshot(); w.llm.enabled = false;
  w.storage.wood = 500; w.market.coins = 5000; w.economy = createEconomy(w); return w;
}
function legacy(w: ReturnType<typeof funded>): any {
  const old = structuredClone(w) as any; old.version = 6;
  for (const goods of [old.urban.ledger.opening, old.urban.ledger.produced, old.urban.ledger.consumed, ...old.urban.cities.map((c: any) => c.goods)]) for (const g of GOODS.slice(10)) delete goods[g];
  for (const c of old.urban.cities) for (const g of ['clay', 'salt']) { delete c.deposits[g]; delete c.initialDeposits[g]; }
  return old;
}
test('14 raw resources, 12 products and 26 professions are connected to real recipes', () => {
  assert.equal(Object.keys(BASIC_RESOURCE_LABELS).length, 14); assert.equal(PRODUCTS.length, 12); assert.equal(Object.keys(OCCUPATIONS).length - 1, 26);
  const w = funded(), c = city(w, 'v0');
  for (const [kind, recipe] of Object.entries(EXTRA_RECIPES)) {
    const e = buildEnterprise(w, 'v0', kind as Industry)!; assert.ok(e, kind);
    const n = w.npcs.find(n => canWork(w, n) && !w.urban.citizens[n.id].employer)!;
    e.workers.push(n.id); w.urban.citizens[n.id].employer = e.id; n.occupation = INDUSTRY_JOB[e.kind];
    const b = w.buildings.find(b => b.id === e.buildingId)!; n.position = { ...b.position };
    for (const [key, quantity] of Object.entries(recipe.inputs)) { c.goods[key as Good] += quantity; w.urban.ledger.opening[key as Good] += quantity; }
    const before = structuredClone(c.goods), cash = holdings(w).coins;
    assert.equal(industryWork(w, n), true, kind);
    for (const [key, quantity] of Object.entries(recipe.outputs)) assert.equal(c.goods[key as Good], before[key as Good] + quantity);
    for (const [key, quantity] of Object.entries(recipe.inputs)) assert.equal(c.goods[key as Good], before[key as Good] - quantity);
    assert.equal(holdings(w).coins, cash);
    if (recipe.growth) b.growth = 0;
    else if (recipe.deposit) { c.initialDeposits[recipe.deposit] -= c.deposits[recipe.deposit]; c.deposits[recipe.deposit] = 0; }
    else { const key = Object.keys(recipe.inputs)[0] as Good; w.urban.ledger.consumed[key] += c.goods[key]; c.goods[key] = 0; }
    const save = JSON.stringify(w); assert.equal(industryWork(w, n), false); assert.equal(JSON.stringify(w), save);
  }
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(x => x === 0)); valid(w);
});
test('new consumer goods spend actual stock and coins, improve needs and reject duplicate purchases', () => {
  for (const good of ['vegetables', 'fruit', 'bread', 'dried_fish', 'cheese', 'stew', 'pottery', 'blankets', 'medicine'] as const) {
    const w = funded(), n = w.npcs[0], c = city(w, 'v0'), l = w.living.people[n.id], u = w.urban.citizens[n.id];
    n.wealth = 100; n.needs.hunger = 90; l.body.cleanliness = 10; l.body.warmth = 10; l.body.pain = 60; u.disease = 30;
    c.goods[good] = 1; w.urban.ledger.opening[good] = 1; w.economy = createEconomy(w);
    assert.equal(buyConsumerGood(w, n, good), false);
    n.position = { ...w.buildings.find(b => b.kind === 'market')!.position };
    assert.equal(buyConsumerGood(w, n, good), true); assert.equal(buyConsumerGood(w, n, good), false);
    if (good === 'pottery') assert.ok(l.body.cleanliness > 10);
    else if (good === 'blankets') assert.ok(l.body.warmth > 10);
    else if (good === 'medicine') assert.ok(u.disease < 30 && l.body.pain < 60);
    else assert.ok(n.needs.hunger < 90);
    assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); valid(w);
  }
});
test('children, retirees and convalescents cannot work; adults can recover, seek jobs and be hired', () => {
  const w = funded(), e = buildEnterprise(w, 'v0', 'mine')!, n = w.npcs[0];
  for (const status of ['child', 'retired', 'recovering'] as const) {
    n.identity.age = status === 'child' ? 8 : status === 'retired' ? 65 : 24;
    n.needs.health = status === 'recovering' ? 20 : 100; n.occupation = 'miner';
    e.workers = [n.id]; w.urban.citizens[n.id].employer = e.id;
    n.position = { ...w.buildings.find(b => b.id === e.buildingId)!.position };
    n.currentAction = { kind: 'Work', target: { ...n.position }, targetId: `industry:${e.buildingId}`, path: [], score: 100, reason: 'test', duration: 4, progress: 3 };
    assert.equal(industryWork(w, n), false); syncEmployment(w, n);
    assert.equal(workStatus(w, n), status); assert.equal(n.occupation, 'none'); assert.equal(e.workers.length, 0); assert.equal(n.currentAction, undefined);
    assert.ok(!candidates(w, n).some(c => c.kind === 'Work' || c.kind === 'Gather'));
  }
  n.needs.health = 100; syncEmployment(w, n); assert.equal(n.occupation, 'miner');
  n.occupation = 'none'; delete n.previousOccupation;
  assert.equal(workStatus(w, n), 'seeking'); urbanDay(w); assert.ok(w.urban.citizens[n.id].employer); assert.notEqual(n.occupation, 'none');
});
test('initial and custom residents include dependants; adulthood and retirement change eligibility', () => {
  const sim = new Simulation(), initial = sim.snapshot();
  for (const status of ['child', 'retired', 'seeking']) assert.ok(initial.npcs.some(n => workStatus(initial, n) === status));
  for (const n of initial.npcs.filter(n => n.identity.age < 18)) assert.ok(initial.npcs.some(p => p.homeId === n.homeId && p.identity.age >= 18));
  for (const age of [0, 8, 70]) {
    const a = defaultCharacter(age === 70 ? 'b5' : 'b4'); a.age = age; a.occupation = 'baker'; const id = sim.createCharacter(a), w = sim.snapshot(), n = w.npcs.find(n => n.id === id)!;
    assert.equal(n.occupation, 'none'); assert.equal(workStatus(w, n), age < 18 ? 'child' : 'retired'); valid(w);
  }
  const w = initial, child = w.npcs.find(n => n.identity.age < 18)!;
  child.life.bornTick = w.tick - 18 * YEAR_TICKS; lifeDay(w); assert.equal(child.identity.age, 18); assert.ok(canWork(w, child));
  const adult = w.npcs[0]; adult.life.bornTick = w.tick - 65 * YEAR_TICKS; lifeDay(w); assert.equal(workStatus(w, adult), 'retired'); assert.equal(adult.occupation, 'none'); valid(w);
});
test('v6 migration preserves assets, events and RNG; v7 rejects missing or unbalanced new resources', () => {
  const old = legacy(funded()), w = valid(old).snapshot(); assert.equal(w.version, 7);
  assert.equal(w.rng, old.rng); assert.deepEqual(w.events, old.events); assert.deepEqual(holdings(w), holdings(old));
  assert.equal(valid(old).save(), valid(w).save());
  for (const good of GOODS.slice(10)) assert.equal(city(w, 'v0').goods[good], 0);
  const missing = structuredClone(w) as any; delete missing.urban.cities[0].goods.clay; assert.throws(() => valid(missing));
  const corrupt = structuredClone(w); city(corrupt, 'v0').goods.fish++; assert.throws(() => valid(corrupt));
});
test('new goods freight preserves cargo, payment and exact save continuation', () => {
  const w = new Simulation(42, 72).snapshot(), c = city(w, 'v0'); c.goods.cheese = 20; w.urban.ledger.opening.cheese = 20;
  assert.ok(startFreight(w, 'v0', 'v1', 'cheese')); const cash = holdings(w).coins;
  const loaded = valid(w).snapshot(); while (loaded.urban.freight.length) { loaded.tick++; advanceFreight(loaded); }
  assert.ok(city(loaded, 'v1').goods.cheese > 0); assert.equal(holdings(loaded).coins, cash); valid(loaded);
});
test('v6 queued server deltas replay before migration and checkpoint as v7 on the next write', async () => {
  const db = database(), store = new WorldStore(db); await store.init(0); const initial = await store.read();
  const before = legacy(initial.state), after = structuredClone(before); after.tick++;
  await db.batch([db.prepare('DELETE FROM snapshots'), db.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind(initial.epoch, 0, JSON.stringify(before)), db.prepare('UPDATE world SET revision=1 WHERE id=1'), db.prepare('UPDATE world_checkpoints SET head_revision=1'), db.prepare('INSERT INTO world_changes VALUES(?,?,?,?)').bind(initial.epoch, 1, 0, JSON.stringify(stateChange(before, after)))]);
  const fresh = new WorldStore(db), migrated = await fresh.read(); assert.equal(migrated.state.version, 7); assert.equal(migrated.state.tick, after.tick);
  const command = { id: crypto.randomUUID(), revision: 1, action: { type: 'step', ticks: 1 } } as const;
  const result = await applyCommand(migrated, command, 0); await fresh.commit(result.world, result.events, JSON.stringify(command), command.id);
  const restarted = await new WorldStore(db).read(); assert.deepEqual(restarted.state, JSON.parse(JSON.stringify(result.world.state))); valid(restarted.state);
});

test('the default server world starts with 100 residents and usable housing across three villages', async () => {
  const { initialWorld, applyCommand } = await import('../src/server/world');
  const { capacity } = await import('../src/sim/civilization');
  const current = initialWorld(0), w = current.state;
  assert.equal(w.npcs.filter(n => n.alive).length, 100); assert.equal(w.civilization.settlements.length, 3);
  for (const home of w.buildings.filter(b => b.kind === 'home')) assert.ok(w.npcs.filter(n => n.homeId === home.id).length <= capacity(home));
  assert.ok(w.npcs.some(n => workStatus(w, n) === 'child')); assert.ok(w.npcs.some(n => workStatus(w, n) === 'retired'));
  const reset = await applyCommand(current, { id: crypto.randomUUID(), revision: current.revision, action: { type: 'reset', seed: 7 } }, 0);
  assert.equal(reset.world.state.npcs.length, 100); assert.equal(reset.world.meta.backupEpoch, current.epoch); valid(reset.world.state);
});
