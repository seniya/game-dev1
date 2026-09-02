/**
 * 건물 외형.
 *
 * 기획서 5.3의 후순위 항목이다 — "완공 후 색상/지붕 스타일 등 외형 슬롯을 **소수 옵션 중
 * 선택**해 교체하는 정도로 제한(자유 조형은 지원하지 않는다)". ADR 0011이 로드맵 03의
 * 후보로 남겨 둔 것이기도 하다.
 *
 * 외형은 규칙에 아무 영향을 주지 않는다. 마을 점수도, 기능도, 방어도 그대로다.
 * **오직 보기 위한 것**이며, 그래서 해금 보상으로 알맞다.
 */

/** 외형 하나. */
export interface BuildingLook {
  /** 저장에 담기는 번호. 0이 기본이다. */
  readonly id: number;
  /** 표시 이름. */
  readonly label: string;
  /** 지붕 색. null이면 건물 종류가 정한 원래 색을 쓴다. */
  readonly roof: string | null;
  /** 지붕 그늘 색. */
  readonly roofDark: string | null;
  /** 이 외형이 열리는 마을 레벨. */
  readonly unlockLevel: number;
}

/**
 * 고를 수 있는 외형들.
 *
 * 지붕 색만 바꾼다. 벽 색까지 바꾸면 건물 종류를 구분하는 단서(집은 밝은 흙벽, 대장간은
 * 어두운 돌벽)가 흐려진다 — 외형은 알아보는 것을 방해하지 않아야 한다.
 */
export const BUILDING_LOOKS: readonly BuildingLook[] = [
  { id: 0, label: '기본', roof: null, roofDark: null, unlockLevel: 1 },
  { id: 1, label: '푸른 지붕', roof: '#4a7fa5', roofDark: '#3b6684', unlockLevel: 3 },
  { id: 2, label: '초록 지붕', roof: '#5f8a52', roofDark: '#4c6f42', unlockLevel: 6 },
  { id: 3, label: '황금 지붕', roof: '#c9a227', roofDark: '#a3831f', unlockLevel: 9 },
  { id: 4, label: '붉은 지붕', roof: '#b5453a', roofDark: '#8f362d', unlockLevel: 12 },
  { id: 5, label: '검은 지붕', roof: '#3f434a', roofDark: '#2f3238', unlockLevel: 18 },
];

/**
 * 외형을 번호로 찾는다.
 *
 * @param id 외형 번호.
 * @returns 외형. 없는 번호면 기본 외형.
 */
export function lookById(id: number): BuildingLook {
  return BUILDING_LOOKS.find((look) => look.id === id) ?? BUILDING_LOOKS[0]!;
}

/**
 * 그 레벨에서 고를 수 있는 외형들.
 *
 * @param level 마을 레벨.
 * @returns 열린 외형 목록. 언제나 기본을 포함한다.
 */
export function unlockedLooks(level: number): BuildingLook[] {
  return BUILDING_LOOKS.filter((look) => look.unlockLevel <= level);
}

/**
 * 다음 외형 번호를 구한다. 열린 것들을 순환한다.
 *
 * @param current 지금 외형 번호.
 * @param level 마을 레벨.
 * @returns 다음 외형 번호. 열린 것이 하나뿐이면 그대로다.
 */
export function nextLook(current: number, level: number): number {
  const open = unlockedLooks(level);
  if (open.length <= 1) return open[0]?.id ?? 0;

  const index = open.findIndex((look) => look.id === current);

  return open[(index + 1) % open.length]!.id;
}

/**
 * 그 레벨에서 쓸 수 있는 외형인지 확인한다.
 *
 * @param id 외형 번호.
 * @param level 마을 레벨.
 * @returns 쓸 수 있으면 true.
 */
export function isLookUnlocked(id: number, level: number): boolean {
  return unlockedLooks(level).some((look) => look.id === id);
}
