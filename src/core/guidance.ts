import { BlueprintId, blueprintById } from './blueprints';
import { ItemType, itemLabel } from './items';

/**
 * 안내를 정하는 데 필요한 게임 상태.
 *
 * `Game` 전체가 아니라 필요한 값만 받는다. 안내 규칙을 순수 함수로 두면 "이 상태에서
 * 무엇을 안내해야 하는가"를 테스트로 고정할 수 있다.
 */
export interface GuidanceState {
  /** 인벤토리와 창고를 합친 목재 수. */
  wood: number;
  /** 합친 돌 수. */
  stone: number;
  /** 인벤토리에 든 아이템 총 개수. */
  carried: number;
  /** 지금 창고에 손이 닿는지. */
  nearStorage: boolean;
  /** 완공된 집의 수. */
  houses: number;
  /** 주민 수. */
  residents: number;
  /** 완공된 건물 수(창고 포함). */
  buildings: number;
  /** 열린 요청 수. */
  requests: number;
  /** 지금 낼 수 있는 요청 수. */
  payableRequests: number;
  /** 마을 레벨. */
  level: number;
  /** 1차 목표 레벨. */
  goalLevel: number;
  /** 건축 모드인지. */
  buildMode: boolean;
  /** 지금 고를 수 있는 블루프린트 수. 숫자 키 안내에 쓴다. */
  blueprintCount: number;
  /** 창고에 한 번이라도 예치했는지. */
  hasDeposited: boolean;
}

/** 한 번만 보여주는 힌트의 종류. */
export const HintId = {
  /** 첫 자원을 얻었을 때 — 창고 예치를 알린다. */
  DEPOSIT: 'deposit',
  /** 첫 집을 지을 수 있게 됐을 때 — 건축 모드를 알린다. */
  BUILD: 'build',
  /** 첫 요청이 왔을 때 — 납품을 알린다. */
  REQUEST: 'request',
  /** 건물이 늘었을 때 — 철거를 알린다. */
  DEMOLISH: 'demolish',
} as const;

/** 힌트 종류 값. */
export type HintId = (typeof HintId)[keyof typeof HintId];

/** 힌트별 문구. 대사창이 없으므로 한 줄로 끝나야 한다(기획서 7절). */
const HINT_TEXT: Readonly<Record<HintId, string>> = {
  [HintId.DEPOSIT]: '창고 옆에서 E를 누르면 자원을 맡깁니다',
  [HintId.BUILD]: 'B를 누르면 건축 모드입니다',
  [HintId.REQUEST]: '자재가 있으면 R로 주민 요청을 냅니다',
  [HintId.DEMOLISH]: 'X로 건물을 철거하면 자재 절반이 돌아옵니다',
};

/**
 * 힌트 문구를 돌려준다.
 *
 * @param id 힌트 종류.
 * @returns 표시 문구.
 */
export function hintText(id: HintId): string {
  return HINT_TEXT[id];
}

/**
 * 지금 보여줄 힌트를 고른다. 이미 본 것은 제외한다.
 *
 * @param state 게임 상태.
 * @param seen 이미 본 힌트 목록.
 * @returns 보여줄 힌트. 없으면 null.
 */
export function pickHint(state: GuidanceState, seen: ReadonlySet<HintId>): HintId | null {
  if (!seen.has(HintId.DEPOSIT) && state.carried > 0) return HintId.DEPOSIT;
  if (!seen.has(HintId.BUILD) && canAffordCottage(state)) return HintId.BUILD;
  if (!seen.has(HintId.REQUEST) && state.requests > 0) return HintId.REQUEST;
  if (!seen.has(HintId.DEMOLISH) && state.buildings >= 3) return HintId.DEMOLISH;

  return null;
}

/**
 * 작은 집을 지을 자재가 있는지 확인한다.
 *
 * @param state 게임 상태.
 * @returns 자재가 충분하면 true.
 */
function canAffordCottage(state: GuidanceState): boolean {
  const cottage = blueprintById(BlueprintId.COTTAGE);

  return cottage.materials.every((requirement) => {
    const held = requirement.item === ItemType.WOOD ? state.wood : state.stone;

    return requirement.item === ItemType.IRON_ORE ? false : held >= requirement.amount;
  });
}

/**
 * 지금 할 일 한 줄을 만든다.
 *
 * 튜토리얼 창을 띄울 수 없으므로(기획서 7절) **다음 한 걸음만** 상시 보여주는 방식으로
 * 루프를 알린다. 순서는 게임의 진행 순서와 같다: 모으고 → 짓고 → 주민이 오고 → 요청을 낸다.
 *
 * @param state 게임 상태.
 * @returns 표시 문구.
 */
export function currentObjective(state: GuidanceState): string {
  const cottage = blueprintById(BlueprintId.COTTAGE);
  const needWood = cottage.materials.find((requirement) => requirement.item === ItemType.WOOD)?.amount ?? 0;
  const needStone = cottage.materials.find((requirement) => requirement.item === ItemType.STONE)?.amount ?? 0;

  // 첫 집을 짓기 전까지는 자재를 모으는 것이 유일한 할 일이다.
  if (state.houses === 0) {
    if (state.wood < needWood) {
      return `${itemLabel(ItemType.WOOD)}를 모으세요 (${state.wood}/${needWood})`;
    }
    if (state.stone < needStone) {
      return `${itemLabel(ItemType.STONE)}을 모으세요 (${state.stone}/${needStone})`;
    }
    return state.buildMode ? '평탄한 땅에 집을 놓으세요' : 'B를 눌러 집을 지으세요';
  }

  if (state.residents === 0) return '주민이 이주하기를 기다리세요';
  if (state.payableRequests > 0) return 'R로 주민 요청을 내세요';
  if (state.carried > 0 && !state.nearStorage) return '창고로 돌아가 자원을 맡기세요';
  if (state.level >= state.goalLevel) return '1차 목표를 달성했습니다';

  return `마을 레벨 ${state.goalLevel}을 목표로 마을을 키우세요`;
}

/**
 * 상황에 맞는 조작 안내를 만든다.
 *
 * 모든 키를 늘 늘어놓으면 정작 지금 쓸 키가 묻힌다. 지금 쓰는 것만 보여준다.
 *
 * @param state 게임 상태.
 * @returns 조작 안내 문구.
 */
export function controlHint(state: GuidanceState): string {
  // 설계도 개수는 마을 레벨에 따라 늘어난다. 문구에 3을 박아 두면 늘어난 뒤에
  // 안내가 거짓말을 한다 — 실제로 그렇게 어긋나 있었다.
  if (state.buildMode) {
    const picker = state.blueprintCount > 1 ? `1~${state.blueprintCount}` : '1';
    return `${picker}: 설계도 · 좌클릭: 배치 · B/Esc: 닫기 · 드래그/휠: 시야`;
  }

  const parts = ['WASD: 걷기', '1~3: 도구', '좌클릭: 채집/파기', '우클릭: 쌓기'];

  if (state.carried > 0) parts.push('E: 창고 예치');
  if (state.wood > 0 || state.stone > 0) parts.push('B: 건축');
  if (state.payableRequests > 0) parts.push('R: 요청 납품');
  if (state.buildings >= 3) parts.push('X: 철거');

  parts.push('드래그/휠: 시야');

  return parts.join(' · ');
}
