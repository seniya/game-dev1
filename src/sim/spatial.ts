import type { NPC, WorldState } from './types';
import { distance } from './random';
interface Index { buckets: Map<string, Set<NPC>>; order: Map<string, number>; cells: Map<string, string> }
const indexes = new WeakMap<WorldState, Index>();
const key = (x: number, y: number) => `${Math.floor(x / 8)},${Math.floor(y / 8)}`;
export function indexPeople(w: WorldState) {
  // Reuse buckets between ticks; positions are updated in place. Rebuild only when membership changes.
  let i=indexes.get(w);
  if(!i||i.order.size!==w.npcs.length||w.npcs.some(n=>!i!.order.has(n.id))) { i={buckets:new Map(),order:new Map(),cells:new Map()}; indexes.set(w,i); }
  w.npcs.forEach((n, order) => { i!.order.set(n.id, order); updatePerson(w, n); });
}
export function updatePerson(w: WorldState, n: NPC) {
  const i = indexes.get(w); if (!i) return;
  const cell = key(n.position.x, n.position.y), previous = i.cells.get(n.id);
  if (previous === cell) return;
  if (previous) i.buckets.get(previous)?.delete(n);
  if (!i.buckets.has(cell)) i.buckets.set(cell, new Set());
  i.buckets.get(cell)!.add(n); i.cells.set(n.id, cell);
}
export function neighbours(w: WorldState, n: NPC, radius: number): NPC[] {
  const i = indexes.get(w); if (!i) return w.npcs.filter(p => distance(n.position, p.position) <= radius);
  const result: NPC[] = [];
  for (let y = Math.floor((n.position.y - radius) / 8); y <= Math.floor((n.position.y + radius) / 8); y++) for (let x = Math.floor((n.position.x - radius) / 8); x <= Math.floor((n.position.x + radius) / 8); x++) {
    for (const p of i.buckets.get(`${x},${y}`) ?? []) if (distance(n.position, p.position) <= radius) result.push(p);
  }
  return result.sort((a, b) => i.order.get(a.id)! - i.order.get(b.id)!);
}
const peopleIndexes = new WeakMap<WorldState, { count: number; byId: Map<string, NPC> }>();
export function person(w: WorldState, id: string | undefined): NPC | undefined {
  if (!id) return;
  let i = peopleIndexes.get(w);
  if (!i || i.count !== w.npcs.length) { i = { count: w.npcs.length, byId: new Map(w.npcs.map(n => [n.id, n])) }; peopleIndexes.set(w, i); }
  return i.byId.get(id);
}
