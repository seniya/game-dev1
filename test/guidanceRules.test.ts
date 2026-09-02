import { describe, expect, it } from 'vitest';
import { HintId, controlHint, currentObjective, hintText, pickHint, type GuidanceState } from '../src/core/guidance';

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
    blueprintCount: 3,
    onPortal: false,
    night: false,
    hasDeposited: false,
    ...overrides,
  };
}

describe('지금 할 일', () => {
  it('처음에는 목재를 모으라고 한다', () => {
    expect(currentObjective(state())).toContain('목재');
  });

  it('진행도를 함께 보여준다 — 얼마나 남았는지 알아야 한다', () => {
    expect(currentObjective(state({ wood: 5 }))).toContain('5/12');
  });

  it('목재가 차면 돌로 넘어간다', () => {
    const objective = currentObjective(state({ wood: 12 }));

    expect(objective).toContain('돌');
    expect(objective).toContain('0/4');
  });

  it('자재가 다 모이면 건축을 안내한다', () => {
    expect(currentObjective(state({ wood: 12, stone: 4 }))).toContain('B를 눌러');
  });

  it('건축 모드에서는 놓으라고 안내한다', () => {
    expect(currentObjective(state({ wood: 12, stone: 4, buildMode: true }))).toContain('놓으세요');
  });

  it('집을 지으면 이주를 기다리라고 한다', () => {
    expect(currentObjective(state({ houses: 1 }))).toContain('이주');
  });

  it('낼 수 있는 요청이 있으면 그것을 먼저 안내한다', () => {
    const objective = currentObjective(state({ houses: 1, residents: 1, payableRequests: 1 }));

    expect(objective).toContain('R로');
  });

  it('손에 자원을 들고 창고에서 멀면 돌아가라고 한다', () => {
    const objective = currentObjective(
      state({ houses: 1, residents: 1, carried: 5, nearStorage: false }),
    );

    expect(objective).toContain('창고');
  });

  it('할 일이 없으면 목표 레벨을 알린다', () => {
    const objective = currentObjective(state({ houses: 1, residents: 2, level: 2 }));

    expect(objective).toContain('마을 레벨 5');
  });

  it('목표를 달성하면 그렇게 알린다', () => {
    const objective = currentObjective(state({ houses: 3, residents: 5, level: 5 }));

    expect(objective).toContain('달성');
  });
});

describe('힌트 고르기', () => {
  it('아무 조건도 안 맞으면 없다', () => {
    expect(pickHint(state(), new Set())).toBeNull();
  });

  it('자원을 들면 예치를 알린다', () => {
    expect(pickHint(state({ carried: 3 }), new Set())).toBe(HintId.DEPOSIT);
  });

  it('자재가 모이면 건축을 알린다', () => {
    expect(pickHint(state({ wood: 12, stone: 4 }), new Set([HintId.DEPOSIT]))).toBe(HintId.BUILD);
  });

  it('요청이 오면 납품을 알린다', () => {
    const seen = new Set([HintId.DEPOSIT, HintId.BUILD]);

    expect(pickHint(state({ requests: 1 }), seen)).toBe(HintId.REQUEST);
  });

  it('건물이 늘면 철거를 알린다', () => {
    const seen = new Set([HintId.DEPOSIT, HintId.BUILD, HintId.REQUEST]);

    expect(pickHint(state({ buildings: 3 }), seen)).toBe(HintId.DEMOLISH);
  });

  it('이미 본 힌트는 다시 고르지 않는다', () => {
    expect(pickHint(state({ carried: 3 }), new Set([HintId.DEPOSIT]))).toBeNull();
  });

  it('모든 힌트에 문구가 있다', () => {
    for (const id of Object.values(HintId)) {
      expect(hintText(id).length).toBeGreaterThan(0);
    }
  });
});

describe('조작 안내', () => {
  it('처음에는 기본 조작만 보여준다', () => {
    const hint = controlHint(state());

    expect(hint).toContain('WASD');
    expect(hint).not.toContain('E: 창고');
    expect(hint).not.toContain('R: 요청');
    expect(hint).not.toContain('X: 철거');
  });

  it('자원을 들면 예치 키가 나타난다', () => {
    expect(controlHint(state({ carried: 2 }))).toContain('E: 창고');
  });

  it('자재가 생기면 건축 키가 나타난다', () => {
    expect(controlHint(state({ wood: 3 }))).toContain('B: 건축');
  });

  it('낼 수 있는 요청이 있으면 납품 키가 나타난다', () => {
    expect(controlHint(state({ payableRequests: 1 }))).toContain('R: 요청');
  });

  it('건물이 늘면 철거 키가 나타난다', () => {
    expect(controlHint(state({ buildings: 3 }))).toContain('X: 철거');
  });

  it('건축 모드에서는 건축 조작만 보여준다', () => {
    const hint = controlHint(state({ buildMode: true, carried: 5 }));

    expect(hint).toContain('배치');
    expect(hint).not.toContain('WASD');
  });
});

describe('설계도 선택 안내', () => {
  it('건축 모드 안내가 실제 설계도 수를 말한다', () => {
    // 3으로 박아 두었을 때, 다섯 종이 열린 뒤에도 "1~3"이라고 안내해
    // 네 번째와 다섯 번째를 아무도 고르지 않았다.
    expect(controlHint(state({ buildMode: true, blueprintCount: 5 }))).toContain('1~5: 설계도');
  });

  it('설계도가 하나뿐이면 범위로 말하지 않는다', () => {
    expect(controlHint(state({ buildMode: true, blueprintCount: 1 }))).toContain('1: 설계도');
  });
});
