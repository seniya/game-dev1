import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_STEPS_PER_FRAME,
  DEFAULT_STEP_MS,
  planSteps,
} from '../src/core/fixedTimestep';

describe('planSteps', () => {
  it('스텝 길이의 정확한 배수는 잔여 시간을 남기지 않는다', () => {
    const plan = planSteps(0, 50, 10, 10);

    expect(plan.steps).toBe(5);
    expect(plan.accumulator).toBeCloseTo(0);
    expect(plan.alpha).toBeCloseTo(0);
    expect(plan.droppedMs).toBe(0);
  });

  it('스텝에 못 미치는 시간은 실행하지 않고 다음 프레임으로 넘긴다', () => {
    const plan = planSteps(0, 4, 10, 10);

    expect(plan.steps).toBe(0);
    expect(plan.accumulator).toBeCloseTo(4);
    expect(plan.alpha).toBeCloseTo(0.4);
  });

  it('넘겨받은 잔여 시간을 합산해 스텝을 채운다', () => {
    const plan = planSteps(7, 4, 10, 10);

    expect(plan.steps).toBe(1);
    expect(plan.accumulator).toBeCloseTo(1);
  });

  it('프레임이 크게 밀리면 스텝 수를 상한으로 자르고 초과분을 버린다', () => {
    const plan = planSteps(0, 1000, 10, 5);

    expect(plan.steps).toBe(5);
    // 남은 950ms 중 한 스텝 미만인 잔여만 유지하고 나머지는 버린다.
    expect(plan.droppedMs).toBeCloseTo(950);
    expect(plan.accumulator).toBeLessThan(10);
    expect(plan.accumulator).toBeGreaterThanOrEqual(0);
  });

  it('상한에 걸려도 다음 프레임에 빚이 누적되지 않는다', () => {
    let accumulator = 0;
    // 100ms 프레임이 연달아 들어와도 잔여 시간은 계속 한 스텝 미만이어야 한다.
    for (let i = 0; i < 20; i += 1) {
      const plan = planSteps(accumulator, 100, 10, 5);
      accumulator = plan.accumulator;
      expect(accumulator).toBeLessThan(10);
    }
  });

  it('음수·NaN 입력은 0으로 취급한다', () => {
    expect(planSteps(-5, -5, 10, 10).steps).toBe(0);
    expect(planSteps(Number.NaN, Number.NaN, 10, 10).accumulator).toBe(0);
  });

  it('스텝 길이가 0 이하면 예외를 던진다', () => {
    expect(() => planSteps(0, 16, 0, 10)).toThrow(RangeError);
    expect(() => planSteps(0, 16, -1, 10)).toThrow(RangeError);
  });

  it('기본 스텝 길이는 60Hz이고 기본 상한은 5스텝이다', () => {
    expect(DEFAULT_STEP_MS).toBeCloseTo(1000 / 60);
    expect(DEFAULT_MAX_STEPS_PER_FRAME).toBe(5);
    expect(planSteps(0, 1000).steps).toBe(DEFAULT_MAX_STEPS_PER_FRAME);
  });
});
