import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { attraction, charmPoints } from '../src/sim/attraction';
import { affinity } from '../src/sim/affinity';
import { relationship } from '../src/sim/social';
import { appearance } from '../src/sim/appearance';
import { candidates } from '../src/sim/decision';
import { formFamily } from '../src/sim/life';
import { balance } from '../src/sim/economy';

function setup() {
  const w = new Simulation(42).snapshot(), [a, b] = w.npcs;
  a.relationships = []; b.relationships = []; a.memories = []; b.memories = [];
  return { w, a, b, factor: (key: string) => attraction(w, a, b).factors.find(f => f.key === key)!.value };
}

test('impressions are directional and never mutate saves, random state or event evidence', () => {
  const { w, a, b } = setup(), before = JSON.stringify(w);
  assert.notEqual(attraction(w, a, b).value, attraction(w, b, a).value);
  assert.deepEqual(affinity(w, a, b).evidence, []);
  assert.equal(JSON.stringify(w), before);
  const loaded = Simulation.load(before).snapshot();
  assert.deepEqual(attraction(loaded, loaded.npcs[0], loaded.npcs[1]), attraction(w, a, b));
});

test('profession, age, health and personal assets each change the explained impression', () => {
  const { w, a, b, factor } = setup();
  a.occupation = b.occupation = 'farmer'; const same = factor('occupation');
  b.occupation = 'smith'; assert.ok(factor('occupation') < same);
  b.occupation = 'none'; assert.equal(factor('occupation'), 0);
  b.identity.age = a.identity.age; const peer = factor('age');
  b.identity.age += 40; assert.ok(factor('age') < peer);
  a.personality.sociability = 100; a.personality.empathy = 0;
  b.needs.health = 100; w.living.people[b.id].body.pain = 0; const healthy = factor('health');
  b.needs.health = 10; assert.ok(factor('health') < healthy);
  a.personality.empathy = 100; a.personality.sociability = 0;
  assert.ok(factor('health') > 0, 'empathy motivates care during illness');
  a.personality.greed = 100; w.living.people[a.id].traits.frugality = 100;
  b.wealth = 0; b.inventory = { food: 0, wood: 0 }; assert.equal(factor('assets'), 0);
  b.inventory.wood = 100; assert.equal(factor('assets'), 2);
  b.wealth = 100000; assert.equal(factor('assets'), 2);
});

test('style preferences reverse with curiosity while skin and hair color do not affect scores', () => {
  const { w, a, b, factor } = setup();
  b.profile = { appearance: { ...appearance(a) }, background: '', createdAt: 0, arrivalEventId: 'unused' };
  a.personality.curiosity = 0; const familiar = factor('appearance');
  b.profile.appearance = { ...b.profile.appearance, hairstyle: 'long', accessory: 'hat', outfit: '#ffffff' };
  const different = factor('appearance'); assert.ok(different < familiar);
  a.personality.curiosity = 100; assert.ok(factor('appearance') > different);
  const before = attraction(w, a, b);
  b.profile.appearance.skin = '#000000'; b.profile.appearance.hair = '#ffffff';
  assert.deepEqual(attraction(w, a, b), before);
  w.living.people[b.id].body.cleanliness = 0; assert.ok(factor('appearance') < before.factors.find(f => f.key === 'appearance')!.value);
});

test('personality strengths produce distinct charms and incompatible conduct causes friction', () => {
  const { w, a, b, factor } = setup();
  b.personality = { diligence: 10, greed: 90, sociability: 20, aggression: 80, empathy: 100, curiosity: 30 };
  w.living.people[b.id].traits = { patience: 40, optimism: 50, frugality: 60, independence: 70 };
  assert.equal(charmPoints(b.personality, w.living.people[b.id].traits)[0].label, '다정한 배려');
  a.personality.empathy = 100; a.personality.sociability = 20;
  w.living.people[a.id].traits.patience = 0;
  const warm = factor('personality');
  b.personality.empathy = 0; b.personality.aggression = b.personality.greed = 100;
  assert.ok(factor('personality') < warm);
  assert.ok(attraction(w, a, b).changes.trust < 0);
  assert.ok(attraction(w, a, b).changes.resentment > 0);
});

