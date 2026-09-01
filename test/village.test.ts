import { describe, expect, it } from 'vitest';
import { ToolKind, ToolTier } from '../src/core/tools';
import {
  LEVEL_THRESHOLDS,
  MAX_VILLAGE_LEVEL,
  describeUnlock,
  isZoneUnlocked,
  levelForScore,
  levelProgress,
  nextThreshold,
  toolTierAtLevel,
  unlockedZones,
  unlocksAtLevel,
  villageScore,
} from '../src/core/village';
import { Zone } from '../src/core/zones';

describe('villageScore', () => {
  it('아무것도 없으면 0이다', () => {
    expect(villageScore({ buildings: 0, residents: 0, requestExperience: 0 })).toBe(0);
  });

  it('건물·주민·요청 보상을 합산한다 — 기획서 6절', () => {
    const score = villageScore({ buildings: 2, residents: 3, requestExperience: 5 });

    expect(score).toBe(2 * 2 + 3 * 3 + 5);
  });

  it('주민이 건물보다 무겁다 — 마을이 사는 곳이 되는 것이 목표다', () => {
    const byBuilding = villageScore({ buildings: 1, residents: 0, requestExperience: 0 });
    const byResident = villageScore({ buildings: 0, residents: 1, requestExperience: 0 });

    expect(byResident).toBeGreaterThan(byBuilding);
  });

  it('음수와 소수는 안전하게 처리한다', () => {
    expect(villageScore({ buildings: -5, residents: 1.7, requestExperience: -2 })).toBe(3);
  });
});

describe('levelForScore', () => {
  it('점수가 0이면 레벨 1이다', () => {
    expect(levelForScore(0)).toBe(1);
    expect(levelForScore(-10)).toBe(1);
  });

  it('임계값에 도달하면 레벨이 오른다', () => {
    for (let level = 2; level <= MAX_VILLAGE_LEVEL; level += 1) {
      const threshold = LEVEL_THRESHOLDS[level - 1]!;
      expect(levelForScore(threshold - 1)).toBe(level - 1);
      expect(levelForScore(threshold)).toBe(level);
    }
  });

  it('최대 레벨을 넘지 않는다', () => {
    expect(levelForScore(100_000)).toBe(MAX_VILLAGE_LEVEL);
  });

  it('임계값이 단조 증가한다 — 뒤로 갈수록 벌어진다', () => {
    for (let i = 1; i < LEVEL_THRESHOLDS.length; i += 1) {
      expect(LEVEL_THRESHOLDS[i]!).toBeGreaterThan(LEVEL_THRESHOLDS[i - 1]!);
    }

    const firstGap = LEVEL_THRESHOLDS[1]! - LEVEL_THRESHOLDS[0]!;
    const lastGap =
      LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]! - LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 2]!;
    expect(lastGap).toBeGreaterThan(firstGap);
  });
});

describe('nextThreshold / levelProgress', () => {
  it('다음 레벨 임계값을 알려준다', () => {
    expect(nextThreshold(1)).toBe(LEVEL_THRESHOLDS[1]);
  });

  it('최대 레벨에서는 다음이 없다', () => {
    expect(nextThreshold(MAX_VILLAGE_LEVEL)).toBeNull();
    expect(levelProgress(100_000)).toBe(1);
  });

  it('구간 안에서 진행도가 올라간다', () => {
    const start = levelProgress(LEVEL_THRESHOLDS[0]!);
    const middle = levelProgress(Math.floor(LEVEL_THRESHOLDS[1]! / 2));
    const end = levelProgress(LEVEL_THRESHOLDS[1]! - 1);

    expect(start).toBe(0);
    expect(middle).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(middle);
    expect(end).toBeLessThan(1);
  });

  it('레벨이 오르면 진행도가 다시 0에서 시작한다', () => {
    expect(levelProgress(LEVEL_THRESHOLDS[1]!)).toBe(0);
  });

  it('레벨을 직접 넘기면 그 레벨 구간을 기준으로 계산한다', () => {
    // 점수는 레벨 1 구간이지만 레벨이 최대이면 진행도는 1이다.
    expect(levelProgress(2, MAX_VILLAGE_LEVEL)).toBe(1);
    // 반대로 점수가 높아도 레벨이 낮으면 그 구간 기준이라 1로 잘린다.
    expect(levelProgress(100, 1)).toBe(1);
  });
});

