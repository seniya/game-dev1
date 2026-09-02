import { BLUEPRINTS } from './blueprints';
import { MapId, mapLabel } from './maps';
import { ToolKind, ToolTier } from './tools';
import { Zone, ZONE_ORDER } from './zones';

/**
 * 최대 마을 레벨.
 *
 * MVP는 5까지였고(기획서 8절), 로드맵 02 Phase 6에서 기획서 6절이 예로 든
 * "마을 레벨 10 달성"까지 늘렸다. 로드맵 03 Phase 8이 20까지 잇는다 — 1차 목표(10)를
 * 넘긴 뒤에도 마을을 키울 이유가 있어야 샌드박스가 된다(기획서 6절의 "엔딩 없이 지속 성장형").
 */
export const MAX_VILLAGE_LEVEL = 20;

/**
 * 1차 목표 레벨.
 *
 * 기획서 6절이 "'마을 레벨 10 달성' 같은 명확한 1차 목표를 UI에 상시 노출"하라고 한다.
 * 최대 레벨이 20이 된 뒤에도 **처음 잡는 목표는 10** 그대로다 — 20을 목표로 내걸면
 * 첫 화면에서부터 멀게 느껴지고, 10을 넘긴 뒤의 열 레벨은 목표가 아니라 여운이다.
 */
export const GOAL_VILLAGE_LEVEL = 10;

/**
 * 마을 레벨 산정에 들어가는 값들.
 *
 * 기획서 6절은 "건물 수, 주민 수, 요청 완료 수를 합산한 누적치"를 쓴다.
 * 다만 건물을 그대로 세면 **가장 싼 시설을 반복해 짓는 것이 최적 전략**이 된다.
 * 실제로 자동 플레이 봇을 돌려 보니 값싼 작업대·우물을 열아홉 채까지 늘리는 쪽으로
 * 수렴했다 — 마을이 사는 곳이 되는 것이 목표라는 기획 의도와 어긋난다.
 *
 * 그래서 **집은 채수대로, 시설은 종류당 한 번만** 센다. 시설은 마을에 있으면
 * 되는 것이지 여러 채 있다고 마을이 더 발전한 것은 아니다.
 *
 * 요청도 개수가 아니라 **완료 보상 합계**를 쓴다 — 시설 요청이 납품 요청보다
 * 큰일이므로 같은 1건으로 세면 서열이 사라진다.
 */
export interface VillageStats {
  /** 완공된 집의 수. 여러 채 지을수록 점수가 오른다. */
  houses: number;
  /** 완공된 시설의 **종류** 수. 같은 시설을 여러 채 지어도 한 번만 센다. */
  facilityTypes: number;
  /** 주민 수. */
  residents: number;
  /** 요청 완료로 누적된 경험치. */
  requestExperience: number;
}

/** 항목별 가중치. 주민이 가장 무겁다 — 마을이 사는 곳이 되는 것이 목표이기 때문이다. */
const WEIGHT = {
  house: 2,
  facilityType: 3,
  resident: 3,
} as const;

/**
 * 레벨별 필요 점수. 배열 인덱스가 `레벨 - 1`이다.
 *
 * 앞은 촘촘하고 뒤로 갈수록 벌어진다 — 첫 레벨업이 빨라야 진행 구조가 있다는 것이
 * 전달되고, 뒤로 갈수록 한 번의 레벨업이 커야 목표로 느껴진다.
 * 수치는 Phase 9 밸런싱 대상이다.
 */
export const LEVEL_THRESHOLDS: readonly number[] = [
  0, 8, 20, 38, 62, 90, 122, 158, 198, 242,
  // 11~20. 앞 구간의 간격(약 +40)을 조금씩 늘려 이어 붙인다. 후반이 급격히 길어지면
  // 진행이 멈춘 것처럼 보이고, 평평하면 레벨업이 가벼워진다.
  //
  // 값은 자동 플레이로 맞췄다. 처음 잡은 곡선(20 = 1012)에서는 봇이 18.8분에 도달했는데,
  // 봇 1분이 사람 8~12분이라 그것은 너무 길다. 20을 743으로 낮춰 봇 15분 안에 들어오게 했다.
  286, 331, 377, 425, 475, 527, 581, 638, 698, 761,
];

