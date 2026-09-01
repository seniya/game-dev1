import { describe, expect, it } from 'vitest';
import { FpsCounter } from '../src/core/FpsCounter';

describe('FpsCounter', () => {
  it('샘플이 없으면 0을 돌려준다', () => {
    expect(new FpsCounter().fps).toBe(0);
  });

  it('일정한 프레임 간격은 해당 FPS로 환산된다', () => {
    const counter = new FpsCounter(10);
    for (let i = 0; i < 10; i += 1) counter.sample(1000 / 60);

    expect(counter.fps).toBeCloseTo(60, 5);
  });

  it('윈도우를 넘긴 오래된 샘플은 평균에서 밀려난다', () => {
    const counter = new FpsCounter(3);
    counter.sample(100); // 10fps 상당 — 이후 샘플들에 밀려나야 한다
    for (let i = 0; i < 3; i += 1) counter.sample(20);

    expect(counter.fps).toBeCloseTo(50, 5);
  });

  it('0 이하이거나 유한하지 않은 간격은 무시한다', () => {
    const counter = new FpsCounter(4);
    counter.sample(0);
    counter.sample(-16);
    counter.sample(Number.NaN);
    counter.sample(Number.POSITIVE_INFINITY);

    expect(counter.fps).toBe(0);
  });

  it('reset 후에는 다시 0에서 시작한다', () => {
    const counter = new FpsCounter(4);
    counter.sample(20);
    counter.reset();

    expect(counter.fps).toBe(0);
  });
});
