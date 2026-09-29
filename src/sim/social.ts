import { type WorldState, type NPC, type WorldEvent, type Relationship, TICKS_PER_DAY } from './types';
import { clamp, dayOf } from './random';

export type EventInput = Omit<WorldEvent, 'id' | 'tick' | 'participants' | 'data'> & { participants?: string[]; data?: WorldEvent['data'] };
const indexes = new WeakMap<WorldState, { size: number; byId: Map<string, WorldEvent> }>();
export function eventById(w: WorldState, id: string): WorldEvent | undefined {
  let index = indexes.get(w);
  if (!index) { index = { size: 0, byId: new Map() }; indexes.set(w, index); }
  while (index.size < w.events.length) { const e = w.events[index.size++]; index.byId.set(e.id, e); }
  return index.byId.get(id);
}
export function appendEvent(w: WorldState, input: EventInput): WorldEvent {
  const e: WorldEvent = { ...input, id: `e${w.nextId++}`, tick: w.tick, participants: input.participants ?? [input.actorId, input.targetId].filter((id): id is string => !!id), data: input.data ?? {} };
  w.events.push(e);
  return e;
}
export function relationship(n: NPC, targetId: string): Relationship {
  let r = n.relationships.find(r => r.npcId === targetId);
  if (!r) { r = { npcId: targetId, familiarity: 0, trust: 35, affection: 0, fear: 0, resentment: 0, respect: 20, family: false, interpretation: '아직 서로를 잘 모른다.', evidence: [] }; n.relationships.push(r); }
  return r;
}
export function changeRelationship(w: WorldState, n: NPC, targetId: string, changes: Partial<Pick<Relationship, 'familiarity' | 'trust' | 'affection' | 'fear' | 'resentment' | 'respect'>>, cause: WorldEvent, meaning: string) {
  const r = relationship(n, targetId), actual: string[] = [];
  for (const [key, amount] of Object.entries(changes)) {
    const k = key as keyof typeof changes, before = r[k];
    r[k] = clamp(before + amount);
    if (r[k] !== before) actual.push(`${key} ${r[k] - before > 0 ? '+' : ''}${r[k] - before}`);
  }
  r.interpretation = meaning;
  if (!r.evidence.includes(cause.id)) r.evidence.push(cause.id);
  appendEvent(w, { kind: 'relationship', actorId: n.id, targetId, importance: 30, causeId: cause.id, description: `${n.identity.name} → ${w.npcs.find(p => p.id === targetId)?.identity.name}: ${actual.join(', ') || '관계의 기억을 갱신'}`, data: { meaning } });
}
export function remember(w: WorldState, n: NPC, event: WorldEvent, description = event.description) {
  if (event.importance < 45 || !n.alive) return;
  const repeated = n.memories.find(m => dayOf(m.createdAt) === dayOf(w.tick) && m.type === memoryType(event) && m.relatedNpcIds.join(',') === event.participants.filter(id => id !== n.id).join(',') && m.description === description);
  if (repeated) { repeated.repetitions++; repeated.importance = clamp(repeated.importance + 2); return; }
  const memory = { id: `m${w.nextId++}`, type: memoryType(event), description, importance: event.importance, emotionalImpact: ['theft', 'witness', 'rumor', 'default', 'scarcity', 'death'].includes(event.kind) ? -event.importance : event.importance * .6, createdAt: w.tick, relatedNpcIds: event.participants.filter(id => id !== n.id), relatedLocationIds: event.locationId ? [event.locationId] : [], sourceEventId: event.id, repetitions: 1 };
  n.memories.push(memory);
  if (n.memories.length > 40) { n.memories.sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt); n.memories.length = 40; }
  appendEvent(w, { kind: 'memory', actorId: n.id, importance: 15, causeId: event.id, description: `${n.identity.name}의 기억: ${description}` });
}
function memoryType(e: WorldEvent): NPC['memories'][number]['type'] {
  if (['theft', 'witness', 'death'].includes(e.kind)) return 'trauma';
  if (['trade', 'loan', 'default', 'repayment', 'scarcity'].includes(e.kind)) return 'economic';
  if (e.kind === 'project') return 'achievement';
  return 'social';
}
export function gate(w: WorldState, n: NPC, e: WorldEvent) {
  if (!w.llm.enabled || e.importance < 65 || !e.participants.includes(n.id) || !n.alive) return;
  const key = `${n.id}:${e.kind}`;
  if (w.llm.gateKeys.includes(key) || (w.llm.dailyByNpc[n.id] ?? 0) >= 2 || w.llm.dailyTotal >= 12 || w.llm.queue.length >= 24) return;
  w.llm.gateKeys.push(key); w.llm.dailyByNpc[n.id] = (w.llm.dailyByNpc[n.id] ?? 0) + 1; w.llm.dailyTotal++; w.llm.requested++;
  w.llm.queue.push({ id: `q${w.nextId++}`, npcId: n.id, eventId: e.id, tick: w.tick, attempts: 0 });
}
export function socialEvent(w: WorldState, input: EventInput): WorldEvent {
  const e = appendEvent(w, input);
  for (const id of e.participants) {
    const n = w.npcs.find(p => p.id === id);
    if (n) { remember(w, n, e); gate(w, n, e); }
  }
  return e;
}
export function decayMemories(w: WorldState) {
  for (const n of w.npcs) {
    for (const memory of n.memories) memory.importance = Math.max(0, memory.importance - (memory.importance >= 75 ? .15 : 2));
    n.memories = n.memories.filter(m => m.importance > 15 || w.tick - m.createdAt < TICKS_PER_DAY);
  }
}
