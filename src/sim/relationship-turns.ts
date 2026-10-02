import type { Relationship, WorldEvent } from './types';

export type BondStage = 'ordinary' | 'close' | 'conflict';
export interface BondMemory { stage: BondStage; lastTick: number }
export const TURN_LABELS: Record<string, string> = { close: '가까워진 순간', conflict: '갈등이 깊어진 순간', reconciled: '신뢰를 회복한 순간' };
export function bondStage(r: Relationship): BondStage {
  if (r.trust <= 20 || r.resentment >= 50) return 'conflict';
  if (r.trust >= 60 && r.affection >= 25 && r.familiarity >= 30) return 'close';
  return 'ordinary';
}
/** Directional experience, with separate entry/recovery thresholds and a three-day cooldown. */
export function recordBondTurn(r: Relationship, before: Relationship, tick: number, changed: boolean, cause: WorldEvent): string | undefined {
  if (!changed || cause.data.observer === true || cause.data.initialBond === true) return;
  const previous = before.turn?.stage ?? bondStage(before);
  let next = previous, turn: string | undefined;
  if (previous === 'conflict') {
    if (r.trust >= 40 && r.resentment <= 25) { next = bondStage(r); turn = 'reconciled'; }
  } else if (bondStage(r) === 'conflict') { next = 'conflict'; turn = 'conflict'; }
  else if (previous !== 'close' && bondStage(r) === 'close') { next = 'close'; turn = 'close'; }
  else if (previous === 'close' && (r.trust < 45 || r.affection < 15)) next = 'ordinary';
  if (turn && before.turn && tick - before.turn.lastTick < 3 * 144) return;
  if (turn) r.turn = { stage: next, lastTick: tick };
  else if (next !== previous) r.turn = { stage: next, lastTick: before.turn?.lastTick ?? tick };
  return turn;
}
