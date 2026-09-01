import type { Terrain } from './Terrain';

/**
 * 채집 구역.
 *
 * 기획서 5.2는 "초원 → 숲 → 산악 → 동굴 순으로 상위 자원 등장"을 요구하고,
 * 동굴은 별도 맵으로 다루기로 했으므로(ADR 0003) 단일 맵에는 세 구역이 있다.
 * 구역은 마을 중심에서의 거리로 나눈다 — 멀리 갈수록 상위 자원이라는 규칙이
 * 별도 설명 없이 이해되고, 마을 레벨로 개방 범위를 넓히기도 쉽다(Phase 8).
 */
export const Zone = {
  /** 초원. 마을 주변. 나무가 드물게 있다. */
  MEADOW: 'meadow',
  /** 숲. 나무가 빽빽하고 돌도 나온다. */
  FOREST: 'forest',
  /** 산악. 돌과 철광석 광맥이 나온다. */
  MOUNTAIN: 'mountain',
} as const;

/** 구역 값. */
export type Zone = (typeof Zone)[keyof typeof Zone];

/** 구역별 표시 이름. */
const ZONE_LABEL: Readonly<Record<Zone, string>> = {
  [Zone.MEADOW]: '초원',
  [Zone.FOREST]: '숲',
  [Zone.MOUNTAIN]: '산악',
};

/** 바깥으로 갈수록 상위 구역이 되는 순서. Phase 8의 해금 순서와 같다. */
export const ZONE_ORDER: readonly Zone[] = [Zone.MEADOW, Zone.FOREST, Zone.MOUNTAIN];

/**
 * 구역 이름을 돌려준다.
 *
 * @param zone 구역.
 * @returns 표시 이름.
 */
export function zoneLabel(zone: Zone): string {
  return ZONE_LABEL[zone];
}

/**
 * 초원이 끝나는 거리(체비쇼프 거리, 타일).
 * 맵 크기와 무관하게 마을 주변이 일정하도록 절대값으로 둔다.
 */
export const MEADOW_RADIUS = 7;

/** 숲이 끝나는 거리. 이보다 멀면 산악이다. */
export const FOREST_RADIUS = 12;

/**
 * 맵 중심에서의 체비쇼프 거리를 구한다.
 *
 * 유클리드 거리가 아니라 체비쇼프 거리를 쓰면 구역 경계가 사각 띠가 되어
 * 아이소메트릭 화면에서 마름모 띠로 보인다 — 타일 격자와 결이 맞는다.
 *
 * @param terrain 지형(중심을 얻는다).
 * @param x 그리드 x.
 * @param y 그리드 y.
 * @returns 중심에서의 거리(타일).
 */
export function distanceFromCenter(terrain: Terrain, x: number, y: number): number {
  const centerX = (terrain.width - 1) / 2;
  const centerY = (terrain.height - 1) / 2;

  return Math.max(Math.abs(x - centerX), Math.abs(y - centerY));
}

/**
 * 그 칸이 어느 구역인지 알려준다.
 *
 * @param terrain 지형.
 * @param x 그리드 x.
 * @param y 그리드 y.
 * @returns 구역.
 */
export function zoneAt(terrain: Terrain, x: number, y: number): Zone {
  const distance = distanceFromCenter(terrain, x, y);

  if (distance <= MEADOW_RADIUS) return Zone.MEADOW;
  if (distance <= FOREST_RADIUS) return Zone.FOREST;

  return Zone.MOUNTAIN;
}
