import { MAX_LAYERS } from './coordinates';
import { BlockType, isPlaceable } from './blocks';
import { decodeBytes, encodeBytes, type TerrainSave } from './save';

/**
 * 높이맵 기반 복셀 지형.
 *
 * 설계 근거는 `docs/adr/0003-지형-자료구조.md`에 있다. 요약하면, 각 열(column)이
 * 갖는 값은 **쌓인 블록 개수 하나**이고 그 아래는 빈틈 없이 꽉 찬 것으로 본다.
 * 따라서 오버행(위에 블록이 있고 아래가 빈 형태)과 공중 블록은 표현되지 않으며,
 * 동굴은 지형이 아니라 별도 맵으로 다룬다.
 *
 * 이 제약 덕분에 파기는 항상 열의 맨 위 블록을 지우는 일, 쌓기는 맨 위에 얹는
 * 일로 확정되어 판정이 단순해지고, 평탄도 검사가 높이 비교 한 번으로 끝난다.
 *
 * 자료는 두 개의 `Uint8Array`에 담는다.
 * - `heights[y * width + x]` — 그 열에 쌓인 블록 수(0 ~ MAX_LAYERS)
 * - `types[(y * width + x) * MAX_LAYERS + z]` — 칸별 블록 타입.
 *   `z >= heights[...]`인 칸의 값은 의미가 없으며 항상 EMPTY로 읽힌다.
 */
export class Terrain {
  /** x축 타일 수. */
  readonly width: number;
  /** y축 타일 수. */
  readonly height: number;