test('profile impressions influence real talk candidates without overriding a severe betrayal', () => {
  const { w, a, b } = setup();
  a.position = { x: 2, y: 15 }; b.position = { ...a.position };
  a.lastTalk = b.lastTalk = -100;
  a.personality.greed = 100; w.living.people[a.id].traits.frugality = 100;
  b.wealth = 0; b.inventory = { food: 0, wood: 0 };
  const talk = () => candidates(w, a).find(c => c.kind === 'Talk' && c.targetId === b.id)!;
  const initial = talk().score; b.wealth = 1000;
  assert.ok(talk().score > initial); assert.match(talk().reason, /현재 인상/);
  const r = relationship(a, b.id); r.trust = 0; r.affection = 0; r.resentment = 100; r.fear = 100;
  assert.ok(affinity(w, a, b).value < 0);
});

test('actual conversations apply different reciprocal changes and preserve their historical reasons', () => {
  const { w, a, b } = setup();
  for (const n of w.npcs) {
    n.position = { x: 2, y: 15 };
    n.currentAction = { kind: 'Idle', target: { ...n.position }, path: [], progress: 0, duration: 100, score: 1, reason: 'test' };
  }
  a.lastTalk = b.lastTalk = -100;
  a.personality.empathy = 100; b.personality.empathy = 0; b.personality.aggression = 100;
  a.currentAction = { ...a.currentAction!, kind: 'Talk', targetId: b.id, duration: 1 };
  const sim = Simulation.load(JSON.stringify(w)); sim.setLLM(false); sim.step();
  const after = sim.snapshot(), event = after.events.find(e => e.kind === 'talk' && e.actorId === a.id)!;
  assert.ok(event); assert.equal((event.data.factors as string[]).length, 7);
  assert.notEqual(event.data.affectionChange, event.data.reverseAffectionChange);
  const forward = after.npcs[0].relationships.find(r => r.npcId === b.id)!;
  const reverse = after.npcs[1].relationships.find(r => r.npcId === a.id)!;
  assert.equal(forward.affection, Math.max(0, event.data.affectionChange as number));
  assert.equal(reverse.affection, Math.max(0, event.data.reverseAffectionChange as number));
  assert.ok(forward.evidence.includes(event.id)); assert.ok(reverse.evidence.includes(event.id));
  const reasons = structuredClone(event.data); after.npcs[1].wealth += 1000;
  attraction(after, after.npcs[0], after.npcs[1]); assert.deepEqual(event.data, reasons);
  const restored = Simulation.load(sim.save()); sim.step(200); restored.step(200);
  assert.equal(sim.save(), restored.save()); assert.deepEqual(balance(sim.snapshot()), { food: 0, wood: 0, coins: 0 });
  assert.equal(sim.snapshot().llm.requested, 0);
});

test('all age groups keep finite bounded social scores and children cannot form partnerships', () => {
  const { w, a, b } = setup();
  for (const age of [0, 8, 17, 18, 65, 80]) for (const extreme of [0, 100]) {
    a.identity.age = age;
    for (const key of Object.keys(a.personality) as (keyof typeof a.personality)[]) a.personality[key] = extreme;
    const result = attraction(w, a, b);
    assert.ok(Number.isFinite(result.value) && result.value >= -8 && result.value <= 12);
    assert.ok(result.changes.affection >= -2 && result.changes.affection <= 5);
  }
  a.identity.age = 17;
  for (const r of [relationship(a, b.id), relationship(b, a.id)]) { r.trust = 100; r.affection = 100; }
  assert.equal(formFamily(w, a, b), false);
});
