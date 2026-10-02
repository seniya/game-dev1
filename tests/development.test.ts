import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { createEconomy, balance, holdings, updatePrices } from '../src/sim/economy';
import { candidates } from '../src/sim/decision';
import { appendEvent, relationship, remember } from '../src/sim/social';
import type { WorldState, NPC, ActionKind } from '../src/sim/types';

function hold(n: NPC, kind: ActionKind = 'Idle', targetId?: string, duration = 100) {
  n.currentAction = { kind, targetId, target: { ...n.position }, path: [], score: 100, reason: 'controlled test', duration, progress: 0 };
}
function fixture() {
  const w = new Simulation().snapshot(); w.llm.enabled = false;
  for (const n of w.npcs) { n.position = { x: 12, y: 11 }; n.needs = { hunger: 20, thirst: 20, fatigue: 20, health: 100, social: 60, safety: 90 }; n.inventory = { food: 2, wood: 0 }; hold(n); }
  return w;
}
function load(w: WorldState) { w.economy = createEconomy(w); return Simulation.load(JSON.stringify(w)); }

test('peer sales transfer both holdings and money, retain a reserve, and cite both parties', () => {
  const w = fixture(), [buyer, seller] = w.npcs; buyer.inventory.food = 0; seller.inventory.food = 4; buyer.wealth = 30;
  hold(buyer, 'Trade', `peer:${seller.id}`, 1); const before = holdings(w), sim = load(w); sim.step(); const result = sim.snapshot();
  assert.deepEqual(holdings(result), before); assert.equal(result.npcs[1].inventory.food, 3); assert.equal(result.npcs[0].inventory.food, 1);
  const e = result.events.find(e => e.kind === 'trade')!;
  assert.equal(e.data.buyer, buyer.id); assert.equal(e.data.seller, seller.id); assert.equal(e.data.cost, 3); assert.equal(e.data.resource, 'food');
  assert.deepEqual(balance(result), { food: 0, wood: 0, coins: 0 });
  seller.inventory.food = 3; const failed = load(w); failed.step(); assert.equal(failed.snapshot().economy.totals.trades, 0);
});
test('harvest wages are funded by real market money and stop when its fund is empty', () => {
  for (const coins of [0, 1, 20]) {
    const w = fixture(), worker = w.npcs[0], farm = w.buildings.find(b => b.kind === 'farm')!;
    worker.position = { ...farm.position }; w.market.coins = coins; hold(worker, 'Work', farm.id, 1);
    const before = holdings(w), sim = load(w); sim.step(); const result = sim.snapshot();
    assert.equal(holdings(result).coins, before.coins); assert.equal(result.economy.totals.wages, Math.min(coins, 2));
    assert.equal(result.economy.totals.producedFood, 4); assert.deepEqual(balance(result), { food: 0, wood: 0, coins: 0 });
    assert.equal(result.events.filter(e => e.kind === 'wage').length, coins ? 1 : 0);
  }
});
test('scarcity raises bounded prices; restored supply lowers them, with explicit inputs', () => {
  const w = fixture(); w.storage.food = w.market.food = 0;
  for (const n of w.npcs) { n.inventory.food = 0; n.needs.hunger = 80; }
  for (let i = 0; i < 15; i++) { const old = w.market.foodPrice; const e = updatePrices(w); assert.ok(w.market.foodPrice - old <= 1); assert.equal(e.data.foodStock, 0); }
  assert.equal(w.market.foodPrice, 12); w.storage.food = 500;
  for (let i = 0; i < 15; i++) { const old = w.market.foodPrice; updatePrices(w); assert.ok(old - w.market.foodPrice <= 1); }
  assert.equal(w.market.foodPrice, 1);
});
test('late loans can be partially repaid and finally resolved with restored trust', () => {
  const w = fixture(), [borrower, lender] = w.npcs; borrower.inventory.food = 0; lender.inventory.food = 5;
  hold(borrower, 'Borrow', lender.id, 1); let sim = load(w); sim.step(); let state = sim.snapshot();
  state.loans[0].due = state.tick + 1; state.npcs.forEach(n => hold(n)); sim = load(state); sim.step(); state = sim.snapshot();
  assert.equal(state.loans[0].status, 'defaulted'); const trust = relationship(state.npcs[1], borrower.id).trust;
  assert.ok(candidates(state, state.npcs[0]).some(c => c.kind === 'Repay'));
  for (const remaining of [1, 0]) {
    state.npcs.forEach(n => hold(n)); state.npcs[0].inventory.food = 2; hold(state.npcs[0], 'Repay', state.loans[0].id, 1);
    const before = holdings(state); sim = load(state); sim.step(); state = sim.snapshot();
    assert.equal(state.loans[0].remaining, remaining); assert.deepEqual(holdings(state), before);
  }
  assert.equal(state.loans[0].status, 'repaid'); assert.ok(relationship(state.npcs[1], borrower.id).trust > trust);
  assert.equal(state.events.filter(e => e.kind === 'default').length, 1);
  assert.equal(Simulation.load(sim.save()).save(), sim.save());
});
test('the same theft reported by two witnesses cannot penalize the listener twice', () => {
  const w = fixture(), [a, b, listener, thief] = w.npcs;
  const theft = appendEvent(w, { kind: 'theft', actorId: thief.id, importance: 80, description: 'theft' });
  for (const witness of [a, b]) { const e = appendEvent(w, { kind: 'witness', actorId: witness.id, targetId: thief.id, causeId: theft.id, importance: 80, description: 'direct witness' }); witness.knownRumors.push(e.id); }
  hold(a, 'Talk', listener.id, 1); let sim = load(w); sim.step(); const after = sim.snapshot();
  assert.equal(relationship(after.npcs[2], thief.id).trust, 31);
  after.npcs.forEach(n => { hold(n); n.lastTalk = -100; }); hold(after.npcs[1], 'Talk', listener.id, 1); sim = load(after); sim.step();
  assert.equal(relationship(sim.snapshot().npcs[2], thief.id).trust, 31); assert.equal(sim.snapshot().events.filter(e => e.kind === 'rumor').length, 1);
});
test('different relationships and remembered aid produce explainable partner choices', () => {
  const w = fixture(), [giver, friend, rival] = w.npcs; giver.inventory.food = 4; giver.personality.empathy = 90;
  for (const n of [friend, rival]) { n.inventory.food = 0; n.needs.hunger = 80; }
  relationship(giver, friend.id).trust = 80; relationship(giver, rival.id).trust = 10;
  const helped = appendEvent(w, { kind: 'share', actorId: friend.id, targetId: giver.id, importance: 80, description: 'previous help' }); remember(w, giver, helped);
  const options = candidates(w, giver).filter(c => c.kind === 'Share');
  assert.equal(options[0].targetId, friend.id); assert.ok(options[0].evidence?.includes(helped.id)); assert.match(options[0].reason, /경험 1건/);
  relationship(giver, friend.id).trust = 0; relationship(giver, friend.id).resentment = 100; relationship(giver, rival.id).trust = 100;
  assert.equal(candidates(w, giver).find(c => c.kind === 'Share')!.targetId, rival.id);
});
test('version 1 upgrades without fabricating old daily samples, new accounts reject tampering', () => {
  const old: any = new Simulation().snapshot(); old.version = 1; delete old.economy;
  const sim = Simulation.load(JSON.stringify(old)); assert.equal(sim.snapshot().version, 9); assert.deepEqual(sim.snapshot().economy.daily, []);
  sim.step(200); const good = sim.save(); assert.equal(Simulation.load(good).save(), good);
  for (const mutate of [(w: WorldState) => w.storage.food++, (w: WorldState) => w.npcs[0].wealth++, (w: WorldState) => w.economy.daily[0].eventId = 'missing']) {
    const w = JSON.parse(good); mutate(w); assert.throws(() => Simulation.load(JSON.stringify(w)));
  }
});
test('autonomous investment consumes real wood and records a production multiplier', () => {
  const w = fixture(), carpenter = w.npcs[4], farm = w.buildings.find(b => b.kind === 'farm')!;
  carpenter.occupation='carpenter'; w.villageLife!.settlements.v0.unlocked.push('carpenter');
  carpenter.position = { ...farm.position }; carpenter.inventory.wood = 3; hold(carpenter, 'Work', `${farm.id}:expand_farm`, 1);
  const before = holdings(w).wood, sim = load(w); sim.step(); const result = sim.snapshot();
  assert.equal(holdings(result).wood, before - 8); assert.equal(result.buildings.find(b => b.id === farm.id)!.level, 2);
  assert.equal(result.events.find(e => e.kind === 'project')!.data.growthMultiplier, 1.35); assert.deepEqual(balance(result), { food: 0, wood: 0, coins: 0 });
});

test('a stale journey is cancelled and replanned instead of following forever', () => {
  const w = fixture(), n = w.npcs[0]; w.tick = 200;
  n.position = { x: 12, y: 11 }; hold(n, 'Move');
  n.currentAction!.target = { x: 13, y: 11 }; n.currentAction!.path = [{ x: 13, y: 11 }];
  const sim = load(w); sim.step(); assert.equal(sim.snapshot().npcs[0].currentAction, undefined);
  assert.ok(sim.snapshot().events.some(e => e.kind === 'failure' && e.description.includes('다시 판단')));
  sim.step(); assert.equal(sim.snapshot().npcs[0].decision.tick, sim.tick);
});
