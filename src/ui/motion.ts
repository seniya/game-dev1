import type { NPC, Position } from '../sim/types';
import type { MotionTrace, Point } from '../sim/motion';

type Track = { points: Point[]; started: number; duration: number };
const equal = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const point = (n: NPC): Point => [n.position.x, n.position.y];
function progress(track: Track, now: number) { return track.duration ? Math.min(1, Math.max(0, (now - track.started) / track.duration)) * (track.points.length - 1) : track.points.length - 1; }
function sample(track: Track, now: number): Point {
  const p = progress(track, now), i = Math.floor(p), a = track.points[i], b = track.points[Math.min(i + 1, track.points.length - 1)], f = p - i;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
export class MotionPlayback {
  private tracks = new Map<string, Track>();
  update(previous: NPC[], next: NPC[], trace: MotionTrace | undefined, now: number, duration: number) {
    const old = new Map(previous.map(n => [n.id, n]));
    const living = new Set(next.filter(n => n.alive).map(n => n.id));
    for (const id of this.tracks.keys()) if (!living.has(id)) this.tracks.delete(id);
    for (const n of next) {
      if (!n.alive) continue;
      const before = old.get(n.id), target = point(n), track = this.tracks.get(n.id);
      const snap = () => this.tracks.set(n.id, { points: [target], started: now, duration: 0 });
      if (!before || !track || duration <= 0) { snap(); continue; }
      let path = trace?.paths[n.id];
      if (!path) {
        if (equal(point(before), target)) continue;
        // Older servers / read-only refreshes: use only the previously known route.
        const planned: Point[] = [point(before), ...(before.currentAction?.path ?? []).map(p => [p.x, p.y] as Point)];
        const end = planned.findIndex(p => equal(p, target));
        path = end > 0 ? planned.slice(0, end + 1) : undefined;
      }
      if (!path || !equal(path[0], point(before)) || !equal(path.at(-1)!, target) || path.some((p, i) => i > 0 && Math.abs(p[0] - path![i - 1][0]) + Math.abs(p[1] - path![i - 1][1]) > 1)) { snap(); continue; }
      // Retarget from the displayed point and finish the old confirmed route first.
      const at = progress(track, now), remaining = track.points.slice(Math.floor(at) + 1);
      const points = [sample(track, now), ...remaining, ...path.slice(1)];
      if (points.length > 300) { snap(); continue; }
      this.tracks.set(n.id, { points, started: now, duration });
    }
  }
  position(id: string, now: number): Position | undefined { const t = this.tracks.get(id); if (!t) return; const [x, y] = sample(t, now); return { x, y }; }
  active(now: number) { for (const t of this.tracks.values()) if (t.duration > 0 && now < t.started + t.duration) return true; return false; }
  finish() { for (const t of this.tracks.values()) { t.points = [t.points.at(-1)!]; t.duration = 0; } }
  clear() { this.tracks.clear(); }
}