/** 해금 한 항목. */
export type Unlock =
  | { kind: 'zone'; zone: Zone }
  /** 새 맵이 열린다. */
  | { kind: 'map'; map: MapId }
  | { kind: 'tool'; tool: ToolKind; tier: ToolTier }
  | { kind: 'blueprint'; label: string }
  /** 인벤토리 슬롯이 늘어난다. */
  | { kind: 'inventory'; slots: number }
  /** 창고 슬롯이 늘어난다. */
  | { kind: 'storage'; slots: number }
  /** 이동이 빨라진다. 값은 배수다. */
  | { kind: 'speed'; multiplier: number }
  /** 채집이 빨라진다. 값은 배수다. */
  | { kind: 'harvest'; multiplier: number }
  /** 건물 외형이 하나 늘어난다. 규칙에는 영향이 없다. */
  | { kind: 'look'; label: string }
  /** 일터 한 채가 받는 자리가 늘어난다. */
  | { kind: 'jobSlot'; slots: number }
  /** 망루가 세진다. */
  | { kind: 'defense'; label: string }
  /** 자동 생산이 빨라진다. 값은 배수다. */
  | { kind: 'production'; multiplier: number };

/**
 * 레벨별 해금 목록(블루프린트는 `BLUEPRINTS`의 `unlockLevel`에서 파생한다).
 *
 * 철광석은 중급 곡괭이를 요구하고(기획서 5.2) 큰 집은 철광석을 요구하므로,
 * 중급 곡괭이와 큰 집이 같은 레벨에 열려야 진행이 막히지 않는다.
 */
const LEVEL_UNLOCKS: Readonly<Record<number, readonly Unlock[]>> = {
  2: [
    { kind: 'zone', zone: Zone.MOUNTAIN },
    { kind: 'tool', tool: ToolKind.AXE, tier: ToolTier.MID },
    { kind: 'tool', tool: ToolKind.SHOVEL, tier: ToolTier.MID },
  ],
  3: [
    { kind: 'tool', tool: ToolKind.PICKAXE, tier: ToolTier.MID },
    { kind: 'look', label: '푸른 지붕' },
  ],
  4: [
    { kind: 'tool', tool: ToolKind.AXE, tier: ToolTier.HIGH },
    { kind: 'tool', tool: ToolKind.SHOVEL, tier: ToolTier.HIGH },
  ],
  // 동굴과 고급 곡괭이는 **같은 레벨에 열려야 한다.** 동굴의 수정 광맥이 고급 곡괭이를
  // 요구하므로, 하나만 열리면 갈 수는 있는데 캘 것이 없거나 그 반대가 된다.
  5: [
    { kind: 'tool', tool: ToolKind.PICKAXE, tier: ToolTier.HIGH },
    { kind: 'map', map: MapId.CAVE },
  ],

  // 레벨 6부터는 새 콘텐츠 대신 **편의**를 연다. 로드맵 02는 완성도를 다루는 단계이고,
  // 새 자원·건물·지역은 로드맵 03의 영역이다. 자세한 근거는 ADR 0011에 있다.
  6: [{ kind: 'inventory', slots: 2 }, { kind: 'look', label: '초록 지붕' }],
  7: [{ kind: 'speed', multiplier: 1.2 }],
  8: [{ kind: 'storage', slots: 8 }],
  9: [
    { kind: 'inventory', slots: 2 },
    { kind: 'harvest', multiplier: 1.25 },
    { kind: 'look', label: '황금 지붕' },
  ],
  10: [{ kind: 'speed', multiplier: 1.15 }],

  // 레벨 11부터는 **1차 목표를 넘긴 마을**이다. ADR 0011이 "진짜 새로움은 로드맵 03이
  // 맡는다"고 남긴 자리이며, 여기서는 이미 열린 시스템(일터·망루·외형)을 키운다.
  // 새 자원이나 새 맵을 더 열지 않는 이유는 그것이 또 하나의 로드맵이기 때문이다.
  11: [{ kind: 'jobSlot', slots: 1 }],
  12: [{ kind: 'look', label: '붉은 지붕' }],
  13: [{ kind: 'defense', label: '망루 사거리 +2' }],
  14: [{ kind: 'inventory', slots: 2 }],
  15: [{ kind: 'harvest', multiplier: 1.25 }],
  16: [{ kind: 'jobSlot', slots: 1 }],
  17: [{ kind: 'storage', slots: 8 }],
  18: [{ kind: 'look', label: '검은 지붕' }],
  19: [{ kind: 'speed', multiplier: 1.15 }],
  20: [{ kind: 'production', multiplier: 1.5 }],
};

/**
 * 마을 점수를 계산한다.
 *
 * @param stats 산정 항목.
 * @returns 점수.
 */
export function villageScore(stats: VillageStats): number {
  const houses = Math.max(0, Math.floor(stats.houses));
  const facilities = Math.max(0, Math.floor(stats.facilityTypes));
  const residents = Math.max(0, Math.floor(stats.residents));
  const experience = Math.max(0, Math.floor(stats.requestExperience));

  return (
    houses * WEIGHT.house +
    facilities * WEIGHT.facilityType +
    residents * WEIGHT.resident +
    experience
  );
}

