import { MAX_LAYERS, worldToTile } from './coordinates';

/** 피킹이 필요한 지형 정보만 추린 인터페이스. */
export interface HeightField {
  /**
   * 좌표가 맵 안인지 확인한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   */
  contains(x: number, y: number): boolean;
  /**
   * 열에 쌓인 블록 수를 돌려준다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   */
  columnHeight(x: number, y: number): number;
}

/** 피킹 결과. 표면 블록 한 칸을 가리킨다. */
export interface SurfaceHit {
  /** 그리드 x. */
  x: number;
  /** 그리드 y. */
  y: number;
  /** 표면 블록의 레이어 인덱스(= 열 높이 - 1). */
  z: number;
}

/**
 * 월드 좌표가 가리키는 지형 표면을 찾는다.
 *
 * 높이가 있는 지형에서는 한 화면 지점이 여러 열에 대응한다 — 언덕 윗면과
 * 그 뒤 낮은 땅의 윗면이 같은 픽셀에 겹칠 수 있다. 그래서 z 평면을 위에서
 * 아래로 훑으며, 그 평면에 해당하는 열이 그만큼 높은지 검사한다. 위에서부터
 * 훑으므로 먼저 걸리는 것이 화면상 가장 앞(위)에 있는 표면이다.
 *
 * 이 방식은 윗면뿐 아니라 측면 벽을 클릭한 경우에도 그 벽의 주인 열을 찾아낸다.
 * z가 1 줄면 후보 열이 대각선으로 반 칸씩 뒤로 물러나므로, 벽면 픽셀은 아래
 * 평면에서 벽의 주인 열에 도달한다.
 *
 * @param field 지형(경계와 열 높이만 사용).
 * @param worldX 월드 x(px).
 * @param worldY 월드 y(px).
 * @returns 표면 블록 위치. 빈 하늘이나 맵 밖, 바닥까지 파인 자리면 null.
 */
export function pickSurfaceTile(field: HeightField, worldX: number, worldY: number): SurfaceHit | null {
  for (let z = MAX_LAYERS - 1; z >= 0; z -= 1) {
    const tile = worldToTile(worldX, worldY, z);
    if (!field.contains(tile.x, tile.y)) continue;

    const height = field.columnHeight(tile.x, tile.y);
    if (height >= z + 1) {
      return { x: tile.x, y: tile.y, z: height - 1 };
    }
  }

  return null;
}
