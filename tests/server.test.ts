import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/server/worker';
import { Simulation } from '../src/sim/engine';
import { applyCommand, compactWorld, initialWorld, type Command, type WorldView } from '../src/server/world';
import { Conflict, WorldStore } from '../src/server/store';

import { database } from './helpers/database';
function harness() {
  const db = database(), env = { TEST_AUTH: '1', DB: db, ASSETS: { fetch: () => new Response('asset') } } as never;
  const request = (path: string, data?: unknown, origin = 'https://world.test') => worker.fetch(new Request(`https://world.test/api/${path}`, data === undefined ? {} : { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), env);
  const get = async () => (await (await request('world')).json()) as WorldView;
  const send = async (action: Command['action'], revision: number, id = crypto.randomUUID()) => request('command', { id, revision, action });
  return { db, request, get, send };
}
test('server clock is bounded, paused by default and offline progression is opt-in', async () => {
  let w = initialWorld(1000);
  const cmd = (action: Command['action']): Command => ({ id: crypto.randomUUID(), revision: w.revision, action });
  w = (await applyCommand(w, cmd({ type: 'sync' }), 1_000_000)).world;
  assert.equal(w.state.tick, 36);
  w = (await applyCommand(w, cmd({ type: 'play', running: true }), 1_000_000)).world;
  w = (await applyCommand(w, cmd({ type: 'sync' }), 2_000_000)).world;
  assert.equal(w.state.tick, 36);
  w = (await applyCommand(w, cmd({ type: 'offline', enabled: true }), 2_000_000)).world;
  w = (await applyCommand(w, cmd({ type: 'sync' }), 3_000_000)).world;
  assert.equal(w.state.tick, 180); assert.equal(w.meta.catchupTicks, 144); assert.ok(w.meta.skippedTicks > 0);
  w = (await applyCommand(w, cmd({ type: 'sync' }), 3_000_000)).world;
  assert.equal(w.state.tick, 180);
});
test('compacted checkpoints reproduce the unabridged engine and preserve reference validation', () => {
  const baseline = new Simulation(42); baseline.setLLM(false);
  let compact = Simulation.load(baseline.save());
  for (let day = 0; day < 30; day++) {
    baseline.step(144); compact.step(144);
    compact = Simulation.load(JSON.stringify(compactWorld(compact.snapshot())));
  }
  const a = baseline.snapshot(), b = compact.snapshot();
  assert.ok(b.events.length < a.events.length);
  assert.deepEqual(JSON.parse(JSON.stringify({ ...a, events: [] })), JSON.parse(JSON.stringify({ ...b, events: [] })));
});
test('idempotent commands, stale revisions and concurrent devices cannot duplicate resources', async () => {
  const h = harness(), initial = await h.get(), id = crypto.randomUUID();
  const first = await h.send({ type: 'experiment', kind: 'food' }, initial.revision, id); assert.equal(first.status, 200);
  const retry = await h.send({ type: 'experiment', kind: 'food' }, initial.revision, id); assert.equal(retry.status, 200);
  assert.equal((await h.get()).state.storage.food, initial.state.storage.food + 24);
  assert.equal((await h.send({ type: 'step', ticks: 1 }, initial.revision)).status, 409);
  assert.equal((await h.send({ type: 'step', ticks: 1 }, initial.revision, id)).status, 409);
  const current = await h.get();
  const results = await Promise.all([h.send({ type: 'experiment', kind: 'food' }, current.revision), h.send({ type: 'experiment', kind: 'food' }, current.revision)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await h.get()).state.storage.food, initial.state.storage.food + 48);
});
test('restart, reset backup, indexed archive pagination and export preserve a valid world', async () => {
  const h = harness(); let w = await h.get();
  assert.equal((await h.send({ type: 'step', ticks: 144 }, w.revision)).status, 200);
  w = await h.get(); assert.ok(w.meta.eventCount > 100); assert.ok(w.state.events.length <= 100);
  const store = new WorldStore(h.db); await store.init(Date.now());
  assert.equal((await store.read()).state.tick, w.state.tick);
  const full = await (await h.request('export')).json(); Simulation.load(JSON.stringify(full));
  const page = await (await h.request('events?filter=all')).json() as { events: { id: string }[]; next: number };
  assert.equal(page.events.length, 40); assert.ok(page.next);
  const older = await (await h.request(`events?before=${page.next}`)).json() as typeof page;
  assert.ok(older.events.every(e => !page.events.some(p => p.id === e.id)));
  const life = await (await h.request(`events?npc=${w.state.npcs[0].id}&filter=life`)).json() as typeof page;
  assert.ok(life.events.length);
  assert.equal((await h.send({ type: 'reset', seed: 123 }, w.revision)).status, 200);
  const backup = await (await h.request('export?backup=1')).json();
  assert.deepEqual(backup, full);
  const reset = await h.get(); assert.equal(reset.state.seed, 123);
  assert.equal((await h.send({ type: 'import', save: JSON.stringify(backup) }, reset.revision)).status, 200);
  assert.deepEqual(await (await h.request('export')).json(), full);
});
test('cross-origin commands and malformed imports fail without changing persisted state', async () => {
  const h = harness(), w = await h.get();
  assert.equal((await h.request('command', { id: crypto.randomUUID(), revision: 0, action: { type: 'step', ticks: 1 } }, 'https://other.test')).status, 403);
  assert.equal((await h.send({ type: 'import', save: '{"version":999}' }, 0)).status, 400);
  assert.deepEqual(await h.get(), w);
});
test('archive cursors preserve imported event order independently of event ID spelling', async () => {
  const h = harness(), initial = await h.get();
  const state = new Simulation(7).snapshot(), first = state.events[0];
  state.requests.items = []; // This fixture replaces every source event with custom journal entries.
  state.events = Array.from({ length: 85 }, (_, i) => ({ ...first, id: `custom-record-${String(85 - i).padStart(3, '0')}`, description: `관측 ${i}` }));
  assert.equal((await h.send({ type: 'import', save: JSON.stringify(state) }, initial.revision)).status, 200);
  const exported = await (await h.request('export')).json(); assert.deepEqual(exported, JSON.parse(JSON.stringify(state)));
  const one = await (await h.request('events')).json() as { events: { description: string }[]; next: number };
  assert.equal(one.events[0].description, '관측 84');
  const two = await (await h.request(`events?before=${one.next}`)).json() as typeof one;
  assert.equal(two.events[0].description, '관측 44');
});

// The fake HTTP transport exercises the real adapter, D1 scheduler and engine boundary without billing.
import { processAI, aiStatus } from '../src/server/ai';
import { modelConfig, ServerModelProvider, interpretationInput } from '../src/server/model';
import { gate, appendEvent, socialEvent } from '../src/sim/social';
const modelEnv = { LLM_BASE_URL: 'https://model.test/v1', LLM_MODEL: 'test-model', LLM_API_KEY: 'private-test-key', LLM_DAILY_LIMIT: '2' };
function modelResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  assert.equal(String(input), 'https://model.test/v1/chat/completions');
  const body = JSON.parse(init!.body as string), context = JSON.parse(body.messages[1].content);
  const value = context.event ? { newGoals: [{ kind: 'secure_food', reason: '식량이 부족했던 경험' }], interpretation: '먹을 것을 준비하고 싶다.', relationshipInterpretations: [], evidence: [context.event.id] } : { text: '도움을 받았던 순간이 기억나.', evidence: [context.memories[0].sourceEventId] };
  return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 40 } });
}
async function remoteWorld(db = database()) {
  const store = new WorldStore(db); await store.init(Date.now());
  const initial = await store.read();
  const { world } = await applyCommand(initial, { id: crypto.randomUUID(), revision: initial.revision, action: { type: 'ai-mode', mode: 'remote' } }, Date.now());
  const event = appendEvent(world.state, { kind: 'scarcity', actorId: world.state.npcs[0].id, description: '식량이 부족하다.', importance: 75 });
  gate(world.state, world.state.npcs[0], event);
  world.meta.eventCount++;
  await store.commit(world, [event], 'remote-test', crypto.randomUUID());
  return { store, event };
}
test('server adapter validates schema and known evidence, strips hidden information and redacts errors', async () => {
  assert.equal(modelConfig({ ...modelEnv, LLM_BASE_URL: 'http://external.test/v1' }), null);
  assert.equal(modelConfig({ ...modelEnv, LLM_BASE_URL: 'https://user:secret@example.test/v1' }), null);
  assert.ok(modelConfig({ ...modelEnv, LLM_BASE_URL: 'http://localhost:11434/v1' }));
  const { store } = await remoteWorld();
  const c = Simulation.load(JSON.stringify((await store.read()).state)).decisionContext()!.context;
  c.event.data.secretThief = 'hidden-identity';
  assert.ok(!JSON.stringify(interpretationInput(c)).includes('hidden-identity'));
  const provider = new ServerModelProvider(modelConfig(modelEnv)!, async (url, init) => modelResponse(url, init));
  assert.ok((await provider.interpretEvent(c)).evidence.includes(c.event.id));
  for (const value of [
    { newGoals: [], interpretation: '거짓', relationshipInterpretations: [], evidence: ['made-up-event'] },
    { newGoals: [], interpretation: '거짓', relationshipInterpretations: [], evidence: [c.event.id], wealth: 999 },
    { newGoals: [{ kind: 'kill', reason: 'invalid' }], interpretation: '거짓', relationshipInterpretations: [], evidence: [c.event.id] },
  ]) {
    const p = new ServerModelProvider(modelConfig(modelEnv)!, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }));
    await assert.rejects(p.interpretEvent(c), /invalid_evidence_or_response/);
  }
  const failing = new ServerModelProvider(modelConfig(modelEnv)!, async () => { throw new Error('private-test-key'); });
  await assert.rejects(failing.interpretEvent(c), e => e instanceof Error && e.message === 'network_error');
});
test('concurrent AI wakeups reserve one call, apply once and preserve physical world state', async () => {
  const { store } = await remoteWorld(), before = await store.read(); let calls = 0;
  const fetcher: typeof fetch = async (url, init) => { calls++; await new Promise(r => setTimeout(r, 10)); return modelResponse(url, init); };
  await Promise.all([processAI(store, modelEnv, fetcher), processAI(store, modelEnv, fetcher)]);
  const after = await store.read();
  assert.equal(calls, 1); assert.equal(after.state.llm.completed, 1); assert.equal(after.state.llm.queue.length, 0);
  assert.equal(after.state.tick, before.state.tick);
  assert.deepEqual(after.state.npcs.map(n => [n.position, n.inventory, n.wealth, n.needs]), before.state.npcs.map(n => [n.position, n.inventory, n.wealth, n.needs]));
  Simulation.load(JSON.stringify(await store.export(after.epoch)));
  const status = await aiStatus(store.db, modelEnv);
  assert.equal((status.usage as { calls: number }).calls, 1); assert.equal(status.jobs[0].status, 'applied');
  await processAI(store, modelEnv, fetcher); assert.equal(calls, 1);
});
test('reset during model latency keeps simulation responsive and rejects the old response', async () => {
  const { store } = await remoteWorld(); let resolve!: () => void, started!: () => void;
  const start = new Promise<void>(r => { started = r; });
  const pending = processAI(store, modelEnv, async (url, init) => { started(); await new Promise<void>(r => { resolve = r; }); return modelResponse(url, init); });
  await start;
  const old = await store.read();
  const step = await applyCommand(old, { id: crypto.randomUUID(), revision: old.revision, action: { type: 'step', ticks: 1 } }, Date.now());
  await store.commit(step.world, step.events, 'step', crypto.randomUUID());
  assert.equal((await store.read()).state.tick, old.state.tick + 1);
  const reset = await applyCommand(step.world, { id: crypto.randomUUID(), revision: step.world.revision, action: { type: 'reset', seed: 123 } }, Date.now());
  await store.commit(reset.world, reset.events, 'reset', crypto.randomUUID());
  resolve(); await pending;
  assert.equal((await store.read()).state.seed, 123); assert.equal((await store.read()).state.llm.completed, 0);
  assert.equal((await aiStatus(store.db, modelEnv)).jobs[0].status, 'stale');
});
test('network failures retry with backoff and a real UTC budget that survives world resets', async () => {
  const { store } = await remoteWorld(); let calls = 0; const now = Date.now();
  const fail: typeof fetch = async () => { calls++; return new Response('secret backend details', { status: 503 }); };
  await processAI(store, modelEnv, fail, now);
  await processAI(store, modelEnv, fail, now + 1000); assert.equal(calls, 1);
  await processAI(store, modelEnv, fail, now + 31_000); assert.equal(calls, 2);
  await processAI(store, modelEnv, fail, now + 92_000); assert.equal(calls, 2);
  const status = await aiStatus(store.db, modelEnv, now);
  assert.equal((status.usage as { calls: number }).calls, 2); assert.equal(status.jobs[0].error, 'http_503');
  assert.ok(!JSON.stringify(status).includes('secret backend details'));
  const current = await store.read();
  const reset = await applyCommand(current, { id: crypto.randomUUID(), revision: current.revision, action: { type: 'reset', seed: 7 } }, now + 100_000);
  await store.commit(reset.world, reset.events, 'reset', crypto.randomUUID());
  assert.equal(((await aiStatus(store.db, modelEnv, now)).usage as { calls: number }).calls, 2);
});
test('invalid model results fail closed and unsupported remote settings cannot change the world', async () => {
  const h = harness(); const before = await h.get();
  assert.equal((await h.send({ type: 'ai-mode', mode: 'remote' }, before.revision)).status, 400);
  assert.deepEqual(await h.get(), before);
  const { store } = await remoteWorld();
  await processAI(store, modelEnv, async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"wealth":9999}' } }] }));
  const after = await store.read(); assert.equal(after.state.llm.failed, 1); assert.equal(after.state.llm.queue.length, 0);
  assert.equal((await aiStatus(store.db, modelEnv)).jobs[0].status, 'failed');
});
test('grounded dialogue cites only the speaker memories and never changes resources or relationships', async () => {
  const h = harness(); let w = await h.get();
  const state = new Simulation(42).snapshot();
  socialEvent(state, { kind: 'share', actorId: state.npcs[0].id, targetId: state.npcs[1].id, description: '식량을 나누었던 기억', importance: 60 });
  await h.send({ type: 'import', save: JSON.stringify(state) }, w.revision); w = await h.get();
  const speaker = w.state.npcs.find(n => n.alive && n.memories.some(m => m.relatedNpcIds.length)); assert.ok(speaker);
  const memory = speaker.memories.find(m => m.relatedNpcIds.length)!;
  const listenerId = memory.relatedNpcIds[0];
  assert.equal((await h.send({ type: 'dialogue', speakerId: speaker.id, listenerId }, w.revision)).status, 200);
  const after = await h.get();
  const event = after.state.events.find(e => e.data.dialogue); assert.ok(event);
  assert.ok((event.data.evidence as string[]).every(id => speaker.memories.some(m => m.sourceEventId === id)));
  assert.deepEqual(after.state.npcs, w.state.npcs);
  Simulation.load(JSON.stringify(await (await h.request('export')).json()));
});
test('server transport aborts timeouts, rejects oversized bodies and does not forward redirects', async () => {
  const { store } = await remoteWorld();
  const c = Simulation.load(JSON.stringify((await store.read()).state)).decisionContext()!.context;
  let aborted = false;
  const timeout = new ServerModelProvider(modelConfig(modelEnv)!, async (_url, init) => new Promise((_resolve, reject) => {
    assert.equal(init?.redirect, 'error');
    init!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  }), 10);
  await assert.rejects(timeout.interpretEvent(c), /timeout/); assert.ok(aborted);
  const huge = new ServerModelProvider(modelConfig(modelEnv)!, async () => new Response('x'.repeat(65_000)));
  await assert.rejects(huge.interpretEvent(c), /response_too_large/);
});
test('remote dialogue uses remembered evidence and preserves a replayable approved result', async () => {
  const { store } = await remoteWorld(); let w = await store.read();
  const event = socialEvent(w.state, { kind: 'share', actorId: w.state.npcs[0].id, targetId: w.state.npcs[1].id, description: '함께 식량을 나누었다.', importance: 60 });
  const added = w.state.events.slice(-3); // share + the two residents' memories
  assert.equal(added[0].id, event.id);
  w.meta.eventCount += added.length; w.revision++;
  await store.commit(w, added, 'memory', crypto.randomUUID());
  const c = await applyCommand(w, { id: crypto.randomUUID(), revision: w.revision, action: { type: 'dialogue', speakerId: w.state.npcs[0].id, listenerId: w.state.npcs[1].id } }, Date.now());
  await store.commit(c.world, c.events, 'dialogue', crypto.randomUUID());
  await processAI(store, modelEnv, async (url, init) => {
    const context = JSON.parse(JSON.parse(init!.body as string).messages[1].content);
    assert.deepEqual(Object.keys(context.listener).sort(), ['id', 'name']);
    return modelResponse(url, init);
  });
  const after = await store.read(); assert.equal(after.meta.dialogue, undefined);
  const e = after.state.events.find(e => e.data.dialogue)!; assert.ok(e); assert.deepEqual(e.data.evidence, [event.id]);
  const replay = Simulation.load(JSON.stringify(c.world.state));
  assert.ok(replay.recordDialogue(e.actorId!, e.targetId!, e.data.text as string, e.data.evidence as string[], e.data.requestId as string, e.data.model as string));
  assert.deepEqual(compactWorld(replay.snapshot()), after.state);
});
test('mode switches invalidate in-flight work and approved interpretation reproduces the same world', async () => {
  const { store } = await remoteWorld(); let release!: () => void, started!: () => void;
  const start = new Promise<void>(r => { started = r; });
  const pending = processAI(store, modelEnv, async (url, init) => { started(); await new Promise<void>(r => { release = r; }); return modelResponse(url, init); });
  await start;
  let w = await store.read();
  for (const mode of ['off', 'remote'] as const) {
    const result = await applyCommand(w, { id: crypto.randomUUID(), revision: w.revision, action: { type: 'ai-mode', mode } }, Date.now());
    await store.commit(result.world, result.events, mode, crypto.randomUUID()); w = result.world;
  }
  release(); await pending;
  assert.equal((await store.read()).state.llm.completed, 0);
  assert.equal((await aiStatus(store.db, modelEnv)).jobs[0].status, 'stale');
  // A saved ready outcome from a terminated request is applied using its original context, with no fetch.
  const fresh = await remoteWorld();
  await processAI(fresh.store, modelEnv, async (url, init) => modelResponse(url, init));
  const saved = await fresh.store.db.prepare('SELECT * FROM ai_jobs').first<{ id: string; context: string; result: string; request: string }>(); assert.ok(saved);
  const outcome = JSON.parse(saved.result).value;
  assert.ok(outcome.evidence.length);
  const context = JSON.parse(saved.context);
  const replay = new Simulation(42, 12).snapshot();
  const event = appendEvent(replay, { kind: 'scarcity', actorId: replay.npcs[0].id, description: '식량이 부족하다.', importance: 75 });
  gate(replay, replay.npcs[0], event);
  const sim = Simulation.load(JSON.stringify(replay));
  const { evidence, ...interpretation } = outcome;
  assert.equal(context.event.id, event.id);
  assert.ok(sim.applyInterpretation(saved.request, interpretation, { evidence, model: 'test-model' }));
  assert.deepEqual(compactWorld(sim.snapshot()), (await fresh.store.read()).state);
});
test('a stored ready result is recovered after a Worker restart without another model request', async () => {
  const { store } = await remoteWorld(); let calls = 0;
  const commit = store.commit;
  store.commit = async () => { throw new Error('simulated worker termination'); };
  await assert.rejects(processAI(store, modelEnv, async (url, init) => { calls++; return modelResponse(url, init); }), /termination/);
  store.commit = commit;
  assert.equal((await aiStatus(store.db, modelEnv)).jobs[0].status, 'ready');
  const restarted = new WorldStore(store.db); await restarted.init(Date.now());
  await processAI(restarted, modelEnv, async () => { calls++; throw new Error('unexpected second request'); });
  assert.equal(calls, 1); assert.equal((await restarted.read()).state.llm.completed, 1);
  assert.equal((await aiStatus(store.db, modelEnv)).jobs[0].status, 'applied');
});

