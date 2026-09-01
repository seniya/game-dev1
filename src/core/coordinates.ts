/**
 * 아이소메트릭 좌표계 규약과 변환 함수.
 *
 * 규약의 근거와 대안 검토는 `docs/adr/0002-좌표계-규약.md`에 있다. 요약하면:
 *
 * - 그리드 좌표 `(x, y, z)`: x는 화면 오른쪽-아래, y는 왼쪽-아래, z는 위쪽(레이어)
 * - 월드 좌표: 카메라 변환 이전의 픽셀 좌표. 그리드 `(0, 0, 0)`의 윗면 중심이 원점
 * - 타일 크기 64×32(2:1 마름모), 레이어 1칸 높이 16px
 *
 * 이 모듈은 카메라·캔버스·DOM에 의존하지 않는 순수 함수만 담는다.
 * 화면 픽셀 좌표로의 변환은 `src/render/Camera.ts`가 담당한다.
 */

/** 타일 윗면 마름모의 가로 폭(px). */
export const TILE_WIDTH = 64;

/** 타일 윗면 마름모의 세로 높이(px). TILE_WIDTH의 절반 — 2:1 비율. */
export const TILE_HEIGHT = 32;

/** 블록 한 레이어의 높이(px). z가 1 늘면 화면에서 이만큼 위로 올라간다. */
export const LAYER_HEIGHT = 16;

/** 지형 최대 레이어 수. 기획서 5.1의 "지표면 기준 5레이어" 제한. */
export const MAX_LAYERS = 5;

/** 그리드 좌표. 타일 단위이며 정수가 아닌 값(타일 내부 위치)도 허용한다. */
export interface GridPos {
  /** 화면 오른쪽-아래 방향 축. */
  x: number;
  /** 화면 왼쪽-아래 방향 축. */
  y: number;
  /** 위쪽 방향 레이어. 0이 최하층. */
  z: number;
}

/** 월드 좌표(px). 카메라 변환 이전의 좌표계. */
export interface WorldPos {
  x: number;
  y: number;
}

/**
 * 그리드 좌표를 월드 좌표로 변환한다. 결과는 해당 블록 **윗면의 중심**이다.
 *
 * @param x 그리드 x.
 * @param y 그리드 y.
 * @param z 레이어. 클수록 화면에서 위로 올라간다.
 * @returns 윗면 중심의 월드 좌표(px).
 */
export function gridToWorld(x: number, y: number, z = 0): WorldPos {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2) - z * LAYER_HEIGHT,
  };
}

/**
 * 월드 좌표를 그리드 좌표로 되돌린다.
 *
 * 한 화면 지점은 z에 따라 여러 그리드 위치에 대응하므로(높은 블록의 윗면과
 * 낮은 블록의 윗면이 같은 픽셀에 겹칠 수 있다) 어떤 레이어의 평면을 기준으로
 * 볼 것인지 z를 받아야 한다. 반환값은 소수를 포함하며, 타일 내부의 상대 위치를
 * 그대로 담는다(정수 타일이 필요하면 `worldToTile`을 쓴다).
 *
 * @param worldX 월드 x(px).
 * @param worldY 월드 y(px).
 * @param z 기준 레이어.
 * @returns 소수를 포함한 그리드 x, y.
 */
export function worldToGrid(worldX: number, worldY: number, z = 0): { x: number; y: number } {
  // z만큼 위로 밀려 그려진 것을 되돌려, z=0 평면 기준의 y로 환산한다.
  const flatY = worldY + z * LAYER_HEIGHT;

  const a = worldX / (TILE_WIDTH / 2);
  const b = flatY / (TILE_HEIGHT / 2);

  return {
    x: (a + b) / 2,
    y: (b - a) / 2,
  };
}

/**
 * 월드 좌표가 가리키는 정수 타일을 구한다. 마우스 피킹의 본체다.
 *
 * 마름모 안팎을 따로 판정할 필요는 없다. 타일 중심들이 격자를 이루므로,
 * `worldToGrid`의 소수 좌표를 가장 가까운 정수로 반올림하면 그 결과가 곧
 * 해당 지점을 품은 마름모다.
 *
 * @param worldX 월드 x(px).
 * @param worldY 월드 y(px).
 * @param z 기준 레이어.
 * @returns 정수 타일 좌표.
 */
export function worldToTile(worldX: number, worldY: number, z = 0): { x: number; y: number } {
  const grid = worldToGrid(worldX, worldY, z);

  return {
    x: Math.round(grid.x),
    y: Math.round(grid.y),
  };
}

/**
 * 그리기 순서 비교자. 오름차순 정렬하면 뒤쪽 블록부터 앞쪽 블록 순서가 된다.
 *
 * 정렬 키는 `(x + y)`가 1순위, `z`가 2순위다. 같은 `x + y` 대각선에 놓인
 * 블록들은 화면 x가 타일 폭만큼 떨어져 서로 겹치지 않으므로, z는 순서를
 * 결정적으로 만들기 위한 보조 키에 가깝다. 근거는 ADR 0002 참고.
 *
 * @param a 앞 블록.
 * @param b 뒤 블록.
 * @returns a가 먼저 그려져야 하면 음수, 나중이면 양수, 같으면 0.
 */
export function compareDepth(a: GridPos, b: GridPos): number {
  const diagonal = a.x + a.y - (b.x + b.y);
  if (diagonal !== 0) return diagonal;

  return a.z - b.z;
}

/**
 * 블록 목록을 그리기 순서대로 정렬한 새 배열을 돌려준다.
 * 원본 배열은 건드리지 않는다 — 렌더러가 매 프레임 재사용하는 배열을
 * 실수로 뒤섞지 않게 하기 위함이다.
 *
 * @param blocks 정렬할 블록 목록.
 * @returns 뒤에서 앞 순서로 정렬된 새 배열.
 */
export function sortByDepth<T extends GridPos>(blocks: readonly T[]): T[] {
  return [...blocks].sort(compareDepth);
}