/**
 * 점수에 해당하는 레벨을 구한다.
 *
 * @param score 마을 점수.
 * @returns 1 이상 MAX_VILLAGE_LEVEL 이하의 레벨.
 */
export function levelForScore(score: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (score >= LEVEL_THRESHOLDS[i]!) level = i + 1;
  }

  return Math.min(MAX_VILLAGE_LEVEL, level);
}

/**
 * 다음 레벨에 필요한 점수를 구한다.
 *
 * @param level 현재 레벨.
 * @returns 다음 레벨 임계값. 최대 레벨이면 null.
 */
export function nextThreshold(level: number): number | null {
  if (level >= MAX_VILLAGE_LEVEL) return null;

  return LEVEL_THRESHOLDS[level] ?? null;
}

/**
 * 현재 레벨 구간에서의 진행도를 구한다.
 *
 * 레벨을 따로 받는 이유는 레벨이 점수에서만 오는 것이 아니기 때문이다 —
 * 테스트나 치트로 레벨을 직접 올린 경우 점수만 보면 진행도가 어긋난다.
 *
 * @param score 마을 점수.
 * @param level 현재 레벨. 생략하면 점수에서 구한다.
 * @returns 0~1 진행도. 최대 레벨이면 1.
 */
export function levelProgress(score: number, level = levelForScore(score)): number {
  const next = nextThreshold(level);
  if (next === null) return 1;

  const base = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const span = next - base;
  if (span <= 0) return 1;

  return Math.max(0, Math.min(1, (score - base) / span));
}

/**
 * 그 레벨에서 새로 열리는 항목을 구한다.
 *
 * @param level 도달한 레벨.
 * @returns 해금 목록.
 */
export function unlocksAtLevel(level: number): Unlock[] {
  const unlocks = [...(LEVEL_UNLOCKS[level] ?? [])];

  for (const blueprint of BLUEPRINTS) {
    if (blueprint.unlockLevel === level && level > 1) {
      unlocks.push({ kind: 'blueprint', label: blueprint.label });
    }
  }

  return unlocks;
}

/**
 * 그 레벨에서 채집할 수 있는 구역 목록을 구한다.
 *
 * 초원과 숲은 처음부터 열려 있다. 숲을 잠그면 첫 집에 필요한 목재를 모으는
 * 것부터 막혀 시작이 지루해진다.
 *
 * @param level 마을 레벨.
 * @returns 열린 구역 목록.
 */
export function unlockedZones(level: number): Zone[] {
  const open: Zone[] = [Zone.MEADOW, Zone.FOREST];

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    if (Number(unlockLevel) > level) continue;
    for (const unlock of unlocks) {
      if (unlock.kind === 'zone' && !open.includes(unlock.zone)) open.push(unlock.zone);
    }
  }

  return ZONE_ORDER.filter((zone) => open.includes(zone));
}

/**
 * 그 구역이 열려 있는지 확인한다.
 *
 * @param zone 구역.
 * @param level 마을 레벨.
 * @returns 열려 있으면 true.
 */
export function isZoneUnlocked(zone: Zone, level: number): boolean {
  return unlockedZones(level).includes(zone);
}

/**
 * 그 레벨에서 갈 수 있는 맵인지 확인한다.
 *
 * 구역 해금과 같은 방식이다 — **레벨에서 파생되므로 저장하지 않는다.** 되살릴 때
 * 레벨만 알면 같은 답이 나온다.
 *
 * @param map 맵 종류.
 * @param level 마을 레벨.
 * @returns 갈 수 있으면 true.
 */
export function isMapUnlocked(map: MapId, level: number): boolean {
  if (map === MapId.SURFACE) return true;

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    if (Number(unlockLevel) > level) continue;
    for (const unlock of unlocks) {
      if (unlock.kind === 'map' && unlock.map === map) return true;
    }
  }

  return false;
}

/**
 * 그 맵이 열리는 레벨을 구한다. 안내 문구에 쓴다.
 *
 * @param map 맵 종류.
 * @returns 열리는 레벨. 처음부터 열려 있으면 1.
 */
export function mapUnlockLevel(map: MapId): number {
  if (map === MapId.SURFACE) return 1;

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    for (const unlock of unlocks) {
      if (unlock.kind === 'map' && unlock.map === map) return Number(unlockLevel);
    }
  }

  return MAX_VILLAGE_LEVEL;
}

/**
 * 그 레벨까지 받은 도구 등급을 구한다.
 *
 * @param tool 도구 종류.
 * @param level 마을 레벨.
 * @returns 도구 등급.
 */
