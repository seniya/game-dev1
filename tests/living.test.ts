import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { candidates } from '../src/sim/decision';
import { initializeLiving, livingTick, buyConsumerGood, CONSUMABLES } from '../src/sim/living';
import { HOMES } from '../src/sim/living-types';
import { buildEnterprise, industryWork, city, urbanBalance, urbanDay } from '../src/sim/urban';
import { GOODS, type Industry } from '../src/sim/urban-types';
import { createEconomy, balance, holdings } from '../src/sim/economy';
import { defaultCharacter } from '../src/ui/characters';
import { characterSchema } from '../src/sim/character-schema';
import { WorldStore } from '../src/server/store';
import { database } from './helpers/database';
import { stateChange } from '../src/server/journal';
import { applyCommand } from '../src/server/world';
const valid = (w: unknown) => Simulation.load(JSON.stringify(w));
function funded() {
  const w = new Simulation(42, 30).snapshot(); w.llm.enabled = false;
  w.storage.wood = 300; w.market.coins = 3000; w.economy = createEconomy(w); return w;
}
function employ(w: ReturnType<typeof funded>, kind: Industry) {
  const e = buildEnterprise(w, 'v0', kind)!; assert.ok(e);
  const n = w.npcs.find(n => !w.urban.citizens[n.id].employer)!;
  e.workers.push(n.id); w.urban.citizens[n.id].employer = e.id;
  n.position = { ...w.buildings.find(b => b.id === e.buildingId)!.position };
  n.currentAction = undefined; return n;
}
function legacy(w: ReturnType<typeof funded>): any {
  const old: any = structuredClone(w); old.version = 5; delete old.living;
  for (const g of GOODS.slice(4)) for (const goods of [old.urban.ledger.opening, old.urban.ledger.produced, old.urban.ledger.consumed, ...old.urban.cities.map((c: any) => c.goods)]) delete goods[g];
  return old;
}
test('v5 saves gain deterministic living states without rewriting history, assets or RNG', () => {
  const old = legacy(funded()), w = valid(old).snapshot();
  assert.equal(w.version, 6); assert.equal(w.rng, old.rng); assert.deepEqual(w.events, old.events); assert.deepEqual(holdings(w), holdings(old));
  assert.equal(Object.keys(w.living.people).length, w.npcs.length); assert.equal(new Set(Object.values(w.living.homes)).size, 5);
  assert.equal(valid(old).save(), valid(w).save()); assert.equal(valid(w).save(), JSON.stringify(w));
  for (const g of GOODS.slice(4)) assert.equal(city(w, 'v0').goods[g], 0);
});
test('body, personality and desires affect decisions while urgent food remains actionable', () => {
  const w = funded(), n = w.npcs[0], l = w.living.people[n.id];
  const score = (kind: string) => candidates(w, n).find(c => c.kind === kind)!.score;
  const sleep = score('Sleep'), work = score('Work');
  l.body.stamina = 5; l.body.pain = 85;
  assert.ok(score('Sleep') > sleep); assert.ok(score('Work') < work);
  l.body.cleanliness = 0; assert.ok(candidates(w, n).some(c => c.kind === 'Wash'));
  n.needs.hunger = 100; n.inventory.food = 1; w.economy = createEconomy(w);
  assert.equal(candidates(w, n)[0].kind, 'Eat');
  const a = valid(w), b = valid(w); a.step(200); b.step(100); const resumed = Simulation.load(b.save()); resumed.step(100); assert.equal(a.save(), resumed.save());
});
test('all new recipes require real inputs and conserve wages, goods and material ledgers', () => {
  const w = funded(), c = city(w, 'v0'), cash = holdings(w).coins;
  const garden = employ(w, 'garden'), weaving = employ(w, 'weaving'), tailoring = employ(w, 'tailoring'), kitchen = employ(w, 'kitchen'), joinery = employ(w, 'joinery');
  for (const n of [weaving, tailoring, kitchen, joinery]) assert.equal(industryWork(w, n), false);
  for (let i = 0; i < 4; i++) assert.equal(industryWork(w, garden), true);
  for (let i = 0; i < 2; i++) assert.equal(industryWork(w, weaving), true);
  assert.equal(industryWork(w, tailoring), true); assert.equal(c.goods.clothes, 1);
  c.goods.grain = 2; w.urban.ledger.opening.grain = 2; c.goods.tools = 1; w.urban.ledger.opening.tools = 1;
  assert.equal(industryWork(w, kitchen), true); assert.equal(c.goods.meals, 2);
  assert.equal(industryWork(w, joinery), true); assert.equal(c.goods.furniture, 1);
  assert.equal(holdings(w).coins, cash); assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0)); valid(w);
});
test('consumer purchases recheck location, money and stock, then apply actual benefits once', () => {
  const w = funded(), n = w.npcs[0], c = city(w, 'v0'), l = w.living.people[n.id], u = w.urban.citizens[n.id];
  n.wealth = 100; n.needs.hunger = 90; u.disease = 8; l.body.pain = 50;
  for (const g of CONSUMABLES) { c.goods[g] = 1; w.urban.ledger.opening[g] = 1; }
  w.economy = createEconomy(w); const cash = holdings(w).coins;
  assert.equal(buyConsumerGood(w, n, 'clothes'), false);
  n.position = { ...w.buildings.find(b => b.kind === 'market')!.position };
  for (const g of CONSUMABLES) { assert.equal(buyConsumerGood(w, n, g), true); const wealth = n.wealth; assert.equal(buyConsumerGood(w, n, g), false); assert.equal(n.wealth, wealth); }
  assert.equal(l.clothing, 100); assert.equal(l.furnishings, 100); assert.equal(n.needs.hunger, 45); assert.equal(u.disease, 6); assert.equal(l.body.pain, 32);
  assert.equal(holdings(w).coins, cash); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0)); assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); valid(w);
});
test('housing insulation changes winter recovery and rent is transferred to living owners', () => {
  const w = funded(), n = w.npcs[0], home = w.buildings.find(b => b.id === n.homeId)!, owner = w.npcs.find(p => p.homeId !== n.homeId)!;
  w.tick = 9 * 144; home.ownerIds = [owner.id]; n.wealth = 100;
  n.position = { ...home.position }; n.currentAction = { kind: 'Sleep', score: 1, reason: 'test', target: { ...home.position }, path: [], progress: 0, duration: 8 };
  const a = structuredClone(w), b = structuredClone(w); a.living.homes[home.id] = 'cottage'; b.living.homes[home.id] = 'insulated';
  for (let i = 0; i < 100; i++) { livingTick(a, a.npcs[0]); livingTick(b, b.npcs[0]); }
  assert.ok(b.living.people[n.id].body.warmth > a.living.people[n.id].body.warmth);
  w.living.homes[home.id] = 'insulated'; city(w, 'v0').taxRate = 0; w.economy = createEconomy(w); const cash = holdings(w).coins;
  urbanDay(w); assert.equal(n.wealth, 100 - HOMES.insulated.rent); assert.equal(holdings(w).coins, cash); valid(w);
});
test('custom residents persist expanded setup and reject corrupt values and missing references', () => {
  const sim = new Simulation(), w = sim.snapshot(), home = w.buildings.find(b => b.kind === 'home')!;
  const input = defaultCharacter(home.id); input.occupation = 'tailor'; input.traits!.frugality = 92; input.desires!.mastery = 88; input.body!.pain = 23;
  const id = sim.createCharacter(input); const loaded = Simulation.load(sim.save()).snapshot();
  assert.equal(loaded.npcs.find(n => n.id === id)!.occupation, 'tailor'); assert.equal(loaded.living.people[id].traits.frugality, 92); assert.equal(loaded.living.people[id].body.pain, 23);
  assert.equal(characterSchema.safeParse({ ...input, body: { ...input.body, warmth: 101 } }).success, false);
  for (const mutate of [(x: typeof w) => { x.living.people.npc0.body.pain = -1; }, (x: typeof w) => { delete x.living.people.npc0; }, (x: typeof w) => { x.living.homes.missing = 'shared'; }, (x: typeof w) => { city(x, 'v0').goods.clothes++; }]) { const x = sim.snapshot(); mutate(x); assert.throws(() => valid(x)); }
});
test('v5 server journals replay before migration and commit a restartable v6 checkpoint', async () => {
  const db = database(), store = new WorldStore(db); await store.init(0); const initial = await store.read();
  const before = legacy(initial.state), after = structuredClone(before); after.tick++;
  await db.batch([db.prepare('DELETE FROM snapshots'), db.prepare('INSERT INTO snapshots VALUES(?,?,?)').bind(initial.epoch, 0, JSON.stringify(before)), db.prepare('UPDATE world SET revision=1 WHERE id=1'), db.prepare('UPDATE world_checkpoints SET head_revision=1'), db.prepare('INSERT INTO world_changes VALUES(?,?,?,?)').bind(initial.epoch, 1, 0, JSON.stringify(stateChange(before, after)))]);
  const fresh = new WorldStore(db), migrated = await fresh.read(); assert.equal(migrated.state.version, 6); assert.equal(migrated.state.tick, after.tick); valid(migrated.state);
  const command = { id: crypto.randomUUID(), revision: 1, action: { type: 'step', ticks: 1 } } as const;
  const result = await applyCommand(migrated, command, 0); await fresh.commit(result.world, result.events, JSON.stringify(command), command.id);
  const restarted = await new WorldStore(db).read(); assert.deepEqual(restarted.state, JSON.parse(JSON.stringify(result.world.state))); valid(restarted.state);
});
test('expanded worlds keep physical state, accounting and exact continuation at city scale', () => {
  const sim = new Simulation(7, 1000); sim.setLLM(false); sim.setDetail('v0', 'focused'); sim.step(145);
  const w = sim.snapshot(); initializeLiving(w); valid(w);
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0));
  const resumed = Simulation.load(sim.save()); sim.step(5); resumed.step(5); assert.equal(sim.save(), resumed.save());
});
test('public payroll uses collected funds and refuses unfunded production without minting wages', () => {
  const w = funded(), n = employ(w, 'mine'), c = city(w, 'v0');
  w.market.coins = 0; c.treasury = c.collected = 2; w.economy = createEconomy(w); const cash = holdings(w).coins;
  assert.equal(industryWork(w, n), true); assert.equal(c.treasury, 0); assert.equal(c.spent, 2); assert.equal(w.events.at(-1)!.data.publicWage, 2);
  assert.equal(industryWork(w, n), false); assert.equal(holdings(w).coins, cash); valid(w);
});
test('an ordinary village autonomously manufactures and consumes clothes, meals and furniture', () => {
  const sim = new Simulation(42, 12); sim.setLLM(false); sim.step(144 * 30);
  const w = sim.snapshot();
  for (const good of ['clothes', 'meals', 'furniture'] as const) { assert.ok(w.urban.ledger.produced[good] > 0); assert.ok(w.urban.ledger.consumed[good] > 0); }
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); assert.ok(Object.values(urbanBalance(w)).every(v => v === 0)); valid(w);
});
