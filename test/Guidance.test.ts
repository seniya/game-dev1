import { describe, expect, it } from 'vitest';
import { HintId, hintText, type GuidanceState } from '../src/core/guidance';
import { Guidance } from '../src/sim/Guidance';

/**
 * 기본 상태를 만든다.
 *
 * @param overrides 바꿀 값.
 */
function state(overrides: Partial<GuidanceState> = {}): GuidanceState {
  return {
    wood: 0,
    stone: 0,
    carried: 0,
    nearStorage: false,
    houses: 0,
    residents: 0,
    buildings: 1,
    requests: 0,
    payableRequests: 0,
    level: 1,
    goalLevel: 5,
    buildMode: false,
    hasDeposited: false,
    ...overrides,
  };
}

/**
 * 안내를 지정 시간만큼 진행하고 나온 힌트를 모은다.
 *
 * @param guidance 대상.
 * @param totalMs 진행할 시간(ms).
 * @param snapshot 상태.
 */
function advance(guidance: Guidance, totalMs: number, snapshot: GuidanceState): string[] {
  const stepMs = 1000 / 60;
  const hints: string[] = [];
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    const hint = guidance.update(stepMs, snapshot);
    if (hint) hints.push(hint);
  }
  return hints;
}

describe('Guidance 힌트 표시', () => {
  it('조건이 맞아도 곧바로 띄우지 않는다 — 다른 알림과 겹치지 않게', () => {
    const guidance = new Guidance();

    expect(advance(guidance, 500, state({ carried: 3 }))).toEqual([]);
  });

  it('잠시 뒤 한 번 띄운다', () => {
    const guidance = new Guidance();

    const hints = advance(guidance, 3000, state({ carried: 3 }));

    expect(hints).toEqual([hintText(HintId.DEPOSIT)]);
  });

  it('같은 힌트를 다시 띄우지 않는다', () => {
    const guidance = new Guidance();
    advance(guidance, 3000, state({ carried: 3 }));

    expect(advance(guidance, 10_000, state({ carried: 3 }))).toEqual([]);
  });

  it('조건이 여럿이면 하나씩 차례로 띄운다', () => {
    const guidance = new Guidance();
    const rich = state({ carried: 3, wood: 12, stone: 4, requests: 1, buildings: 3 });

    const hints = advance(guidance, 12_000, rich);

    expect(hints).toHaveLength(4);
    expect(new Set(hints).size).toBe(4);
  });

  it('본 힌트를 기록한다', () => {
    const guidance = new Guidance();
    advance(guidance, 3000, state({ carried: 3 }));

    expect(guidance.seenHints).toEqual([HintId.DEPOSIT]);
  });
});

describe('Guidance 진행도 저장', () => {
  it('되살리면 본 힌트를 다시 띄우지 않는다', () => {
    const guidance = new Guidance();

    guidance.restore([HintId.DEPOSIT], false);

    expect(advance(guidance, 5000, state({ carried: 3 }))).toEqual([]);
  });

  it('알 수 없는 힌트 이름은 버린다', () => {
    const guidance = new Guidance();

    guidance.restore(['없는힌트', HintId.BUILD], true);

    expect(guidance.seenHints).toEqual([HintId.BUILD]);
    expect(guidance.hasDeposited).toBe(true);
  });

  it('저장에 진행도가 없으면 처음부터 안내한다 — 예전 저장을 읽는 경우', () => {
    const guidance = new Guidance();

    guidance.restore(undefined, undefined);

    expect(guidance.seenHints).toEqual([]);
    expect(guidance.hasDeposited).toBe(false);
    expect(advance(guidance, 3000, state({ carried: 1 }))).toHaveLength(1);
  });

  it('예치 경험을 기록한다', () => {
    const guidance = new Guidance();

    expect(guidance.hasDeposited).toBe(false);
    guidance.markDeposited();
    expect(guidance.hasDeposited).toBe(true);
  });
});
