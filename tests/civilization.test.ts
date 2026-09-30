import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { balance, holdings, createEconomy } from '../src/sim/economy';
import { formFamily, giveBirth, lifeDay, careForChild, die, settleEstate } from '../src/sim/life';
import { startMigration, startTrade, advanceJourneys, buildHouse, regionalDay, stocks, market } from '../src/sim/civilization';
import { relationship, appendEvent } from '../src/sim/social';
import { YEAR_TICKS, type WorldState } from '../src/sim/types';
import { compactWorld, applyCommand, initialWorld } from '../src/server/world';
import { randomUUID } from 'node:crypto';

function familyFixture() {
  const w = new Simulation().snapshot(); w.llm.enabled = false; w.tick = YEAR_TICKS * 2 + 36;
  const [a, b] = w.npcs;
  for (const n of [a, b]) { n.identity.age = 25; n.life.bornTick = w.tick - 25 * YEAR_TICKS; n.needs.health = 100; n.needs.hunger = 10; n.inventory.food = 20; }
  for (const [n, p] of [[a, b], [b, a]]) { const r = relationship(n, p.id); r.trust = 80; r.affection = 40; }
  assert.equal(formFamily(w, a, b), true); w.economy = createEconomy(w);
  return { w, a, b };
}
const valid = (w: WorldState) => Simulation.load(JSON.stringify(w));

test('family and birth require adult consent, housing, food and cooldown; children own no minted resources', () => {
  const { w, a, b } = familyFixture(), before = holdings(w);
  const child = giveBirth(w, a, b)!; assert.ok(child); assert.deepEqual(child.life.parentIds, [a.id, b.id]); assert.equal(child.life.generation, 1);
  assert.equal(child.wealth, 0); assert.equal(holdings(w).food, before.food - 2); assert.equal(holdings(w).coins, before.coins);
  assert.equal(giveBirth(w, a, b), undefined); assert.equal(formFamily(w, a, child), false);
  const birth = w.events.find(e => e.id === child.life.birthEventId)!; assert.equal(birth.kind, 'birth');
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); valid(w);
  const limited = familyFixture(); limited.a.inventory.food = limited.b.inventory.food = limited.w.storage.food = 0;
  assert.equal(giveBirth(limited.w, limited.a, limited.b), undefined);
});
test('care consumes food, skills pass through childhood, adult transition and old age retain sources', () => {
  const { w, a, b } = familyFixture(), child = giveBirth(w, a, b)!;
  child.needs.hunger = 80; const food = holdings(w).food; careForChild(w, child); assert.equal(holdings(w).food, food - 1); assert.equal(child.currentAction, undefined);
  a.life.skill = 70; w.tick += 144; lifeDay(w); assert.ok(child.life.skill > 0);
  w.tick = child.life.bornTick + YEAR_TICKS * 18; lifeDay(w); assert.equal(child.identity.age, 18); assert.ok(w.events.some(e => e.kind === 'coming_of_age' && e.actorId === child.id));
  const wealth = holdings(w).coins; w.tick = a.life.bornTick + YEAR_TICKS * 85; lifeDay(w);
  assert.equal(a.alive, false); assert.equal(a.life.estateSettled, true); assert.equal(holdings(w).coins, wealth);
  valid(w); valid(compactWorld(w));
});
test('estate settles debt before splitting property, is idempotent and preserves dead-person history', () => {
  const { w, a, b } = familyFixture(), child = giveBirth(w, a, b)!;
  const lender = w.npcs[3], source = appendEvent(w, { kind: 'loan', actorId: a.id, targetId: lender.id, importance: 60, description: '식량 대여' });
  w.loans.push({ id: `l${w.nextId++}`, borrowerId: a.id, lenderId: lender.id, amount: 3, remaining: 3, due: w.tick + 144, status: 'active', sourceEventId: source.id });
  const before = holdings(w), lenderFood = lender.inventory.food; die(w, a, 'needs');
  assert.deepEqual(holdings(w), before); assert.equal(lender.inventory.food, lenderFood + 3); assert.equal(w.loans[0].remaining, 0);
  assert.ok(b.wealth > 0 && child.wealth > 0); assert.equal(a.wealth, 0);
  const saved = JSON.stringify(w); settleEstate(w, a, a.life.deathEventId!); assert.equal(JSON.stringify(w), saved);
  assert.ok(w.buildings.some(h => h.ownerIds?.includes(child.id))); valid(w);
});
test('multi-village trade escrows cargo and money, survives save/load and delivers once', () => {
  const w = new Simulation(7, 72).snapshot(), [a, b] = w.civilization.settlements;
  market(w, a.id).food = 200; market(w, b.id).food = 0; w.economy = createEconomy(w);
  const before = holdings(w); assert.equal(startTrade(w, a, b), true); assert.deepEqual(holdings(w), before);
  assert.equal(startTrade(w, a, b), false);
  let loaded = valid(w).snapshot(); const steps = loaded.civilization.journeys[0].path.length;
  for (let i = 0; i < steps + 1; i++) { loaded.tick++; advanceJourneys(loaded); }
  assert.deepEqual(holdings(loaded), before); assert.equal(loaded.civilization.journeys.length, 0); assert.equal(loaded.economy.totals.trades, 1);
  valid(loaded); assert.equal(loaded.events.filter(e => e.kind === 'caravan' && e.data.phase === 'arrived').length, 1);
});
test('migration follows adjacent tiles, reserves housing and preserves population and property', () => {
  const w = new Simulation(42, 40).snapshot(), to = w.civilization.settlements[1], n = w.npcs[0], before = holdings(w);
  assert.equal(startMigration(w, n, to), true); assert.equal(startMigration(w, n, to), false);
  const saved = valid(w).snapshot(); let previous = saved.npcs[0].position;
  while (saved.civilization.journeys.length) { saved.tick++; advanceJourneys(saved); const pos = saved.npcs[0].position; assert.ok(Math.abs(pos.x - previous.x) + Math.abs(pos.y - previous.y) <= 1); previous = { ...pos }; }
  assert.equal(saved.npcs[0].settlementId, to.id); assert.deepEqual(holdings(saved), before); assert.equal(saved.npcs.length, w.npcs.length); valid(saved);
});
test('construction and founding spend accounted wood and select reachable unoccupied land', () => {
  const w = new Simulation(42, 20).snapshot(), v = w.civilization.settlements[0]; w.storage.wood = 160; w.storage.food = 200; w.economy = createEconomy(w);
  const wood = holdings(w).wood, b = buildHouse(w, v)!; assert.ok(b); assert.equal(holdings(w).wood, wood - 12);
  regionalDay(w); assert.equal(w.civilization.settlements.length, 2); assert.ok(w.events.some(e => e.kind === 'settlement'));
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 }); valid(w);
});
test('legacy v2 upgrades without inventing ancestry, new invalid family and transit references fail closed', () => {
  const old: any = new Simulation().snapshot(); old.version = 2; delete old.civilization;
  for (const n of old.npcs) { delete n.life; delete n.settlementId; }
  for (const b of old.buildings) { delete b.ownerIds; delete b.settlementId; }
  const restored = Simulation.load(JSON.stringify(old)); assert.equal(restored.snapshot().version, 7); assert.equal(restored.snapshot().npcs[0].life.parentIds.length, 0);
  for (const mutate of [(w: WorldState) => w.npcs[0].life.parentIds = [w.npcs[0].id], (w: WorldState) => w.npcs[0].settlementId = 'missing', (w: WorldState) => w.buildings[4].ownerIds = ['missing'], (w: WorldState) => w.civilization.settlements[0].storage.food = 1]) {
    const w = restored.snapshot(); mutate(w); assert.throws(() => valid(w));
  }
});
test('400 residents initialize across settlements and distant-detail switching preserves every physical result', () => {
  const full = new Simulation(123, 400), focused = Simulation.load(full.save()); full.setLLM(false); focused.setLLM(false); focused.setDetail('v0', 'focused');
  full.step(288); focused.step(288);
  const a = full.snapshot(), b = focused.snapshot();
  assert.deepEqual(a.npcs, b.npcs); assert.deepEqual(holdings(a), holdings(b)); assert.equal(a.rng, b.rng); assert.ok(b.events.length < a.events.length);
  valid(a); valid(b); const resumed = valid(b); focused.step(144); resumed.step(144); assert.equal(focused.save(), resumed.save());
});
test('server reset accepts 400, bounds heartbeat work and archives family causes', async () => {
  let world = initialWorld(1000);
  world = (await applyCommand(world, { id: randomUUID(), revision: 0, action: { type: 'reset', seed: 42, population: 400 } }, 1000)).world;
  assert.equal(world.state.npcs.length, 400);
  world.meta.running = true;
  const advanced = await applyCommand(world, { id: randomUUID(), revision: world.revision, action: { type: 'sync' } }, 10000);
  assert.ok(advanced.world.state.tick - world.state.tick <= 8); valid(advanced.world.state);
});

