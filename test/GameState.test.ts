import { describe, expect, it } from 'vitest';
import { GameState } from '../src/sim/GameState';

describe('GameState', () => {
  it('초기 상태는 tick과 누적 시간이 0이다', () => {
    const state = new GameState();

    expect(state.tick).toBe(0);
    expect(state.elapsedMs).toBe(0);
  });

  it('스텝마다 tick이 늘고 시간이 스텝 길이만큼 누적된다', () => {
    const state = new GameState();
    for (let i = 0; i < 60; i += 1) state.step(1000 / 60);

    expect(state.tick).toBe(60);
    expect(state.elapsedMs).toBeCloseTo(1000, 5);
  });
});
