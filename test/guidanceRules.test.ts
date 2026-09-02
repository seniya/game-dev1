import { describe, expect, it } from 'vitest';
import {
  ALL_CONTROLS,
  HintId,
  controlHint,
  currentObjective,
  hintText,
  pickHint,
  type GuidanceState,
} from '../src/core/guidance';

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
    openJobs: 0,
    raiding: false,
    damagedBuildings: 0,
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

  it('창고 옆에서 자원을 들면 예치 키가 나타난다', () => {
    expect(controlHint(state({ carried: 2, nearStorage: true }))).toContain('E: 창고');
  });

  it('한 줄에 담는 항목 수에 상한이 있다 — 열한 개가 늘어서면 지금 쓸 키가 묻힌다', () => {
    const crowded = controlHint(
      state({
        carried: 5,
        nearStorage: true,
        wood: 20,
        stone: 20,
        buildings: 9,
        residents: 4,
        payableRequests: 2,
        openJobs: 2,
        onPortal: true,
        raiding: true,
        damagedBuildings: 3,
      }),
    );

    // 도움말 안내를 빼면 네 항목이다.
    expect(crowded.split(' · ')).toHaveLength(5);
    expect(crowded).toContain('H: 도움말');
  });

  it('급한 것이 앞에 온다 — 침입 중에는 몬스터가 먼저다', () => {
    const hint = controlHint(state({ raiding: true, carried: 3, nearStorage: true }));

    expect(hint.startsWith('Space: 몬스터 쫓기')).toBe(true);
  });

  it('도움말에 모든 키가 모인다 — 감춘 기능은 없는 기능이 된다', () => {
    const keys = ALL_CONTROLS.map((control) => control.keys).join(' ');

    for (const key of ['WASD', '방향키', 'Space', 'Q', 'E', 'B', 'X', 'R', 'F', 'G', 'V', 'H', '[ ]']) {
      expect(keys).toContain(key);
    }
  });

  it('자재가 생기면 건축 키가 나타난다', () => {
    expect(controlHint(state({ wood: 3 }))).toContain('B: 건축');
  });

  it('낼 수 있는 요청이 있으면 납품 키가 나타난다', () => {
    expect(controlHint(state({ payableRequests: 1 }))).toContain('R: 요청');
  });

  it('철거처럼 급하지 않은 키는 도움말에서 찾는다', () => {
    expect(controlHint(state({ buildings: 3 }))).not.toContain('X: 철거');
    expect(ALL_CONTROLS.some((control) => control.keys === 'X')).toBe(true);
  });

  it('건축 모드에서는 건축 조작만 보여준다', () => {
    const hint = controlHint(state({ buildMode: true, carried: 5 }));

    expect(hint).toContain('배치');
    expect(hint).not.toContain('WASD');
  });
});

describe('설계도 선택 안내', () => {
  it('건축 모드 안내가 개수에 상관없는 순환 키를 알린다', () => {
    // 예전에는 "1~5: 설계도"처럼 개수를 적었는데, 숫자 키가 아홉에서 상한에 닿았다.
    // 순환 키는 목록이 아무리 길어져도 그대로다.
    const hint = controlHint(state({ buildMode: true, blueprintCount: 12 }));

    expect(hint).toContain('[ ]: 설계도');
    expect(hint).not.toContain('1~12');
  });
});