import { claimChrome, processChrome, submitChrome, chromeSubmissionSchema } from '../src/server/chrome';
import { chromeContext, validateChromeResult, renderChromeResult, CHROME_LEASE_MS, CHROME_REST_MS, CHROME_DAILY_LIMIT, type ChromeLease } from '../src/llm/chrome-contract';
async function chromeWorld() {
  const store = new WorldStore(database()); await store.init(1000);
  const initial = await store.read();
  const { world } = await applyCommand(initial, { id: crypto.randomUUID(), revision: initial.revision, action: { type: 'ai-mode', mode: 'chrome' } }, 1000);
  world.state.storage.food += world.state.npcs[0].inventory.food; world.state.npcs[0].inventory.food = 0; world.state.npcs[0].needs.hunger = 80;
  socialEvent(world.state, { kind: 'scarcity', actorId: world.state.npcs[0].id, description: '절대 모델에 보내면 안 되는 한국어 자유문장', importance: 75, data: { secret: 'private hidden information' } });
  world.meta.eventCount = world.state.events.length;
  await store.commit(world, world.state.events.filter(e => !initial.state.events.some(old => old.id === e.id)), 'fixture', crypto.randomUUID());
  await processChrome(store, 1000);
  return store;
}
function chromeOutput(lease: ChromeLease) {
  const { context: _context, expires: _expires, ...envelope } = lease;
  return { ...envelope, output: JSON.stringify({ goals: [{ kind: 'expand_farm', reasonCode: 'food_security', evidence: [lease.context.trigger.id] }] }) };
}
test('Chrome context exports English rule facts only, distinguishes hearsay and excludes unknown secrets', () => {
  const world = new Simulation(42).snapshot(), [npc, other, hidden] = world.npcs;
  const theft = socialEvent(world, { kind: 'theft', actorId: hidden.id, importance: 80, description: '비공개 절도', data: { amount: 3 } });
  const rumor = socialEvent(world, { kind: 'rumor', actorId: other.id, targetId: npc.id, importance: 60, causeId: theft.id, description: '자유 소문', data: { suspectId: hidden.id, rootEventId: theft.id, secret: 'do not export' } });
  const event = socialEvent(world, { kind: 'scarcity', actorId: npc.id, importance: 70, description: '기근 비밀', data: { culprit: hidden.id } });
  const request = world.llm.queue.find(q => q.eventId === event.id)!;
  const context = chromeContext(world, request.id)!;
  const text = JSON.stringify(context);
  assert.ok(!/[가-힣]/.test(text)); assert.ok(!text.includes('secret')); assert.ok(!text.includes(theft.id + '"'));
  assert.equal(context.memories.find(m => m.id === rumor.id)?.knowledge, 'hearsay');
  assert.equal(context.memories.find(m => m.id === rumor.id)?.roles.reportedSuspect, hidden.id);
  assert.ok(!('causeId' in context.trigger)); assert.ok(!('identity' in context));
  event.kind = 'experiment'; assert.equal(chromeContext(world, request.id), null);
});
test('Chrome two devices get one lease; saved results survive ordinary ticks and replay exactly once', async () => {
  const store = await chromeWorld();
  const leases = await Promise.all([claimChrome(store, 62000), claimChrome(store, 62000)]);
  assert.equal(leases.filter(Boolean).length, 1); const lease = leases.find(Boolean)!;
  let current = await store.read();
  const stepped = await applyCommand(current, { id: crypto.randomUUID(), revision: current.revision, action: { type: 'step', ticks: 1 } }, 63000);
  await store.commit(stepped.world, stepped.events, 'tick', crypto.randomUUID());
  current = await store.read();
  const replay = Simulation.load(JSON.stringify(current.state));
  const value = validateChromeResult(chromeOutput(lease).output, lease.context);
  assert.ok(replay.applyInterpretation(current.state.llm.queue[0].id, renderChromeResult(value, lease.context), { model: 'chrome-built-in', evidence: [lease.context.trigger.id] }));
  assert.equal((await submitChrome(store, chromeOutput(lease), 64000)).state, 'applied');
  const applied = await store.read();
  assert.deepEqual(applied.state, compactWorld(replay.snapshot()));
  assert.equal((await submitChrome(store, chromeOutput(lease), 65000)).state, 'applied');
  assert.deepEqual(await store.read(), applied);
  assert.ok(applied.state.events.some(e => e.kind === 'goal' && e.data.model === 'chrome-built-in' && e.description.includes('Chrome AI가 제안한 목표')));
  assert.equal((await aiStatus(store.db, modelEnv, 65000)).usage?.calls, 0);
});
test('Chrome rejects altered leases, context, response shape, codes, evidence and direct state edits', async () => {
  const store = await chromeWorld(), lease = (await claimChrome(store, 62000))!, input = chromeOutput(lease);
  for (const field of ['token', 'epoch', 'generation', 'hash'] as const) {
    assert.equal((await submitChrome(store, { ...input, [field]: field === 'token' ? crypto.randomUUID() : 'tampered' }, 63000)).status, 409);
  }
  assert.equal(chromeSubmissionSchema.safeParse({ ...input, context: lease.context }).success, false);
  assert.equal(chromeSubmissionSchema.safeParse({ ...input, version: 2 }).success, false);
  const valid = JSON.parse(input.output);
  for (const response of [
    { ...valid, resources: { food: 1000 } }, { ...valid, position: { x: 0, y: 0 } }, { ...valid, relationships: [] },
    { goals: [{ ...valid.goals[0], kind: 'teleport' }] }, { goals: [{ ...valid.goals[0], reasonCode: 'mutual_help' }] },
    { goals: [{ ...valid.goals[0], evidence: ['unknown'] }] }, { goals: [{ ...valid.goals[0], reason: 'free text' }] },
    { goals: [valid.goals[0], valid.goals[0]] },
  ]) assert.throws(() => validateChromeResult(JSON.stringify(response), lease.context));
  assert.equal((await submitChrome(store, { ...input, output: JSON.stringify({ ...valid, wealth: 999 }) }, 63000)).status, 422);
  assert.equal((await store.read()).state.llm.completed, 0);
  assert.equal((await store.read()).state.llm.failed, 1);
});
test('Chrome expired leases can transfer to another device and old responses are rejected', async () => {
  const store = await chromeWorld(), first = (await claimChrome(store, 62000))!;
  assert.equal((await submitChrome(store, chromeOutput(first), 62000 + CHROME_LEASE_MS)).status, 409);
  const second = (await claimChrome(store, 62000 + CHROME_LEASE_MS + CHROME_REST_MS))!;
  assert.equal(first.id, second.id); assert.notEqual(first.token, second.token);
  assert.equal((await submitChrome(store, chromeOutput(first), 62001 + CHROME_LEASE_MS + CHROME_REST_MS)).status, 409);
  assert.equal((await submitChrome(store, chromeOutput(second), 62001 + CHROME_LEASE_MS + CHROME_REST_MS)).state, 'applied');
  assert.equal((await store.read()).state.llm.completed, 1);
});
test('Chrome abandoned requests stop at three attempts and use a separate UTC budget', async () => {
  const store = await chromeWorld();
  for (let i = 0; i < 3; i++) assert.ok(await claimChrome(store, 62000 + i * (CHROME_LEASE_MS + CHROME_REST_MS)));
  assert.equal(await claimChrome(store, 62000 + 3 * (CHROME_LEASE_MS + CHROME_REST_MS)), null);
  assert.equal((await store.read()).state.llm.failed, 1);
  const status = await aiStatus(store.db, modelEnv, 62000);
  assert.equal(status.chrome.usage?.calls, 3); assert.equal(status.usage?.calls, 0);
  const fresh = await chromeWorld();
  for (let i = 0; i < CHROME_DAILY_LIMIT; i++) await fresh.db.batch([fresh.db.prepare('INSERT INTO chrome_calls(token,job,day,started) VALUES(?,?,?,?)').bind(String(i), 'past', '1970-01-01', 1)]);
  assert.equal(await claimChrome(fresh, 62000), null);
  assert.ok(await claimChrome(fresh, 86_400_001));
});
test('Chrome reset, import and AI setting generation changes reject late output', async () => {
  for (const action of [{ type: 'reset', seed: 8 }, { type: 'import', save: new Simulation(9).save() }, { type: 'ai-mode', mode: 'off' }, { type: 'ai-mode', mode: 'chrome' }] as const) {
    const store = await chromeWorld(), lease = (await claimChrome(store, 62000))!, current = await store.read();
    const next = await applyCommand(current, { id: crypto.randomUUID(), revision: current.revision, action }, 63000);
    await store.commit(next.world, next.events, 'change', crypto.randomUUID());
    assert.equal((await submitChrome(store, chromeOutput(lease), 64000)).status, 409);
    await processChrome(store, 64000);
    assert.equal((await store.db.prepare('SELECT status FROM chrome_jobs WHERE id=?').bind(lease.id).first<{ status: string }>())!.status, 'stale');
  }
});
test('Chrome approved output is durable before apply, survives Worker restart and revision conflicts', async () => {
  const store = await chromeWorld(), lease = (await claimChrome(store, 62000))!, commit = store.commit;
  store.commit = async () => { throw new Error('terminated'); };
  await assert.rejects(submitChrome(store, chromeOutput(lease), 63000), /terminated/);
  store.commit = commit;
  assert.equal((await store.db.prepare('SELECT status FROM chrome_jobs').first<{ status: string }>())!.status, 'ready');
  const restarted = new WorldStore(store.db); await restarted.init(64000); await processChrome(restarted, 64000);
  assert.equal((await restarted.read()).state.llm.completed, 1);
  assert.equal((await aiStatus(store.db, modelEnv, 64000)).chrome.usage?.calls, 1);
  const fresh = await chromeWorld(), pending = (await claimChrome(fresh, 62000))!, original = fresh.commit;
  fresh.commit = async () => { throw new Conflict('concurrent tick'); };
  await submitChrome(fresh, chromeOutput(pending), 63000);
  fresh.commit = original;
  await processChrome(fresh, 65000);
  assert.equal((await fresh.read()).state.llm.completed, 1);
});
test('Chrome failures and unsupported context leave simulation running without calling an external model', async () => {
  const store = await chromeWorld(); let calls = 0;
  await processAI(store, modelEnv, async () => { calls++; throw new Error('must not call'); });
  const lease = (await claimChrome(store, 62000))!, { output: _output, ...envelope } = chromeOutput(lease);
  await submitChrome(store, { ...envelope, error: 'timeout' }, 63000);
  let current = await store.read();
  const next = await applyCommand(current, { id: crypto.randomUUID(), revision: current.revision, action: { type: 'step', ticks: 144 } }, 64000);
  await store.commit(next.world, next.events, 'continue', crypto.randomUUID());
  await processAI(store, modelEnv, async () => { calls++; throw new Error('must not call'); });
  assert.equal(calls, 0); assert.equal((await store.read()).state.tick, current.state.tick + 144);
  const unsupported = await chromeWorld(); current = await unsupported.read();
  const trigger = current.state.events.find(e => e.id === current.state.llm.queue[0].eventId)!; trigger.kind = 'experiment';
  await unsupported.commit({ ...current, revision: current.revision + 1 }, [], 'unsupported', crypto.randomUUID());
  assert.equal(await claimChrome(unsupported, 62000), null);
  assert.equal((await unsupported.read()).state.llm.failed, 1);
});
test('Chrome result routes reject cross-origin writes and malformed envelopes', async () => {
  const h = harness(); await h.get();
  assert.equal((await h.request('chrome/claim', {}, 'https://other.test')).status, 403);
  assert.equal((await h.request('chrome/claim', { context: 'client supplied' })).status, 400);
  assert.equal((await h.request('chrome/result', { output: '{}' })).status, 400);
  assert.equal((await (await h.request('chrome/claim', {})).json() as { lease: unknown }).lease, null);
});