describe('구역 해금', () => {
  it('초원과 숲은 처음부터 열려 있다 — 첫 집의 목재를 모을 수 있어야 한다', () => {
    expect(unlockedZones(1)).toEqual([Zone.MEADOW, Zone.FOREST]);
    expect(isZoneUnlocked(Zone.MOUNTAIN, 1)).toBe(false);
  });

  it('레벨 2에서 산악이 열린다', () => {
    expect(isZoneUnlocked(Zone.MOUNTAIN, 2)).toBe(true);
    expect(unlockedZones(2)).toHaveLength(3);
  });

  it('한 번 열린 구역은 계속 열려 있다', () => {
    for (let level = 2; level <= MAX_VILLAGE_LEVEL; level += 1) {
      expect(isZoneUnlocked(Zone.MOUNTAIN, level)).toBe(true);
    }
  });

  it('구역 순서는 초원 → 숲 → 산악을 유지한다', () => {
    expect(unlockedZones(MAX_VILLAGE_LEVEL)).toEqual([Zone.MEADOW, Zone.FOREST, Zone.MOUNTAIN]);
  });
});

describe('도구 해금', () => {
  it('시작 도구는 모두 초급이다', () => {
    for (const tool of [ToolKind.AXE, ToolKind.PICKAXE, ToolKind.SHOVEL]) {
      expect(toolTierAtLevel(tool, 1)).toBe(ToolTier.BASIC);
    }
  });

  it('중급 곡괭이는 레벨 3에서 열린다 — 철광석 채굴의 전제', () => {
    expect(toolTierAtLevel(ToolKind.PICKAXE, 2)).toBe(ToolTier.BASIC);
    expect(toolTierAtLevel(ToolKind.PICKAXE, 3)).toBe(ToolTier.MID);
  });

  it('큰 집(철광석 필요)과 중급 곡괭이가 같은 레벨에 열린다 — 진행이 막히지 않게', () => {
    // 큰 집은 레벨 3 해금이며 철광석을 요구한다.
    expect(toolTierAtLevel(ToolKind.PICKAXE, 3)).toBeGreaterThanOrEqual(ToolTier.MID);
  });

  it('등급은 내려가지 않는다', () => {
    let previous = 0;
    for (let level = 1; level <= MAX_VILLAGE_LEVEL; level += 1) {
      const tier = toolTierAtLevel(ToolKind.AXE, level);
      expect(tier).toBeGreaterThanOrEqual(previous);
      previous = tier;
    }
  });

  it('최대 레벨에서는 모든 도구가 고급이다', () => {
    for (const tool of [ToolKind.AXE, ToolKind.PICKAXE, ToolKind.SHOVEL]) {
      expect(toolTierAtLevel(tool, MAX_VILLAGE_LEVEL)).toBe(ToolTier.HIGH);
    }
  });
});

describe('unlocksAtLevel', () => {
  it('레벨 1에는 해금 알림이 없다 — 시작 상태이기 때문이다', () => {
    expect(unlocksAtLevel(1)).toEqual([]);
  });

  it('블루프린트 해금이 목록에 들어간다', () => {
    const level2 = unlocksAtLevel(2);
    const level3 = unlocksAtLevel(3);

    expect(level2.some((unlock) => unlock.kind === 'blueprint' && unlock.label === '창고')).toBe(true);
    expect(level3.some((unlock) => unlock.kind === 'blueprint' && unlock.label === '큰 집')).toBe(true);
  });

  it('모든 해금 항목에 읽을 수 있는 문구가 있다', () => {
    for (let level = 2; level <= MAX_VILLAGE_LEVEL; level += 1) {
      for (const unlock of unlocksAtLevel(level)) {
        expect(describeUnlock(unlock)).toBeTruthy();
      }
    }
  });

  it('문구가 종류를 구분한다', () => {
    expect(describeUnlock({ kind: 'zone', zone: Zone.MOUNTAIN })).toBe('산악 개방');
    expect(describeUnlock({ kind: 'tool', tool: ToolKind.PICKAXE, tier: ToolTier.MID })).toBe(
      '중급 곡괭이',
    );
    expect(describeUnlock({ kind: 'blueprint', label: '창고' })).toBe('창고 설계도');
  });
});
