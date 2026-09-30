import { DEFAULT_POPULATION } from '../sim/types';
import { characterSchema } from '../sim/character-schema';
import { RECOLLECTION_TOPICS, recollections, type RecollectionTopic } from '../sim/recollection';
import { historyContext, HISTORY_TOPICS, type HistoryTopic } from '../sim/history';
import { z } from 'zod';
import { Simulation } from '../sim/engine';
import { DecisionCoordinator } from '../llm/coordinator';
import { MockLLMProvider } from '../llm/provider';
import { motionTrace, movingTrace, type MotionTrace } from '../sim/motion';
import type { WorldState, WorldEvent } from '../sim/types';

export const commandSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('create-character'), character: characterSchema }).strict(),
    z.object({ type: z.literal('council'), settlementId: z.string().max(100), enabled: z.boolean() }).strict(),
    z.object({ type: z.literal('policy'), settlementId: z.string().max(100), taxRate: z.number().int().min(0).max(30), priority: z.enum(['road', 'water', 'sanitation', 'clinic', 'school']) }).strict(),
    z.object({ type: z.literal('detail'), focus: z.string().max(100), detail: z.enum(['full', 'focused']) }).strict(),
    z.object({ type: z.literal('sync') }).strict(),
    z.object({ type: z.literal('play'), running: z.boolean() }).strict(),
    z.object({ type: z.literal('speed'), speed: z.union([z.literal(1), z.literal(5), z.literal(20)]) }).strict(),
    z.object({ type: z.literal('offline'), enabled: z.boolean() }).strict(),
    z.object({ type: z.literal('step'), ticks: z.union([z.literal(1), z.literal(144)]) }).strict(),
    z.object({ type: z.literal('experiment'), kind: z.enum(['food', 'drought']) }).strict(),
    z.object({ type: z.literal('llm'), enabled: z.boolean() }).strict(),
    z.object({ type: z.literal('ai-mode'), mode: z.enum(['off', 'mock', 'remote', 'chrome']) }).strict(),
    z.object({ type: z.literal('history-ai'), topic: z.enum(HISTORY_TOPICS) }).strict(),
    z.object({ type: z.literal('dialogue'), speakerId: z.string().max(100), listenerId: z.string().max(100), topic: z.enum(RECOLLECTION_TOPICS).optional() }).strict(),
    z.object({ type: z.literal('reset'), seed: z.number().int().min(0).max(4294967295), population: z.number().int().min(10).max(3000).optional() }).strict(),
    z.object({ type: z.literal('import'), save: z.string().max(10_000_000) }).strict(),
  ]),
}).strict();
export type Command = z.infer<typeof commandSchema>;
export interface ClockState {
  pendingTicks?: number;
  createdCharacter?: { commandId: string; npcId: string };
  running: boolean; speed: 1 | 5 | 20; offline: boolean;
  clock: number; lastSeen: number; eventCount: number; socialCount: number;
  catchupTicks: number; skippedTicks: number; backupEpoch?: string;
  aiMode?: 'off' | 'mock' | 'remote' | 'chrome'; aiGeneration?: string;
  history?: { id: string; topic: HistoryTopic };
  dialogue?: { id: string; speakerId: string; listenerId: string; topic?: RecollectionTopic };
}
export interface StoredWorld { revision: number; epoch: string; meta: ClockState; state: WorldState }
export interface WorldView extends Omit<StoredWorld, 'state'> { state: WorldState; motion?: MotionTrace }
export function initialWorld(now: number): StoredWorld {
  const state = new Simulation(42, DEFAULT_POPULATION).snapshot();
  return { revision: 0, epoch: 'initial', state, meta: { running: false, speed: 1, offline: false, clock: now, lastSeen: now, eventCount: state.events.length, socialCount: 0, catchupTicks: 0, skippedTicks: 0 } };
}
export function viewWorld(w: StoredWorld, motion?: MotionTrace): WorldView {
  return { ...w, ...(motion ? { motion } : {}), state: { ...w.state, events: w.state.events.slice(-100), economy: { ...w.state.economy, daily: w.state.economy.daily.slice(-90) } } };
}
// Keep only events required by engine rules and their causal ancestors. The archive owns the full journal.
export function compactWorld(w: WorldState): WorldState {
  const byId = new Map(w.events.map(e => [e.id, e]));
  const keep = new Set(w.events.slice(-100).map(e => e.id));
  for (const n of w.npcs) {
    if (n.profile) keep.add(n.profile.arrivalEventId);
    if (w.urban?.citizens[n.id]?.healthEventId) keep.add(w.urban.citizens[n.id].healthEventId!);
    if (n.life?.birthEventId) keep.add(n.life.birthEventId);
    if (n.life?.deathEventId) keep.add(n.life.deathEventId);
    n.memories.forEach(m => keep.add(m.sourceEventId));
    n.relationships.forEach(r => r.evidence.forEach(id => keep.add(id)));
    n.goals.forEach(g => { if (g.sourceEventId) keep.add(g.sourceEventId); });
    n.knownRumors.forEach(id => keep.add(id));
    n.decision.candidates.forEach(c => c.evidence?.forEach(id => keep.add(id)));
    n.currentAction?.evidence?.forEach(id => keep.add(id));
  }
  w.civilization?.settlements.forEach(v => { if (v.sourceEventId) keep.add(v.sourceEventId); });
  w.civilization?.journeys.forEach(j => keep.add(j.sourceEventId));
  w.urban?.cities.forEach(c => { if (c.lastEventId) keep.add(c.lastEventId); if (c.policyEventId) keep.add(c.policyEventId); });
  w.urban?.enterprises.forEach(e => { if (e.sourceEventId) keep.add(e.sourceEventId); });
  w.urban?.freight.forEach(f => keep.add(f.sourceEventId));
  w.urban?.samples.forEach(s => keep.add(s.eventId));
  w.heritage?.habitats.forEach(h => { if (h.lastEventId) keep.add(h.lastEventId); });
  w.heritage?.councils.forEach(c => { if (c.lastEventId) keep.add(c.lastEventId); });
  w.heritage?.accords.forEach(r => { if (r.lastEventId) keep.add(r.lastEventId); if (r.deliveryEventId) keep.add(r.deliveryEventId); });
  w.loans.forEach(l => keep.add(l.sourceEventId));
  w.llm.queue.forEach(q => keep.add(q.eventId));
  w.economy.daily.forEach(d => keep.add(d.eventId));
  const queue = [...keep];
  for (let i = 0; i < queue.length; i++) {
    const e = byId.get(queue[i]);
    const refs = [...(e?.causeId ? [e.causeId] : []), ...(Array.isArray(e?.data.evidence) ? e.data.evidence : [])];
    for (const id of refs) if (!keep.has(id)) { keep.add(id); queue.push(id); }
  }
  return { ...w, events: w.events.filter(e => keep.has(e.id)) };
}
export async function applyCommand(current: StoredWorld, command: Command, now: number): Promise<{ world: StoredWorld; events: WorldEvent[]; replaced: boolean; motion?: MotionTrace }> {
  const meta = { ...current.meta };
  let sim = Simulation.load(JSON.stringify(current.state));
  let oldIds = new Set(current.state.events.map(e => e.id));
  let epoch = current.epoch, replaced = false;
  const a = command.action;
  const motion = a.type === 'sync' ? motionTrace(current.state) : undefined;
  // A visible observer sends a heartbeat every two seconds. Gaps over 15 seconds are offline.
  const gap = Math.max(0, now - meta.lastSeen), offline = gap > 15_000;
  const available = meta.running && (!offline || meta.offline) ? Math.floor(Math.max(0, now - meta.clock) * meta.speed / 700) : 0;
  const tickBudget = Math.max(1, Math.min(144, Math.floor(1728 / Math.max(12, current.state.npcs.filter(n => n.alive).length))));
  const ticks = Math.min(tickBudget, available);
  meta.catchupTicks = offline ? ticks : 0; meta.skippedTicks = available - ticks;
  const decisions = new DecisionCoordinator(sim, new MockLLMProvider());
  const useMock = meta.aiMode !== 'remote' && meta.aiMode !== 'chrome';
  for (let i = 0; i < ticks; i++) { sim.step(1, motion); if (useMock && sim.pending) await decisions.drain(); }
  meta.clock = available > tickBudget || offline || !meta.running ? now : meta.clock + ticks * 700 / meta.speed;
  meta.lastSeen = now;
  if (a.type === 'sync' && !meta.running && meta.pendingTicks) {
    const work = Math.min(tickBudget, meta.pendingTicks);
    for (let i = 0; i < work; i++) { sim.step(1, motion); if (useMock && sim.pending) await decisions.drain(); }
    meta.pendingTicks -= work;
  }
  if (a.type === 'play') { meta.running = a.running; meta.clock = now; meta.pendingTicks = 0; }
  if (a.type === 'speed') { meta.speed = a.speed; meta.clock = now; }
  if (a.type === 'offline') meta.offline = a.enabled;
  if (a.type === 'step') {
    meta.running = false; meta.clock = now;
    const work = Math.min(a.ticks, current.state.npcs.filter(n => n.alive).length > 400 ? tickBudget : 144);
    meta.pendingTicks = a.ticks - work;
    for (let i = 0; i < work; i++) { sim.step(); if (useMock && sim.pending) await decisions.drain(); }
  }
  if (a.type === 'create-character') meta.createdCharacter = { commandId: command.id, npcId: sim.createCharacter(a.character, command.id) };
  if (a.type === 'council') sim.setCouncil(a.settlementId, a.enabled);
  if (a.type === 'policy') sim.setPolicy(a.settlementId, a.taxRate, a.priority);
  if (a.type === 'detail') sim.setDetail(a.focus, a.detail);
  if (a.type === 'experiment') sim.experiment(a.kind);
  if (a.type === 'llm' || a.type === 'ai-mode') {
    meta.aiMode = a.type === 'ai-mode' ? a.mode : a.enabled ? 'mock' : 'off';
    meta.aiGeneration = command.id; delete meta.dialogue; delete meta.history;
    sim.setLLM(false); sim.setLLM(meta.aiMode !== 'off');
  }
  if (a.type === 'history-ai') {
    if (meta.aiMode !== 'remote' || !sim.snapshot().llm.enabled || meta.history || meta.dialogue || !historyContext(sim.snapshot().events, a.topic).cards.length) throw new Error('역사 조회: 외부 API 모드와 근거 사건을 확인해 주세요. 한 번에 하나씩 요청할 수 있습니다.');
    meta.history = { id: command.id, topic: a.topic };
  }
  if (a.type === 'dialogue') {
    const state = sim.snapshot(), speaker = state.npcs.find(n => n.id === a.speakerId), listener = state.npcs.find(n => n.id === a.listenerId);
    if (meta.aiMode === 'chrome') throw new Error('Chrome 목표 선택 모드에서는 주민 대화를 생성하지 않습니다. Mock 또는 외부 API 모드를 선택해 주세요.');
    if (!state.llm.enabled || meta.dialogue || meta.history || !speaker?.alive || !listener?.alive || speaker.id === listener.id || !recollections(speaker.memories, listener.id, a.topic).length) throw new Error('주민의 공유된 기억과 AI 설정을 확인해 주세요. 대화는 한 번에 하나씩 요청할 수 있습니다.');
    if (meta.aiMode === 'remote') meta.dialogue = { id: command.id, speakerId: speaker.id, listenerId: listener.id, ...(a.topic ? { topic: a.topic } : {}) };
    else {
      const memories = recollections(speaker.memories, listener.id, a.topic);
      const result = await new MockLLMProvider().generateDialogue({ speaker, listener, memories, topic: a.topic });
      sim.recordDialogue(speaker.id, listener.id, result.text.slice(0, 500), [memories[0].sourceEventId], command.id, 'mock');
    }
  }
  if (a.type === 'reset' || a.type === 'import') {
    sim = a.type === 'reset' ? new Simulation(a.seed, a.population ?? DEFAULT_POPULATION) : Simulation.load(a.save);
    // Cloud processing is bounded; larger local experiments remain available through the CLI.
    if (sim.snapshot().npcs.filter(n => n.alive).length > 3000) throw new Error('서버 세계는 생존 주민 3000명까지 지원합니다.');
    delete meta.createdCharacter;
    epoch = command.id; replaced = true; oldIds = new Set();
    meta.backupEpoch = current.epoch; meta.running = false; meta.clock = now;
    meta.pendingTicks = 0; meta.eventCount = 0; meta.socialCount = 0; meta.catchupTicks = 0; meta.skippedTicks = 0;
    // Imports never opt in to remote calls; retain the file's enabled flag for Mock compatibility.
    meta.aiMode = sim.snapshot().llm.enabled ? 'mock' : 'off'; meta.aiGeneration = command.id; delete meta.dialogue; delete meta.history;
  }
  const state = sim.snapshot(), events = state.events.filter(e => !oldIds.has(e.id));
  meta.eventCount += events.length;
  meta.socialCount += events.filter(e => ['share', 'talk', 'witness', 'rumor'].includes(e.kind)).length;
  return { world: { revision: current.revision + 1, epoch, meta, state: compactWorld(state) }, events, replaced, ...(motion ? { motion: movingTrace(motion) } : {}) };
}
