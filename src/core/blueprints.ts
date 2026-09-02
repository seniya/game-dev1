import { ItemType } from './items';
import type { BuildingStyle } from '../render/WorldRenderer';

/** 블루프린트 식별자. */
export const BlueprintId = {
  /** 작은 집. 주민 1명이 산다. */
  COTTAGE: 'cottage',
  /** 큰 집. 주민 2명이 산다. */
  MANOR: 'manor',
  /** 대장간. 동굴의 수정을 써서 짓는다. */
  FORGE: 'forge',
  /** 채석장. 채석공이 돌을 내는 일터다. */
  QUARRY: 'quarry',
  /** 울타리. 몬스터의 길을 막는다. */
  FENCE: 'fence',
  /** 망루. 가까이 온 몬스터를 스스로 쫓는다. */
  WATCHTOWER: 'watchtower',
  /** 수정 등대. 밤에 마을을 밝힌다. */
  BEACON: 'beacon',
  /** 창고. 마을 저장 공간을 늘린다. */
  WAREHOUSE: 'warehouse',
  /** 우물. 주민 요청 대상이 되는 시설이다. */
  WELL: 'well',
  /** 작업대. 시설 요청 대상이다. */
  WORKBENCH: 'workbench',
} as const;

/** 블루프린트 식별자 값. */
export type BlueprintId = (typeof BlueprintId)[keyof typeof BlueprintId];

/** 필요 자재 한 항목. */
export interface MaterialRequirement {
  /** 아이템 종류. */
  readonly item: ItemType;
  /** 필요 개수. */
  readonly amount: number;
}

/** 블루프린트 하나. */
export interface Blueprint {
  /** 식별자. */
  readonly id: BlueprintId;
  /** 표시 이름. */
  readonly label: string;
  /** 렌더링 외형. */
  readonly style: BuildingStyle;
  /** 바닥 면적 가로 칸수. */
  readonly width: number;
  /** 바닥 면적 세로 칸수. */
  readonly depth: number;
  /** 필요 자재 목록. */
  readonly materials: readonly MaterialRequirement[];
  /** 이 블루프린트가 해금되는 마을 레벨. */
  readonly unlockLevel: number;
  /**
   * 손상이 한계를 넘으면 무너지는지.
   *
   * 울타리만 그렇다. 막으라고 세운 것이라 영원히 버티면 완전 봉쇄가 최적 전략이 되고,
   * 그 안에 몬스터가 갇힌다(ADR 0019). 다른 건물은 상하기만 하고 사라지지 않는다.
   */
  readonly breakable?: boolean;
  /** 완공 시 늘어나는 주민 수용 인원. 집이 아니면 0. */
  readonly housing: number;
  /** 완공 시 늘어나는 창고 슬롯 수. 창고가 아니면 0. */
  readonly storageSlots: number;
}

/**
 * MVP 블루프린트 5종 (기획서 8절: 집 2종, 창고, 우물, 작업대).
 *
 * 데이터를 JSON 파일이 아니라 코드 상수로 둔 근거는 `docs/adr/0006-건축-시스템.md`에 있다.
 * 자재 수치는 Phase 9 밸런싱 대상이며, 지금은 "집이 가장 비싸고 작업대가 가장 싸다"는
 * 서열과 목재 위주라는 성격만 맞춰 뒀다.
 */