  /** 열별 블록 수. */
  private readonly heights: Uint8Array;
  /** 칸별 블록 타입. */
  private readonly types: Uint8Array;

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
    this.heights = new Uint8Array(width * height);
    this.types = new Uint8Array(width * height * MAX_LAYERS);
  }

  /** 한 열에 쌓을 수 있는 최대 블록 수. 기획서 5.1의 깊이 제한. */
  static get maxColumnHeight(): number {
    return MAX_LAYERS;
  }

  /**
   * 저장용 표현으로 바꾼다.
   *
   * 두 배열이 저장의 대부분을 차지하므로 base64로 담는다.
   *
   * @returns 저장 데이터.
   */
  toSave(): TerrainSave {
    return {
      width: this.width,
      height: this.height,
      heights: encodeBytes(this.heights),
      types: encodeBytes(this.types),
    };
  }

  /**
   * 저장에서 지형을 되살린다.
   *
   * 배열 길이가 크기와 맞지 않으면 손상으로 보고 null을 돌려준다 — 잘못된 지형으로
   * 게임을 시작하면 그 뒤의 모든 판정이 조용히 어긋난다.
   *
   * @param data 저장 데이터.
   * @returns 되살린 지형. 읽을 수 없으면 null.
   */
  static fromSave(data: TerrainSave): Terrain | null {
    if (!Number.isInteger(data.width) || !Number.isInteger(data.height)) return null;
    if (data.width < 1 || data.height < 1) return null;

    const columns = data.width * data.height;
    const heights = decodeBytes(data.heights, columns);
    const types = decodeBytes(data.types, columns * MAX_LAYERS);
    if (!heights || !types) return null;

    // 열 높이가 상한을 넘으면 이후 렌더링과 판정이 배열 밖을 읽는다.
    for (const height of heights) {
      if (height > MAX_LAYERS) return null;
    }

    const terrain = new Terrain(data.width, data.height);
    terrain.heights.set(heights);
    terrain.types.set(types);

    return terrain;
  }

  /** 전체 열 개수. */
  get columnCount(): number {
    return this.width * this.height;
  }

  /** 맵 중심의 그리드 좌표. 카메라 초기 위치를 잡는 데 쓴다. */
  get centerTile(): { x: number; y: number } {
    return {
      x: (this.width - 1) / 2,
      y: (this.height - 1) / 2,
    };
  }

  /**
   * 좌표가 맵 안의 정수 좌표인지 확인한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 맵 안이면 true.
   */
  contains(x: number, y: number): boolean {
    return (
      Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height
    );
  }

  /**
   * 열에 쌓인 블록 수를 돌려준다.
   *
   * 맵 밖은 0으로 본다 — 렌더러가 이웃 높이를 물을 때 경계에서 분기하지 않고
   * 측면 벽을 온전히 그리게 하려는 의도다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 블록 수(0 ~ MAX_LAYERS).
   */
  columnHeight(x: number, y: number): number {
    if (!this.contains(x, y)) return 0;
    return this.heights[y * this.width + x]!;
  }

  /**
   * 특정 칸의 블록 타입을 돌려준다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param z 레이어. 0이 최하층.
   * @returns 블록 타입. 빈 칸이나 맵 밖은 EMPTY.
   */
  blockAt(x: number, y: number, z: number): BlockType {
    if (!this.contains(x, y)) return BlockType.EMPTY;
    if (!Number.isInteger(z) || z < 0) return BlockType.EMPTY;
    if (z >= this.heights[y * this.width + x]!) return BlockType.EMPTY;

    return this.types[(y * this.width + x) * MAX_LAYERS + z] as BlockType;
  }

  /**
   * 열의 맨 위 블록 타입을 돌려준다. 지표면에 무엇이 보이는지에 해당한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 표면 블록 타입. 빈 열이면 EMPTY.
   */
  surfaceBlock(x: number, y: number): BlockType {
    const height = this.columnHeight(x, y);
    if (height === 0) return BlockType.EMPTY;

    return this.blockAt(x, y, height - 1);
  }

  /**
   * 열을 특정 높이까지 한 가지 타입으로 채운다. 지형 생성에서만 쓴다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param height 채울 블록 수(0 ~ MAX_LAYERS).
   * @param type 채울 블록 타입. EMPTY는 허용하지 않는다.
   * @throws 맵 밖 좌표, 범위를 벗어난 높이, EMPTY 타입이면 예외를 던진다.
   */
  fillColumn(x: number, y: number, height: number, type: BlockType): void {
    if (!this.contains(x, y)) {
      throw new RangeError(`맵 밖 좌표다: (${x}, ${y})`);
    }
    if (!Number.isInteger(height) || height < 0 || height > MAX_LAYERS) {
      throw new RangeError(`높이는 0 이상 ${MAX_LAYERS} 이하의 정수여야 한다: ${height}`);
    }
    if (type === BlockType.EMPTY) {
      throw new RangeError('EMPTY로는 열을 채울 수 없다.');
    }

    const column = y * this.width + x;
    this.heights[column] = height;
    for (let z = 0; z < height; z += 1) {
      this.types[column * MAX_LAYERS + z] = type;
    }
  }

  /**
   * 특정 칸의 블록 타입만 바꾼다. 광맥을 심는 등 지형 생성에서만 쓴다.
   * 열 높이는 건드리지 않으므로 이미 블록이 있는 칸만 대상이 된다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param z 레이어.
   * @param type 새 블록 타입. EMPTY는 허용하지 않는다.
   * @returns 실제로 바꿨으면 true. 빈 칸이거나 맵 밖이면 false.
   */
  setBlock(x: number, y: number, z: number, type: BlockType): boolean {
    if (type === BlockType.EMPTY) {
      throw new RangeError('setBlock으로 블록을 지울 수 없다. dig를 쓴다.');
    }
    if (!this.contains(x, y)) return false;
    if (!Number.isInteger(z) || z < 0 || z >= this.columnHeight(x, y)) return false;

    this.types[(y * this.width + x) * MAX_LAYERS + z] = type;
    return true;
  }

  /**
   * 열의 맨 위 블록을 파낸다.
   *
   * 높이맵 구조상 파기 대상은 항상 맨 위 블록이다. 파낸 자리는 아래 레이어가
   * 노출되거나, 마지막 블록이었다면 빈 열이 된다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 파낸 블록 타입. 팔 것이 없으면 null.
   */
  dig(x: number, y: number): BlockType | null {
    const height = this.columnHeight(x, y);
    if (height === 0) return null;

    const removed = this.blockAt(x, y, height - 1);
    this.heights[y * this.width + x] = height - 1;

    return removed;
  }

  /**
   * 열의 맨 위에 블록을 얹는다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param type 놓을 블록 타입. 놓을 수 없는 타입은 거부한다.
   * @returns 놓았으면 true. 맵 밖, 높이 상한 초과, 놓을 수 없는 타입이면 false.
   */
  place(x: number, y: number, type: BlockType): boolean {
    if (!this.contains(x, y)) return false;
    if (!isPlaceable(type)) return false;

    const column = y * this.width + x;
    const height = this.heights[column]!;
    if (height >= MAX_LAYERS) return false;

    this.types[column * MAX_LAYERS + height] = type;
    this.heights[column] = height + 1;

    return true;
  }

  /**
   * 지정한 사각 영역이 건축 가능한 평탄지인지 검사한다.
   * Phase 6의 블루프린트 배치 전제 조건이다(기획서 5.3).
   *
   * 조건은 셋이다. 영역이 모두 맵 안이고, 모든 열의 높이가 같으며,
   * 그 높이가 1 이상이어야 한다 — 높이 0은 지면 자체가 없는 자리이므로
   * 평평하더라도 건물을 세울 수 없다.
   *
   * @param x 영역 좌상단(그리드 최소 x).
   * @param y 영역 좌상단(그리드 최소 y).
   * @param areaWidth 영역 가로 칸수. 1 이상.
   * @param areaHeight 영역 세로 칸수. 1 이상.
   * @returns 평탄하면 true.
   */
  isFlatArea(x: number, y: number, areaWidth: number, areaHeight: number): boolean {
    if (!Number.isInteger(areaWidth) || !Number.isInteger(areaHeight)) return false;
    if (areaWidth < 1 || areaHeight < 1) return false;
    if (!this.contains(x, y)) return false;
    if (!this.contains(x + areaWidth - 1, y + areaHeight - 1)) return false;

    const target = this.columnHeight(x, y);
    if (target === 0) return false;

    for (let dy = 0; dy < areaHeight; dy += 1) {
      for (let dx = 0; dx < areaWidth; dx += 1) {
        if (this.columnHeight(x + dx, y + dy) !== target) return false;
      }
    }

    return true;
  }
}
