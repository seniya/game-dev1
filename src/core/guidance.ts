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
  /** 지금 통로 위에 서 있는지. 맵 이동 안내에 쓴다. */
  onPortal: boolean;
  /** 지금이 밤인지. 첫 밤에 한 번만 알린다. */
  night: boolean;
  /** 비어 있는 일터 자리 수. 배정 안내에 쓴다. */
  openJobs: number;
  /** 지금 몬스터가 마을에 있는지. */
  raiding: boolean;
  /** 손상된 건물 수. */
  damagedBuildings: number;
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
  /** 첫 밤이 왔을 때 — 시야가 좁아지는 이유를 알린다. */
  NIGHT: 'night',
  /** 일터가 비었을 때 — 주민을 배정할 수 있음을 알린다. */
  JOB: 'job',
  /** 첫 침입이 왔을 때 — 쫓는 법과 고치는 법을 알린다. */
  RAID: 'raid',
} as const;

/** 힌트 종류 값. */
export type HintId = (typeof HintId)[keyof typeof HintId];

/** 힌트별 문구. 대사창이 없으므로 한 줄로 끝나야 한다(기획서 7절). */
const HINT_TEXT: Readonly<Record<HintId, string>> = {
  [HintId.DEPOSIT]: '창고 옆에서 E를 누르면 자원을 맡깁니다',
  [HintId.BUILD]: 'B를 누르면 건축 모드입니다',
  [HintId.REQUEST]: '자재가 있으면 R로 주민 요청을 냅니다',
  [HintId.DEMOLISH]: 'X로 건물을 철거하면 자재 절반이 돌아옵니다',
  [HintId.NIGHT]: '밤에는 시야가 좁아집니다 — 아침이 오면 다시 넓어집니다',
  [HintId.JOB]: 'G로 일터에 주민을 배정하면 낮 동안 자원을 냅니다',
  [HintId.RAID]: '몬스터는 Space로 쫓습니다 — 손상된 건물도 Space로 고칩니다',
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
  // 첫 밤은 화면이 눈에 띄게 달라지는 순간이다. 왜 달라졌는지 한 번은 알려야 한다.
  if (!seen.has(HintId.NIGHT) && state.night) return HintId.NIGHT;
  // 일터를 지었는데 아무도 없으면 배정할 수 있다는 것을 모르고 지나칠 수 있다.
  if (!seen.has(HintId.JOB) && state.openJobs > 0 && state.residents > 0) return HintId.JOB;
  // 첫 침입은 놀랄 만한 사건이다. 무엇을 하면 되는지 그 자리에서 알려야 한다.
  if (!seen.has(HintId.RAID) && state.raiding) return HintId.RAID;

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

  // 침입 중에는 다른 목표가 의미가 없다. 오늘 밤을 넘기는 것이 할 일이다.
  if (state.raiding) return '몬스터를 쫓으세요 (Space)';
  if (state.damagedBuildings > 0) return '손상된 건물을 고치세요 (Space)';
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
  if (state.buildMode) {
    return '[ ]: 설계도 · 방향키: 부지 · Space: 배치 · B/Esc: 닫기';
  }

  // 상황에 따라 **가장 급한 것부터** 담고 앞에서 몇 개만 보여준다. 로드맵 03이 시스템을
  // 늘리며 이 줄이 열한 항목까지 길어졌고, 화면에서 보니 지금 쓸 키가 그 안에 묻혔다.
  const parts: string[] = [];

  if (state.raiding) parts.push('Space: 몬스터 쫓기');
  if (state.damagedBuildings > 0) parts.push('Space: 수리');
  if (state.onPortal) parts.push('F: 이동');
  if (state.payableRequests > 0) parts.push('R: 요청 납품');
  if (state.openJobs > 0 && state.residents > 0) parts.push('G: 일터 배정');
  if (state.carried > 0 && state.nearStorage) parts.push('E: 창고 예치');

  // 늘 쓰는 것은 뒤에 둔다. 위의 상황 항목이 없을 때 자리를 채운다.
  parts.push('WASD: 걷기', '방향키: 겨냥', 'Space: 채집·파기');
  if (state.wood > 0 || state.stone > 0) parts.push('B: 건축');

  return `${parts.slice(0, HINT_LIMIT).join(' · ')} · H: 도움말`;
}

/** 조작 안내 한 줄에 담는 최대 항목 수. */
const HINT_LIMIT = 4;

/** 도움말에 넣을 전체 조작 목록. 한 줄에 다 넣을 수 없는 것들이 여기 모인다. */
export const ALL_CONTROLS: ReadonlyArray<{ keys: string; what: string }> = [
  { keys: 'WASD', what: '걷기' },
  { keys: '방향키', what: '겨냥 — 행동할 칸을 고른다' },
  { keys: 'Space / 좌클릭', what: '겨냥한 칸에 행동(채집·파기·수리·몬스터 쫓기, 건축 모드에서는 배치)' },
  { keys: 'Q / 우클릭', what: '블록 쌓기' },
  { keys: '1~9', what: '도구 · 건축 모드에서는 설계도' },
  { keys: '[ ]', what: '건축 모드에서 설계도 넘기기' },
  { keys: 'E', what: '창고에 예치' },
  { keys: 'B', what: '건축 모드 켜고 끄기' },
  { keys: 'Esc', what: '건축 모드 끄기' },
  { keys: 'X', what: '건물 철거(자재 절반 회수)' },
  { keys: 'R', what: '주민 요청 납품' },
  { keys: 'F', what: '통로에서 동굴·지상 이동' },
  { keys: 'G', what: '일터에 주민 배정·해제' },
  { keys: 'V', what: '건물 바닥 색 바꾸기' },
  { keys: '+ -', what: '확대·축소' },
  { keys: 'C', what: '카메라를 플레이어에게 되돌리기' },
  { keys: 'H', what: '이 도움말 열고 닫기' },
];
