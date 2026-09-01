/**
 * 타일 그리드의 크기와 경계.
 *
 * Phase 1에서는 평평한 단일 레이어 그리드의 범위만 다룬다. Phase 2에서 이 위에
 * 블록 타입과 레이어를 얹어 복셀 지형으로 확장한다.
 */
export class TileGrid {
  /** x축 타일 수. */
  readonly width: number;
  /** y축 타일 수. */
  readonly height: number;

  /**
   * @param width x축 타일 수. 1 이상의 정수.
   * @param height y축 타일 수. 1 이상의 정수.
   */
  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || width < 1) {
      throw new RangeError(`width는 1 이상의 정수여야 한다: ${width}`);
    }
    if (!Number.isInteger(height) || height < 1) {
      throw new RangeError(`height는 1 이상의 정수여야 한다: ${height}`);
    }

    this.width = width;
    this.height = height;
  }

  /** 전체 타일 수. */
  get tileCount(): number {
    return this.width * this.height;
  }

  /**
   * 좌표가 그리드 안에 있는지 확인한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 범위 안의 정수 좌표면 true.
   */
  contains(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** 그리드 중심의 그리드 좌표. 카메라 초기 위치를 잡는 데 쓴다. */
  get centerTile(): { x: number; y: number } {
    return {
      x: (this.width - 1) / 2,
      y: (this.height - 1) / 2,
    };
  }
}
