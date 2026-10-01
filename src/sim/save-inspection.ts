import { Simulation } from './engine';

export const SERVER_IMPORT_BYTES = 10_000_000;
export function inspectSave(save: string) {
  const bytes = new TextEncoder().encode(save).length;
  if (bytes > SERVER_IMPORT_BYTES) throw new Error('서버 가져오기는 UTF-8 기준 10MB까지 지원합니다.');
  const state = Simulation.load(save).snapshot();
  const living = state.npcs.filter(n => n.alive).length;
  if (living > 3000) throw new Error('서버 세계는 생존 주민 3000명까지 지원합니다.');
  return { bytes, seed: state.seed, tick: state.tick, living, people: state.npcs.length, events: state.events.length, version: state.version };
}
