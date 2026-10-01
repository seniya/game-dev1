import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/engine';
import { applyPlan, preparePlan, reflect } from '../src/sim/cognition';
import { retrieveMemories } from '../src/sim/memory-retrieval';
import { appendEvent, socialEvent } from '../src/sim/social';
import { compactWorld } from '../src/server/world';
import { chromeContext } from '../src/llm/chrome-contract';
import { balance } from '../src/sim/economy';
import type { Candidate, Memory } from '../src/sim/types';

function experiences() {
  const w = new Simulation().snapshot(), n = w.npcs[0]; w.tick = 40;
  for (let i = 0; i < 3; i++) socialEvent(w, { kind: 'share', actorId: n.id, targetId: w.npcs[1].id, importance: 65, description: `이웃과 식량을 나눈 경험 ${i}` });
  return { w, n };
}
test('retrieval balances relevance, access recency and importance without touching knowledge', () => {
  const base: Memory = { id: 'm1', type: 'social', description: 'retained', importance: 60, emotionalImpact: 20, createdAt: 0, relatedNpcIds: ['npc1'], relatedLocationIds: [], sourceEventId: 'e1', repetitions: 1 };
  const memories = [base, { ...base, id: 'm2', sourceEventId: 'e2', relatedNpcIds: ['npc2'], importance: 100 }];
  const before = JSON.stringify(memories);
  const hits = retrieveMemories(memories, 144, { npcIds: ['npc1'] }, 1);
  assert.equal(hits[0].memory.id, 'm1'); assert.equal(hits[0].relevance, 1);
  assert.equal(JSON.stringify(memories), before);
  assert.equal(retrieveMemories([{ ...base, lastRetrievedAt: 144 }], 144)[0].recency, 1);
  assert.equal(retrieveMemories(Array.from({ length: 40 }, (_, i) => ({ ...base, id: `m${i}` })), 144, {}, 99).length, 8);
});
test('accumulated distinct experiences form a cited reflection once and influence a later plan', () => {
  const { w, n } = experiences(); reflect(w, n);
  assert.equal(n.cognition!.reflections.length, 1);
  const r = n.cognition!.reflections[0]; assert.equal(r.goal, 'help_neighbor'); assert.equal(r.evidence.length, 3);
  const p = preparePlan(w, n); assert.equal(p.focus, 'help_neighbor'); assert.ok(p.evidence.includes(r.eventId));
  const count = w.events.length; w.tick += 40; reflect(w, n); assert.equal(w.events.length, count);
  const resumed = Simulation.load(JSON.stringify(w)); assert.equal(resumed.snapshot().npcs[0].cognition!.reflections.length, 1);
});
test('rumor and unobserved private events cannot become factual reflection evidence', () => {
  const w = new Simulation().snapshot(), n = w.npcs[0]; w.tick = 40;
  for (let i = 0; i < 4; i++) {
    socialEvent(w, { kind: 'rumor', actorId: n.id, importance: 70, description: `전해 들은 말 ${i}` });
    socialEvent(w, { kind: 'share', actorId: w.npcs[2].id, targetId: w.npcs[3].id, importance: 80, description: `사적인 도움 ${i}` });
  }
  reflect(w, n); assert.equal(n.cognition!.reflections.length, 0);
  assert.equal(n.memories.length, 4);
});
test('plans change feasible choices and urgent needs supersede the daily preference', () => {
  const { w, n } = experiences(); reflect(w, n); w.tick = 100;
  n.needs = { hunger: 20, thirst: 20, fatigue: 20, health: 100, social: 60, safety: 90 };
  const candidate = (kind: Candidate['kind']): Candidate => ({ kind, score: 50, reason: '가능한 행동', target: { ...n.position } });
  const options = [candidate('Work'), candidate('Share')]; applyPlan(w, n, options);
  assert.ok(options[1].score > options[0].score); assert.ok(options[1].evidence!.length);
  n.needs.thirst = 99; w.tick++; const urgent = [candidate('Share'), candidate('Drink')]; applyPlan(w, n, urgent);
  assert.equal(n.cognition!.plan!.interruption, 'thirst'); assert.equal(urgent[0].score, 50); assert.equal(urgent[1].score, 85);
  n.needs.thirst = 20; w.tick++; preparePlan(w, n); assert.equal(n.cognition!.plan!.interruption, undefined);
  assert.equal(n.cognition!.plan!.revision, 3);
  n.needs.hunger = 99; n.inventory.food = 0; w.tick++;
  const unrelated = [{ ...candidate('Trade'), targetId: 'goods:furniture' }, { ...candidate('Trade'), targetId: 'buy' }];
  applyPlan(w, n, unrelated); assert.equal(unrelated[0].score, 50); assert.equal(unrelated[1].score, 85);
});
test('legacy saves gain plans at decisions and checkpoint compaction retains forgotten reflection evidence', () => {
  const old = new Simulation().save(), sim = Simulation.load(old); sim.step(1);
  assert.ok(sim.snapshot().npcs.some(n => n.cognition?.plan));
  const { w, n } = experiences(); preparePlan(w, n);
  const evidence = n.cognition!.reflections[0].evidence; n.memories = [];
  for (let i = 0; i < 110; i++) appendEvent(w, { kind: 'weather', importance: 10, description: '기록 압축 시험' });
  const compact = compactWorld(w); for (const id of evidence) assert.ok(compact.events.some(e => e.id === id));
  const copy = Simulation.load(JSON.stringify(compact)); copy.step(50);
  assert.deepEqual(balance(copy.snapshot()), { food: 0, wood: 0, coins: 0 });
});
test('invalid reflection knowledge, day intervals and future retrieval timestamps fail import', () => {
  const { w, n } = experiences(); preparePlan(w, n);
  const check = (mutate: (copy: typeof w) => void, pattern: RegExp) => { const copy = structuredClone(w); mutate(copy); assert.throws(() => Simulation.load(JSON.stringify(copy)), pattern); };
  check(copy => { copy.npcs[0].cognition!.reflections[0].evidence[0] = copy.events[0].id; }, /성찰 근거/);
  check(copy => { copy.npcs[0].cognition!.plan!.blocks[1].start = 31; }, /계획 구간/);
  check(copy => { copy.npcs[0].memories[0].lastRetrievedAt = w.tick + 1; }, /검색 시간/);
  assert.ok(n.cognition!.plan);
});
test('Chrome retrieval remains English structured facts and excludes other residents and internal thoughts', () => {
  const { w, n } = experiences(); preparePlan(w, n);
  socialEvent(w, { kind: 'share', actorId: w.npcs[2].id, targetId: w.npcs[3].id, importance: 80, description: '비공개 비밀' });
  const request = w.llm.queue.find(q => q.npcId === n.id)!;
  const before = JSON.stringify(w); const context = chromeContext(w, request.id)!;
  assert.ok(context); assert.equal(JSON.stringify(w), before);
  assert.ok(!JSON.stringify(context).includes('비공개')); assert.ok(!JSON.stringify(context).includes('cognition'));
  assert.ok(context.memories.every(m => n.memories.some(known => known.sourceEventId === m.id)));
  n.memories.push({ ...n.memories[1], id: 'duplicate-description' });
  const deduplicated = chromeContext(w, request.id)!;
  assert.equal(new Set(deduplicated.memories.map(m => m.id)).size, deduplicated.memories.length);
});
test('model-off runs are deterministic through save, compact and continuation with bounded cognition', () => {
  const a = new Simulation(7); a.setLLM(false); a.step(144 * 8);
  const b = Simulation.load(a.save()); a.step(144 * 3); b.step(144 * 3); assert.equal(a.save(), b.save());
  const w = compactWorld(a.snapshot()); Simulation.load(JSON.stringify(w));
  assert.deepEqual(balance(w), { food: 0, wood: 0, coins: 0 });
  assert.ok(w.npcs.every(n => !n.cognition || n.cognition.reflections.length <= 8 && (n.cognition.retrieval?.items.length ?? 0) <= 8));
  assert.equal(w.llm.requested, 0);
});
