import type { WorldState } from './types';

// Presentation-only trace. Never persisted or used to decide an action.
export type Point = [number, number];
export interface MotionTrace { fromTick: number; toTick: number; paths: Record<string, Point[]> }
export function motionTrace(world: WorldState): MotionTrace {
  return { fromTick: world.tick, toTick: world.tick, paths: Object.fromEntries(world.npcs.filter(n => n.alive).map(n => [n.id, [[n.position.x, n.position.y]]])) };
}
export function movingTrace(trace: MotionTrace): MotionTrace {
  return { ...trace, paths: Object.fromEntries(Object.entries(trace.paths).filter(([, path]) => path.some(p => p[0] !== path[0][0] || p[1] !== path[0][1]))) };
}