export const BLUEPRINTS: readonly Blueprint[] = [
  {
    id: BlueprintId.COTTAGE,
    label: '작은 집',
    style: 'house',
    width: 2,
    depth: 2,
    materials: [
      { item: ItemType.WOOD, amount: 12 },
      { item: ItemType.STONE, amount: 4 },
    ],
    unlockLevel: 1,
    housing: 1,
    storageSlots: 0,
  },
  {
    id: BlueprintId.WELL,
    label: '우물',
    style: 'well',
    width: 1,
    depth: 1,
    materials: [{ item: ItemType.STONE, amount: 10 }],
    unlockLevel: 1,
    housing: 0,
    storageSlots: 0,
  },
  {
    id: BlueprintId.WORKBENCH,
    label: '작업대',
    style: 'workbench',
    width: 1,
    depth: 1,
    materials: [
      { item: ItemType.WOOD, amount: 6 },
      { item: ItemType.STONE, amount: 2 },
    ],
    unlockLevel: 1,
    housing: 0,
    storageSlots: 0,
  },
  {
    id: BlueprintId.WAREHOUSE,
    label: '창고',
    style: 'warehouse',
    width: 2,
    depth: 2,
    materials: [
      { item: ItemType.WOOD, amount: 10 },
      { item: ItemType.STONE, amount: 6 },
    ],
    unlockLevel: 2,
    housing: 0,
    storageSlots: 8,
  },
  {
    id: BlueprintId.MANOR,
    label: '큰 집',
    style: 'bigHouse',
    width: 3,
    depth: 2,
    materials: [
      { item: ItemType.WOOD, amount: 20 },
      { item: ItemType.STONE, amount: 10 },
      { item: ItemType.IRON_ORE, amount: 3 },
    ],
    unlockLevel: 3,
    housing: 2,
    storageSlots: 0,
  },
  {
    id: BlueprintId.FENCE,
    label: '울타리',
    style: 'fence',
    width: 1,
    depth: 1,
    materials: [{ item: ItemType.WOOD, amount: 3 }],
    // 침입이 시작되는 레벨과 같다. 막을 것이 없는데 울타리부터 열리면 쓸모를 모른다.
    unlockLevel: 4,
    breakable: true,
    housing: 0,
    storageSlots: 0,
  },
  {
    id: BlueprintId.WATCHTOWER,
    label: '망루',
    style: 'watchtower',
    width: 2,
    depth: 2,
    materials: [
      { item: ItemType.WOOD, amount: 8 },
      { item: ItemType.STONE, amount: 10 },
      { item: ItemType.IRON_ORE, amount: 2 },
    ],
    unlockLevel: 4,
    housing: 0,
    storageSlots: 0,
  },
  {
    id: BlueprintId.BEACON,
    label: '수정 등대',
    style: 'beacon',
    width: 1,
    depth: 1,
    materials: [
      { item: ItemType.STONE, amount: 12 },
      { item: ItemType.CRYSTAL, amount: 4 },
    ],
    // 수정의 두 번째 쓸모다. 대장간 하나만으로는 동굴에 다녀올 이유가 한 번으로 끝났다
    // (ADR 0014가 남긴 한계). 후반에 열려 레벨 11~20 구간의 할 일이 된다.
    unlockLevel: 11,
    housing: 0,
    storageSlots: 0,
  },
  {
    id: BlueprintId.QUARRY,
    label: '채석장',
    style: 'quarry',
    width: 2,
    depth: 2,
    materials: [
      { item: ItemType.WOOD, amount: 10 },
      { item: ItemType.STONE, amount: 12 },
    ],
    // 일터가 열리는 첫 자리다. 작업대(레벨 1)만으로는 목재밖에 나오지 않는다.
    unlockLevel: 4,
    housing: 0,
    storageSlots: 0,
  },
  {
    id: BlueprintId.FORGE,
    label: '대장간',
    style: 'forge',
    width: 2,
    depth: 2,
    materials: [
      { item: ItemType.STONE, amount: 14 },
      { item: ItemType.IRON_ORE, amount: 6 },
      { item: ItemType.CRYSTAL, amount: 3 },
    ],
    // 동굴이 열리는 레벨과 같다. 수정 없이는 지을 수 없으므로 목록에 먼저 보이고,
    // 동굴에 다녀와야 실제로 세워진다 — 갔다 온 보상이 마을에 남는 형태다.
    unlockLevel: 5,
    housing: 0,
    storageSlots: 0,
  },
];

/**
 * 식별자로 블루프린트를 찾는다.
 *
 * @param id 블루프린트 식별자.
 * @returns 블루프린트.
 * @throws 없는 식별자면 예외를 던진다.
 */
export function blueprintById(id: BlueprintId): Blueprint {
  const found = BLUEPRINTS.find((blueprint) => blueprint.id === id);
  if (!found) throw new RangeError(`없는 블루프린트다: ${id}`);

  return found;
}

/**
 * 특정 마을 레벨에서 지을 수 있는 블루프린트만 고른다.
 *
 * @param level 마을 레벨.
 * @returns 해금된 블루프린트 목록. 정의 순서를 유지한다.
 */
export function unlockedBlueprints(level: number): Blueprint[] {
  return BLUEPRINTS.filter((blueprint) => blueprint.unlockLevel <= level);
}

/**
 * 건축에 걸리는 시간을 구한다.
 *
 * 기획서 5.3은 "3~5초 정도의 짧은 건축 중 연출"을 명시한다. 바닥 면적이 클수록
 * 조금 더 걸리게 해 큰 건물이 더 큰일처럼 느껴지게 했다.
 *
 * @param blueprint 블루프린트.
 * @returns 건축 시간(ms).
 */
export function buildDurationMs(blueprint: Blueprint): number {
  const area = blueprint.width * blueprint.depth;

  return Math.min(5000, 3000 + area * 250);
}
