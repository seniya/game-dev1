import type { Position, WorldState } from './types';
export function walkable(w: Pick<WorldState, 'width' | 'height' | 'tiles'>, p: Position): boolean {
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < w.width && p.y < w.height && !['water', 'rock'].includes(w.tiles[p.y * w.width + p.x]);
}
export function findPath(w: Pick<WorldState, 'width' | 'height' | 'tiles'>, from: Position, to: Position): Position[] | null {
  if (!walkable(w, from) || !walkable(w, to)) return null;
  const start = from.y * w.width + from.x, end = to.y * w.width + to.x;
  if (start === end) return [];
  const parents = new Int32Array(w.width * w.height).fill(-1), queue = [start]; parents[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % w.width, y = Math.floor(index / w.width);
    for (const p of [{ x, y: y - 1 }, { x: x + 1, y }, { x, y: y + 1 }, { x: x - 1, y }]) {
      const next = p.y * w.width + p.x;
      if (!walkable(w, p) || parents[next] !== -1) continue;
      parents[next] = index;
      if (next === end) {
        const path: Position[] = [];
        for (let n = end; n !== start; n = parents[n]) path.push({ x: n % w.width, y: Math.floor(n / w.width) });
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}
