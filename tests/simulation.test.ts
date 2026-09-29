import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, summarize } from '../src/sim/engine';
import { createEconomy } from '../src/sim/economy';
import { createWorld } from '../src/sim/world';
import { findPath } from '../src/sim/pathfinding';
import { candidates } from '../src/sim/decision';
import { appendEvent, socialEvent, decayMemories } from '../src/sim/social';
import { DecisionCoordinator } from '../src/llm/coordinator';
import { MockLLMProvider, type LLMProvider } from '../src/llm/provider';
import type { NPC, ActionKind, WorldState } from '../src/sim/types';

function prepared() {
  const w = new Simulation(42).snapshot();
  for (const n of w.npcs) {
    n.position = { x: 2, y: 15 }; n.needs = { hunger: 20, thirst: 20, fatigue: 20, health: 100, social: 60, safety: 90 };
    n.inventory = { food: 2, wood: 0 }; hold(n, 'Idle');
  }
  return w;
}
function hold(n: NPC, kind: ActionKind, targetId?: string, duration = 100) { n.currentAction = { kind, target: { ...n.position }, targetId, score: 100, reason: 'test scenario', path: [], progress: 0, duration }; }
function load(w: WorldState) { w.economy = createEconomy(w); return Simulation.load(JSON.stringify(w)); }

