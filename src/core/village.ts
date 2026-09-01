import { BLUEPRINTS } from './blueprints';
import { ToolKind, ToolTier } from './tools';
import { Zone, ZONE_ORDER } from './zones';

/** MVP 최대 마을 레벨. 기획서 8절의 "마을 레벨 1~5". */
export const MAX_VILLAGE_LEVEL = 5;

/**
 * 마을 레벨 산정에 들어가는 값들.
 *
 * 기획서 6절은 "건물 수, 주민 수, 요청 완료 수를 합산한 누적치"를 쓴다.
 * 요청은 개수가 아니라 **완료 보상 합계**를 쓴다 — 시설 요청이 납품 요청보다
 * 큰일이므로 같은 1건으로 세면 서열이 사라진다.
 */
export interface VillageStats {
  /** 완공된 건물 수. */
  buildings: number;
  /** 주민 수. */
  residents: number;
  /** 요청 완료로 누적된 경험치. */
  requestExperience: number;
}

/** 항목별 가중치. 주민이 가장 무겁다 — 마을이 사는 곳이 되는 것이 목표이기 때문이다. */
const WEIGHT = {
  building: 2,
  resident: 3,
} as const;

/**
 * 레벨별 필요 점수. 배열 인덱스가 `레벨 - 1`이다.
 *
 * 앞은 촘촘하고 뒤로 갈수록 벌어진다 — 첫 레벨업이 빨라야 진행 구조가 있다는 것이
 * 전달되고, 뒤로 갈수록 한 번의 레벨업이 커야 목표로 느껴진다.
 * 수치는 Phase 9 밸런싱 대상이다.
 */
export const LEVEL_THRESHOLDS: readonly number[] = [0, 8, 20, 38, 62];

/** 해금 한 항목. */
export type Unlock =
  | { kind: 'zone'; zone: Zone }
  | { kind: 'tool'; tool: ToolKind; tier: ToolTier }
  | { kind: 'blueprint'; label: string };

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
  3: [{ kind: 'tool', tool: ToolKind.PICKAXE, tier: ToolTier.MID }],
  4: [
    { kind: 'tool', tool: ToolKind.AXE, tier: ToolTier.HIGH },
    { kind: 'tool', tool: ToolKind.SHOVEL, tier: ToolTier.HIGH },
  ],
  5: [{ kind: 'tool', tool: ToolKind.PICKAXE, tier: ToolTier.HIGH }],
};

/**
 * 마을 점수를 계산한다.
 *
 * @param stats 산정 항목.
 * @returns 점수.
 */
export function villageScore(stats: VillageStats): number {
  const buildings = Math.max(0, Math.floor(stats.buildings));
  const residents = Math.max(0, Math.floor(stats.residents));
  const experience = Math.max(0, Math.floor(stats.requestExperience));

  return buildings * WEIGHT.building + residents * WEIGHT.resident + experience;
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

  return `${unlock.label} 설계도`;
}