export function toolTierAtLevel(tool: ToolKind, level: number): ToolTier {
  let tier: ToolTier = ToolTier.BASIC;

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    if (Number(unlockLevel) > level) continue;
    for (const unlock of unlocks) {
      if (unlock.kind === 'tool' && unlock.tool === tool && unlock.tier > tier) tier = unlock.tier;
    }
  }

  return tier;
}

/**
 * 해금 항목을 사람이 읽는 문구로 만든다. 토스트에 쓴다.
 *
 * @param unlock 해금 항목.
 * @returns 문구.
 */
export function describeUnlock(unlock: Unlock): string {
  if (unlock.kind === 'zone') {
    const label = { meadow: '초원', forest: '숲', mountain: '산악' }[unlock.zone];
    return `${label} 개방`;
  }
  if (unlock.kind === 'tool') {
    const toolLabels = { axe: '도끼', pickaxe: '곡괭이', shovel: '삽' };
    const tierLabels = { 1: '초급', 2: '중급', 3: '고급' } as Record<number, string>;
    return `${tierLabels[unlock.tier]} ${toolLabels[unlock.tool]}`;
  }
  if (unlock.kind === 'map') return `${mapLabel(unlock.map)} 개방`;
  if (unlock.kind === 'look') return `${unlock.label} (V로 교체)`;
  if (unlock.kind === 'jobSlot') return `일터 자리 +${unlock.slots}`;
  if (unlock.kind === 'defense') return unlock.label;
  if (unlock.kind === 'production') {
    return `생산 속도 +${Math.round((unlock.multiplier - 1) * 100)}%`;
  }
  if (unlock.kind === 'inventory') return `인벤토리 슬롯 +${unlock.slots}`;
  if (unlock.kind === 'storage') return `창고 슬롯 +${unlock.slots}`;
  if (unlock.kind === 'speed') return `이동 속도 +${Math.round((unlock.multiplier - 1) * 100)}%`;
  if (unlock.kind === 'harvest') return `채집 속도 +${Math.round((unlock.multiplier - 1) * 100)}%`;

  return `${unlock.label} 설계도`;
}

/**
 * 그 레벨까지 쌓인 배수형 보너스를 곱해 구한다.
 *
 * 레벨업마다 배수가 곱해지므로, 되살린 게임에서도 레벨만 알면 같은 값이 나온다 —
 * 보너스를 따로 저장할 필요가 없다.
 *
 * @param kind 보너스 종류.
 * @param level 마을 레벨.
 * @returns 누적 배수. 해당 보너스가 없으면 1.
 */
export function bonusMultiplier(kind: 'speed' | 'harvest' | 'production', level: number): number {
  let multiplier = 1;

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    if (Number(unlockLevel) > level) continue;
    for (const unlock of unlocks) {
      if (unlock.kind === kind) multiplier *= unlock.multiplier;
    }
  }

  return multiplier;
}

/**
 * 그 레벨의 일터 한 채가 받는 자리 수를 구한다.
 *
 * 후반에는 마을이 커져 주민이 남아돈다. 일터 종류를 더 늘리는 대신 한 채가 받는 사람을
 * 늘리는 편이, 이미 지은 건물의 쓸모를 키우면서 새 콘텐츠를 만들지 않는 방법이다.
 *
 * @param level 마을 레벨.
 * @returns 일터 한 채의 자리 수.
 */
export function jobSlotsAtLevel(level: number): number {
  let slots = 1;

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    if (Number(unlockLevel) > level) continue;
    for (const unlock of unlocks) {
      if (unlock.kind === 'jobSlot') slots += unlock.slots;
    }
  }

  return slots;
}

/**
 * 그 레벨의 망루 사거리 보너스를 구한다.
 *
 * @param level 마을 레벨.
 * @returns 늘어난 사거리(타일).
 */
export function towerRangeBonus(level: number): number {
  let bonus = 0;

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    if (Number(unlockLevel) > level) continue;
    for (const unlock of unlocks) {
      if (unlock.kind === 'defense') bonus += 2;
    }
  }

  return bonus;
}

/**
 * 그 레벨까지 늘어난 슬롯 수를 더해 구한다.
 *
 * @param kind 슬롯 종류.
 * @param level 마을 레벨.
 * @returns 늘어난 슬롯 수.
 */
export function bonusSlots(kind: 'inventory' | 'storage', level: number): number {
  let slots = 0;

  for (const [unlockLevel, unlocks] of Object.entries(LEVEL_UNLOCKS)) {
    if (Number(unlockLevel) > level) continue;
    for (const unlock of unlocks) {
      if (unlock.kind === kind) slots += unlock.slots;
    }
  }

  return slots;
}