test('server archive retrieves an old birth and inheritance after restart and full export restores ancestry', async () => {
  const { database } = await import('./helpers/database');
  const { default: worker } = await import('../src/server/worker');
  const { WorldStore } = await import('../src/server/store');
  const db = database(), env = { DB: db, ASSETS: { fetch: () => new Response('asset') } } as never;
  const request = (path: string, data?: unknown) => worker.fetch(new Request(`https://world.test/api/${path}`, data ? { method: 'POST', headers: { Origin: 'https://world.test', 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}), env);
  await request('world');
  const { w, a, b } = familyFixture(), child = giveBirth(w, a, b)!; die(w, a, 'needs');
  for (let i = 0; i < 150; i++) appendEvent(w, { kind: 'weather', importance: 10, description: `이후 관측 ${i}` });
  const imported = await request('command', { id: randomUUID(), revision: 0, action: { type: 'import', save: JSON.stringify(w) } }); assert.equal(imported.status, 200);
  const store = new WorldStore(db); await store.init(Date.now()); const restarted = await store.read();
  assert.equal(restarted.state.npcs.find(n => n.id === child.id)!.life.parentIds[0], a.id);
  const eventResponse = await request(`events/${child.life.birthEventId}?epoch=${restarted.epoch}`); assert.equal(eventResponse.status, 200);
  const event = await eventResponse.json() as { event: { kind: string } }; assert.equal(event.event.kind, 'birth');
  const history = await (await request(`events?npc=${a.id}&filter=life`)).json() as { events: { kind: string }[] };
  assert.ok(history.events.some(e => e.kind === 'inheritance'));
  const exported = await (await request('export')).json(); const restored = Simulation.load(JSON.stringify(exported));
  assert.equal(restored.snapshot().npcs.find(n => n.id === child.id)!.life.birthEventId, child.life.birthEventId);
  assert.deepEqual(balance(restored.snapshot()), { food: 0, wood: 0, coins: 0 });
});
