import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTOR_FACING, easeWalk, facingFromDelta, quantizeStride } from '../src/core/actorMotion';

describe('actorMotion 방향', () => {
  it('4방향 타일 델타를 바라보는 방향으로 바꾼다', () => {
    expect(facingFromDelta(1, 0)).toBe('east');
    expect(facingFromDelta(-1, 0)).toBe('west');
    expect(facingFromDelta(0, 1)).toBe('south');
    expect(facingFromDelta(0, -1)).toBe('north');
  });

  it('이동이 아닌 델타에서는 기존 방향을 유지한다', () => {
    expect(facingFromDelta(0, 0, 'east')).toBe('east');
    expect(facingFromDelta(1, 1)).toBe(DEFAULT_ACTOR_FACING);
  });
});

describe('actorMotion 보행 곡선', () => {
  it('smoothstep은 시작과 끝을 유지하면서 초반·후반을 완만하게 한다', () => {
    expect(easeWalk(0)).toBe(0);
    expect(easeWalk(0.5)).toBe(0.5);
    expect(easeWalk(1)).toBe(1);
    expect(easeWalk(0.25)).toBeLessThan(0.25);
    expect(easeWalk(0.75)).toBeGreaterThan(0.75);
  });

  it('스프라이트 캐시용 진행도는 유한한 프레임으로 묶는다', () => {
    expect(quantizeStride(0.24, 6)).toBe(1 / 6);
    expect(quantizeStride(-1, 6)).toBe(0);
    expect(quantizeStride(2, 6)).toBe(1);
  });
});
