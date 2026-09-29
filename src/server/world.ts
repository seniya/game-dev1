import { z } from 'zod';
import { Simulation } from '../sim/engine';
import { DecisionCoordinator } from '../llm/coordinator';
import { MockLLMProvider } from '../llm/provider';
import type { WorldState, WorldEvent } from '../sim/types';

export const commandSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().nonnegative(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('sync') }).strict(),
    z.object({ type: z.literal('play'), running: z.boolean() }).strict(),
    z.object({ type: z.literal('speed'), speed: z.union([z.literal(1), z.literal(5), z.literal(20)]) }).strict(),
    z.object({ type: z.literal('offline'), enabled: z.boolean() }).strict(),
    z.object({ type: z.literal('step'), ticks: z.union([z.literal(1), z.literal(144)]) }).strict(),
    z.object({ type: z.literal('experiment'), kind: z.enum(['food', 'drought']) }).strict(),
    z.object({ type: z.literal('llm'), enabled: z.boolean() }).strict(),
    z.object({ type: z.literal('reset'), seed: z.number().int().min(0).max(4294967295) }).strict(),
    z.object({ type: z.literal('import'), save: z.string().max(10_000_000) }).strict(),
  ]),
}).strict();
export type Command = z.infer<typeof commandSchema>;
export interface ClockState {
  running: boolean; speed: 1 | 5 | 20; offline: boolean;
  clock: number; lastSeen: number; eventCount: number; socialCount: number;
  catchupTicks: number; skippedTicks: number; backupEpoch?: string;
}
export interface StoredWorld { revision: number; epoch: string; meta: ClockState; state: WorldState }
export interface WorldView extends Omit<StoredWorld, 'state'> { state: WorldState }
export function initialWorld(now: number): StoredWorld {
  const state = new Simulation(42).snapshot();
  return { revision: 0, epoch: 'initial', state, meta: { running: false, speed: 1, offline: false, clock: now, lastSeen: now, eventCount: state.events.length, socialCount: 0, catchupTicks: 0, skippedTicks: 0 } };
}
export function viewWorld(w: StoredWorld): WorldView {
  return { ...w, state: { ...w.state, events: w.state.events.slice(-100), economy: { ...w.state.economy, daily: w.state.economy.daily.slice(-90) } } };
}
// Keep only events required by engine rules and their causal ancestors. The archive owns the full journal.
export function compactWorld(w: WorldState): WorldState {
  const byId = new Map(w.events.map(e => [e.id, e]));
  const keep = new Set(w.events.slice(-100).map(e => e.id));
  for (const n of w.npcs) {
    n.memories.forEach(m => keep.add(m.sourceEventId));
    n.relationships.forEach(r => r.evidence.forEach(id => keep.add(id)));
    n.goals.forEach(g => { if (g.sourceEventId) keep.add(g.sourceEventId); });
    n.knownRumors.forEach(id => keep.add(id));
    n.decision.candidates.forEach(c => c.evidence?.forEach(id => keep.add(id)));
    n.currentAction?.evidence?.forEach(id => keep.add(id));
  }
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
export async function applyCommand(current: StoredWorld, command: Command, now: number): Promise<{ world: StoredWorld; events: WorldEvent[]; replaced: boolean }> {
  const meta = { ...current.meta };
  let sim = Simulation.load(JSON.stringify(current.state));
  let oldIds = new Set(current.state.events.map(e => e.id));
  let epoch = current.epoch, replaced = false;
  const a = command.action;
  // A visible observer sends a heartbeat every two seconds. Gaps over 15 seconds are offline.
  const gap = Math.max(0, now - meta.lastSeen), offline = gap > 15_000;
  const available = meta.running && (!offline || meta.offline) ? Math.floor(Math.max(0, now - meta.clock) * meta.speed / 700) : 0;
  const ticks = Math.min(144, available);
  meta.catchupTicks = offline ? ticks : 0; meta.skippedTicks = available - ticks;
  const decisions = new DecisionCoordinator(sim, new MockLLMProvider());
  for (let i = 0; i < ticks; i++) { sim.step(); if (sim.pending) await decisions.drain(); }
  meta.clock = available > 144 || offline || !meta.running ? now : meta.clock + ticks * 700 / meta.speed;
  meta.lastSeen = now;
  if (a.type === 'play') { meta.running = a.running; meta.clock = now; }
  if (a.type === 'speed') { meta.speed = a.speed; meta.clock = now; }
  if (a.type === 'offline') meta.offline = a.enabled;
  if (a.type === 'step') { meta.running = false; meta.clock = now; for (let i = 0; i < a.ticks; i++) { sim.step(); if (sim.pending) await decisions.drain(); } }
  if (a.type === 'experiment') sim.experiment(a.kind);
  if (a.type === 'llm') sim.setLLM(a.enabled);
  if (a.type === 'reset' || a.type === 'import') {
    sim = a.type === 'reset' ? new Simulation(a.seed) : Simulation.load(a.save);
    // Cloud processing is bounded; larger local experiments remain available through the CLI.
    if (sim.snapshot().npcs.length > 100) throw new Error('서버 세계는 주민 100명까지 지원합니다.');
    epoch = command.id; replaced = true; oldIds = new Set();
    meta.backupEpoch = current.epoch; meta.running = false; meta.clock = now;
    meta.eventCount = 0; meta.socialCount = 0; meta.catchupTicks = 0; meta.skippedTicks = 0;
  }
  const state = sim.snapshot(), events = state.events.filter(e => !oldIds.has(e.id));
  meta.eventCount += events.length;
  meta.socialCount += events.filter(e => ['share', 'talk', 'witness', 'rumor'].includes(e.kind)).length;
  return { world: { revision: current.revision + 1, epoch, meta, state: compactWorld(state) }, events, replaced };
}