test('same seed and commands produce identical complete states', () => {
  const a = new Simulation(17), b = new Simulation(17); a.setLLM(false); b.setLLM(false);
  a.step(500); b.step(500); a.experiment('drought'); b.experiment('drought'); a.step(500); b.step(500);
  assert.equal(a.save(), b.save()); assert.notEqual(new Simulation(18).save(), new Simulation(17).save());
});
test('save/load preserves in-flight paths, PRNG, queues and exact continuation', () => {
  const continuous = new Simulation(42); continuous.step(731);
  const resumed = Simulation.load(continuous.save()); assert.equal(continuous.save(), resumed.save());
  continuous.step(1200); resumed.step(1200); assert.equal(continuous.save(), resumed.save());
});
test('read snapshots and provider context cannot mutate engine state', () => {
  const sim = new Simulation(); const snapshot = sim.snapshot(); snapshot.storage.food = 999; snapshot.npcs[0].wealth = 999;
  assert.notEqual(sim.snapshot().storage.food, 999); assert.notEqual(sim.snapshot().npcs[0].wealth, 999);
});
test('BFS routes around water, rejects blocked targets and returns no teleport', () => {
  const w = createWorld(); const path = findPath(w, { x: 24, y: 5 }, { x: 30, y: 5 }); assert.ok(path); assert.ok(path.length > 6);
  let from = { x: 24, y: 5 }; for (const p of path) { assert.equal(Math.abs(p.x - from.x) + Math.abs(p.y - from.y), 1); assert.notEqual(w.tiles[p.y * w.width + p.x], 'water'); from = p; }
  assert.equal(findPath(w, { x: 5, y: 5 }, { x: 27, y: 5 }), null);
});
test('sharing transfers actual food and creates trust, memory and source trail', () => {
  const w = prepared(), [giver, receiver] = w.npcs; giver.position = receiver.position = { x: 12, y: 11 };
  giver.inventory.food = 3; receiver.inventory.food = 0; receiver.needs.hunger = 78; hold(receiver, 'Idle'); hold(giver, 'Share', receiver.id, 1);
  const sim = load(w); sim.step(); const after = sim.snapshot(), a = after.npcs[0], b = after.npcs[1];
  assert.equal(a.inventory.food, 2); assert.equal(b.inventory.food, 1); assert.equal(after.stats.shares, 1);
  const event = after.events.find(e => e.kind === 'share')!; assert.ok(event);
  assert.equal(b.relationships[0].trust, 47); assert.ok(b.relationships[0].evidence.includes(event.id)); assert.ok(b.memories.some(m => m.sourceEventId === event.id)); assert.ok(after.llm.queue.length > 0);
});
test('utility chooses aid from hunger and empathy without resident-specific script', () => {
  const w = prepared(), [giver, receiver] = w.npcs;
  giver.personality.empathy = 100; giver.personality.diligence = 0; giver.personality.greed = 0; giver.inventory.food = 3;
  receiver.inventory.food = 0; receiver.needs.hunger = 85;
  const options = candidates(w, giver); assert.equal(options[0].kind, 'Share'); assert.equal(options[0].targetId, receiver.id);
});
test('theft moves resources and only nearby witnesses learn the culprit', () => {
  const w = prepared(), [thief, witness, absent] = w.npcs; thief.position = { x: 16, y: 10 }; thief.dailyTaken = 3; thief.personality.greed = 100;
  witness.position = { x: 16, y: 11 }; hold(witness, 'Idle'); hold(thief, 'Theft', 'b0', 1);
  const total = w.storage.food + thief.inventory.food; const sim = load(w); sim.step(); const after = sim.snapshot();
  assert.equal(after.storage.food + after.npcs[0].inventory.food, total); assert.equal(after.stats.thefts, 1);
  assert.equal(after.npcs[1].relationships.find(r => r.npcId === thief.id)?.trust, 15);
  assert.equal(after.npcs[2].relationships.find(r => r.npcId === thief.id), undefined);
  assert.equal(after.npcs[2].memories.length, 0); assert.equal(after.llm.queue.some(q => q.npcId === absent.id), false);
  assert.ok(after.npcs[1].knownRumors.length); assert.ok(after.events.some(e => e.kind === 'witness' && e.causeId));
});
test('rumors carry eyewitness source and apply a smaller indirect penalty', () => {
  const w = prepared(), [speaker, listener, suspect] = w.npcs;
  const theft = appendEvent(w, { kind: 'theft', actorId: suspect.id, importance: 80, description: 'theft' });
  const seen = appendEvent(w, { kind: 'witness', actorId: speaker.id, targetId: suspect.id, causeId: theft.id, importance: 80, description: 'witness' });
  speaker.knownRumors.push(seen.id); hold(speaker, 'Talk', listener.id, 1);
  const sim = load(w); sim.step(); const after = sim.snapshot(); const rumor = after.events.find(e => e.kind === 'rumor')!;
  assert.equal(rumor.causeId, seen.id); assert.ok(after.npcs[1].knownRumors.includes(seen.id)); assert.equal(after.npcs[1].relationships.find(r => r.npcId === suspect.id)?.trust, 31);
});
test('market trades conserve money and food and recheck available stock', () => {
  const w = prepared(), n = w.npcs[0]; n.position = { x: 17, y: 14 }; n.wealth = 30; n.inventory.food = 0; hold(n, 'Trade', 'buy', 1);
  const sim = load(w); sim.step(); const after = sim.snapshot();
  assert.equal(n.wealth + w.market.coins, after.npcs[0].wealth + after.market.coins);
  assert.equal(n.inventory.food + w.market.food, after.npcs[0].inventory.food + after.market.food);
  w.market.food = 0; const empty = load(w); empty.step(); assert.equal(empty.snapshot().npcs[0].inventory.food, 0); assert.ok(empty.snapshot().events.some(e => e.kind === 'failure'));
});
test('loans use owned food; default cites the actual agreement', () => {
  const w = prepared(), [borrower, lender] = w.npcs; borrower.inventory.food = 0; lender.inventory.food = 4; hold(borrower, 'Borrow', lender.id, 1);
  let sim = load(w); sim.step(); const after = sim.snapshot(); assert.equal(after.loans.length, 1); assert.equal(after.npcs[1].inventory.food, 2); assert.equal(after.npcs[0].inventory.food, 2);
  after.loans[0].due = after.tick + 1; for (const n of after.npcs) hold(n, 'Idle'); sim = load(after); sim.step();
  const result = sim.snapshot(), e = result.events.find(e => e.kind === 'default')!; assert.equal(e.causeId, result.loans[0].sourceEventId); assert.equal(result.npcs[1].relationships.find(r => r.npcId === borrower.id)?.trust, 17);
});
test('importance gate ignores routine events, deduplicates and respects budget', () => {
  const w = prepared();
  for (let i = 0; i < 100; i++) socialEvent(w, { kind: 'production', actorId: w.npcs[0].id, importance: 20, description: 'wood' });
  assert.equal(w.llm.requested, 0);
  for (const n of w.npcs) for (let i = 0; i < 5; i++) socialEvent(w, { kind: 'scarcity', actorId: n.id, importance: 75, description: 'scarcity' });
  assert.equal(w.llm.requested, 12); assert.equal(w.llm.dailyByNpc.npc0, 1); assert.equal(w.llm.queue.length, 12);
});
test('low importance memories fade; original immutable events remain', () => {
  const w = prepared(); socialEvent(w, { kind: 'share', actorId: 'npc0', targetId: 'npc1', importance: 46, description: 'share' });
  const id = w.npcs[0].memories[0].sourceEventId; w.tick += 144 * 30; for (let i = 0; i < 30; i++) decayMemories(w);
  assert.equal(w.npcs[0].memories.length, 0); assert.ok(w.events.some(e => e.id === id));
});
test('LLM cannot alter world properties or introduce unknown goals', () => {
  const w = prepared(); socialEvent(w, { kind: 'scarcity', actorId: 'npc0', importance: 80, description: 'scarcity' });
  const sim = load(w), request = sim.decisionContext()!; request.context.npc.wealth = 5000;
  const before = sim.snapshot(); assert.equal(sim.applyInterpretation(request.requestId, { newGoals: [], interpretation: 'money', relationshipInterpretations: [], wealth: 5000 }), false);
  assert.equal(sim.snapshot().npcs[0].wealth, before.npcs[0].wealth); assert.deepEqual(sim.snapshot().npcs[0].position, before.npcs[0].position); assert.equal(sim.snapshot().llm.rejected, 1);
  const another = load(w); assert.equal(another.applyInterpretation(another.decisionContext()!.requestId, { newGoals: [{ kind: 'teleport', reason: 'x' }], interpretation: 'x', relationshipInterpretations: [] }), false);
});
test('Mock processing is deterministic, records accepted goals without world mutations', async () => {
  const w = prepared(); socialEvent(w, { kind: 'scarcity', actorId: 'npc0', importance: 80, description: 'scarcity' });
  const a = load(w), b = load(w); const money = a.snapshot().npcs[0].wealth;
  await new DecisionCoordinator(a, new MockLLMProvider()).drain(); await new DecisionCoordinator(b, new MockLLMProvider()).drain();
  assert.equal(a.save(), b.save()); assert.equal(a.snapshot().llm.completed, 1); assert.equal(a.snapshot().npcs[0].wealth, money); assert.ok(a.snapshot().npcs[0].goals.some(g => g.kind === 'expand_farm' && g.sourceEventId));
});
test('provider timeout retries twice, then drops request; disposal discards late results', async () => {
  const w = prepared(); socialEvent(w, { kind: 'scarcity', actorId: 'npc0', importance: 80, description: 'scarcity' });
  const sim = load(w), provider = new MockLLMProvider(); provider.interpretEvent = () => new Promise(() => {});
  await new DecisionCoordinator(sim, provider, 5).drain(); assert.equal(sim.pending, 0); assert.equal(sim.snapshot().llm.failed, 1); assert.equal(sim.snapshot().events.filter(e => e.kind === 'llm').length, 3);
  const active = load(w); let resolve!: (result: unknown) => void;
  const pendingProvider = { ...provider, interpretEvent: () => new Promise(r => { resolve = r; }) } as unknown as LLMProvider;
  const coordinator = new DecisionCoordinator(active, pendingProvider), processing = coordinator.processOne(); coordinator.dispose(); resolve({ newGoals: [], interpretation: 'late', relationshipInterpretations: [] }); await processing;
  assert.equal(active.snapshot().llm.completed, 0);
});
test('malformed saves reject invalid references, resources, paths, versions and duplicate IDs', () => {
  for (const mutate of [(w: any) => w.version = 999, (w: any) => w.storage.food = -1, (w: any) => w.npcs[0].homeId = 'missing', (w: any) => w.rng = 0, (w: any) => w.npcs[1].id = w.npcs[0].id, (w: any) => w.tiles.pop(), (w: any) => w.events[0].causeId = w.events[0].id]) {
    const w = prepared(); mutate(w); assert.throws(() => load(w));
  }
  const w = prepared(); w.npcs[0].currentAction!.path = [{ x: 31, y: 23 }]; assert.throws(() => load(w));
});
test('100 days preserve emergent activity and bounded AI use, without requiring a scripted crime outcome', async () => {
  const sim = new Simulation(42), coordinator = new DecisionCoordinator(sim, new MockLLMProvider());
  for (let i = 0; i < 14400; i++) { sim.step(); if (sim.pending) await coordinator.drain(); }
  const w = sim.snapshot(), summary = summarize(w);
  assert.ok(w.events.some(e => e.kind === 'production')); assert.ok(w.events.some(e => e.kind === 'tax')); assert.ok(summary.llm.completed > 0);
  // Theft and eyewitness causality have dedicated controlled tests above. New economic
  // rules may remove the conditions for a crime in this particular seed.
  assert.ok(summary.llm.completed < w.events.length * .1); assert.ok(w.npcs.every(n => n.inventory.food >= 0 && n.inventory.wood >= 0 && n.wealth >= 0));
  assert.equal(Simulation.load(sim.save()).save(), sim.save());
});
