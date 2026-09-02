import { describe, expect, it } from 'vitest';
import {
  DARK_RADIUS,
  LIT_RADIUS,
  MAX_DARKNESS,
  darkColor,
  darknessAt,
} from '../src/core/light';

describe('어둠의 세기', () => {
  it('밝은 반경 안은 전혀 어둡지 않다', () => {
    expect(darknessAt(0)).toBe(0);
    expect(darknessAt(LIT_RADIUS)).toBe(0);
  });

  it('가장 어두운 반경 밖은 더 어두워지지 않는다', () => {
    expect(darknessAt(DARK_RADIUS)).toBe(MAX_DARKNESS);
    expect(darknessAt(DARK_RADIUS * 3)).toBe(MAX_DARKNESS);
  });

  it('사이에서는 멀수록 어두워진다', () => {
    const near = darknessAt(LIT_RADIUS + 1);
    const far = darknessAt(DARK_RADIUS - 1);

    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(MAX_DARKNESS);
  });

  it('밝은 곳 바로 바깥이 급격히 어두워지지 않는다 — 빛의 경계가 원반처럼 보인다', () => {
    const span = DARK_RADIUS - LIT_RADIUS;
    const quarter = darknessAt(LIT_RADIUS + span * 0.25);

    // 선형이라면 최대치의 4분의 1일 자리다. 제곱 곡선이라 그보다 훨씬 옅다.
    expect(quarter).toBeLessThan(MAX_DARKNESS * 0.25);
  });

  it('완전한 암전은 아니다 — 길을 잃으면 캐주얼이 아니다', () => {
    expect(MAX_DARKNESS).toBeLessThan(1);
  });

  it('이상한 거리는 밝음으로 본다', () => {
    expect(darknessAt(Number.NaN)).toBe(0);
    expect(darknessAt(-5)).toBe(0);
  });

  it('색은 불투명도를 0~1로 자른다', () => {
    expect(darkColor(2)).toContain('1.000');
    expect(darkColor(-1)).toContain('0.000');
  });
});
