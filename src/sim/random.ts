export function random(state: { rng: number }): number {
  let x = state.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
export const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const dayOf = (tick: number) => Math.floor(tick / 144) + 1;
export function timeLabel(tick: number) { const minutes = (tick % 144) * 10; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
