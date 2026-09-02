/**
 * 어둠 규칙.
 *
 * 동굴은 어두워야 동굴이다. 다만 이 게임의 어둠은 **탐색의 긴장**이 아니라 **장소의
 * 성격**이다 — 기획서에 시야 싸움이나 조명 자원 관리가 없고, 캐주얼 타운 빌더라는
 * 성격에도 맞지 않는다. 그래서 완전한 암전이 아니라 가장자리가 어두워지는 정도로 둔다.
 * 멀리 있는 광맥의 위치는 어렴풋이 보이되, 무엇인지는 다가가야 알 수 있는 세기다.
 */

/** 이 반경 안(타일)은 밝다. */
export const LIT_RADIUS = 5;

/** 이 반경 밖(타일)은 가장 어둡다. 사이는 부드럽게 이어진다. */
export const DARK_RADIUS = 11;

/**
 * 가장 어두운 곳의 덮개 불투명도.
 *
 * 1이면 완전한 암전이라 길을 잃는다. 0.8 언저리면 지형의 윤곽은 남는다.
 */
export const MAX_DARKNESS = 0.8;

/** 어둠의 색. 완전한 검정보다 푸른 기가 도는 편이 돌처럼 보인다. */
export const DARK_COLOR = { r: 6, g: 8, b: 14 } as const;

/**
 * 거리에 따른 어둠의 세기를 구한다.
 *
 * @param distance 빛의 중심에서의 거리(타일).
 * @param lit 밝은 반경.
 * @param dark 가장 어두워지는 반경.
 * @param max 최대 세기.
 * @returns 0(밝음)~max(어두움) 사이의 값.
 */
export function darknessAt(
  distance: number,
  lit: number = LIT_RADIUS,
  dark: number = DARK_RADIUS,
  max: number = MAX_DARKNESS,
): number {
  if (!Number.isFinite(distance) || distance <= lit) return 0;
  if (distance >= dark) return max;

  const span = dark - lit;
  if (span <= 0) return max;

  // 선형 대신 제곱으로 떨어뜨린다. 밝은 곳 바로 바깥이 급격히 어두워지면
  // 빛의 경계가 원반처럼 도드라져 보인다.
  const t = (distance - lit) / span;

  return max * t * t;
}

/**
 * 어둠 덮개의 색 문자열을 만든다.
 *
 * @param alpha 불투명도(0~1).
 * @returns CSS 색 문자열.
 */
export function darkColor(alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));

  return `rgba(${DARK_COLOR.r}, ${DARK_COLOR.g}, ${DARK_COLOR.b}, ${clamped.toFixed(3)})`;
}
