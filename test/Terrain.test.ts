import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { MAX_LAYERS } from '../src/core/coordinates';
import { Terrain } from '../src/core/Terrain';

/**
 * 모든 열을 같은 높이·타입으로 채운 지형을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 * @param height 각 열의 블록 수.
 * @param type 채울 블록 타입.
 */
function flatTerrain(size = 4, height = 3, type: BlockType = BlockType.STONE): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, height, type);
  }
  return terrain;
}

describe('Terrain 기본', () => {
  it('크기와 열 개수를 보고한다', () => {
    const terrain = new Terrain(6, 4);

    expect(terrain.width).toBe(6);
    expect(terrain.height).toBe(4);
    expect(terrain.columnCount).toBe(24);
  });

  it('처음에는 모든 열이 비어 있다', () => {
    const terrain = new Terrain(3, 3);

    expect(terrain.columnHeight(1, 1)).toBe(0);
    expect(terrain.surfaceBlock(1, 1)).toBe(BlockType.EMPTY);
  });

  it('최대 열 높이는 좌표계의 레이어 수와 같다', () => {
    expect(Terrain.maxColumnHeight).toBe(MAX_LAYERS);
  });

  it('맵 밖은 높이 0으로 본다 — 경계에서 측면 벽이 온전히 그려지도록', () => {
    const terrain = flatTerrain(4, 3);

    expect(terrain.columnHeight(-1, 0)).toBe(0);
    expect(terrain.columnHeight(4, 0)).toBe(0);
    expect(terrain.contains(-1, 0)).toBe(false);
  });

  it('중심 타일은 짝수·홀수 크기 모두에서 기하 중심이다', () => {
    expect(new Terrain(4, 4).centerTile).toEqual({ x: 1.5, y: 1.5 });
    expect(new Terrain(5, 3).centerTile).toEqual({ x: 2, y: 1 });
  });

  it('크기가 1 미만이거나 정수가 아니면 예외를 던진다', () => {
    expect(() => new Terrain(0, 4)).toThrow(RangeError);
    expect(() => new Terrain(4, 4.5)).toThrow(RangeError);
  });
});

describe('Terrain 블록 조회', () => {
  it('채운 높이 아래는 해당 타입, 위는 EMPTY로 읽힌다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, 2, BlockType.STONE);

    expect(terrain.blockAt(0, 0, 0)).toBe(BlockType.STONE);
    expect(terrain.blockAt(0, 0, 1)).toBe(BlockType.STONE);
    expect(terrain.blockAt(0, 0, 2)).toBe(BlockType.EMPTY);
  });

  it('맵 밖과 음수 z는 EMPTY로 읽힌다', () => {
    const terrain = flatTerrain(2, 2);

    expect(terrain.blockAt(-1, 0, 0)).toBe(BlockType.EMPTY);
    expect(terrain.blockAt(0, 0, -1)).toBe(BlockType.EMPTY);
  });

  it('표면 블록은 열의 맨 위 블록이다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, 3, BlockType.STONE);
    terrain.setBlock(0, 0, 2, BlockType.DIRT);

    expect(terrain.surfaceBlock(0, 0)).toBe(BlockType.DIRT);
  });

  it('setBlock은 이미 블록이 있는 칸만 바꾼다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, 2, BlockType.STONE);

    expect(terrain.setBlock(0, 0, 1, BlockType.IRON_ORE)).toBe(true);
    expect(terrain.setBlock(0, 0, 2, BlockType.IRON_ORE)).toBe(false);
    expect(terrain.setBlock(-1, 0, 0, BlockType.IRON_ORE)).toBe(false);
    expect(terrain.columnHeight(0, 0)).toBe(2);
  });

  it('setBlock으로 블록을 지울 수는 없다', () => {
    const terrain = flatTerrain(2, 2);

    expect(() => terrain.setBlock(0, 0, 0, BlockType.EMPTY)).toThrow(RangeError);
  });

  it('fillColumn은 맵 밖·범위 초과·EMPTY를 거부한다', () => {
    const terrain = new Terrain(2, 2);

    expect(() => terrain.fillColumn(5, 0, 1, BlockType.DIRT)).toThrow(RangeError);
    expect(() => terrain.fillColumn(0, 0, MAX_LAYERS + 1, BlockType.DIRT)).toThrow(RangeError);
    expect(() => terrain.fillColumn(0, 0, 1, BlockType.EMPTY)).toThrow(RangeError);
  });
});

describe('Terrain 파기', () => {
  it('맨 위 블록을 파내고 높이를 1 줄인다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, 3, BlockType.STONE);
    terrain.setBlock(0, 0, 2, BlockType.DIRT);

    expect(terrain.dig(0, 0)).toBe(BlockType.DIRT);
    expect(terrain.columnHeight(0, 0)).toBe(2);
    expect(terrain.surfaceBlock(0, 0)).toBe(BlockType.STONE);
  });

  it('파낸 자리는 아래 레이어가 노출된다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, 3, BlockType.STONE);
    terrain.setBlock(0, 0, 0, BlockType.IRON_ORE);

    terrain.dig(0, 0);
    terrain.dig(0, 0);

    expect(terrain.columnHeight(0, 0)).toBe(1);
    expect(terrain.surfaceBlock(0, 0)).toBe(BlockType.IRON_ORE);
  });

  it('빈 열은 더 팔 수 없다 — 5레이어 아래로 못 내려간다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, 1, BlockType.DIRT);

    expect(terrain.dig(0, 0)).toBe(BlockType.DIRT);
    expect(terrain.dig(0, 0)).toBeNull();
    expect(terrain.columnHeight(0, 0)).toBe(0);
  });

  it('맵 밖은 팔 수 없다', () => {
    const terrain = flatTerrain(2, 2);

    expect(terrain.dig(-1, 0)).toBeNull();
    expect(terrain.dig(2, 2)).toBeNull();
  });

  it('파고 다시 놓으면 원래 높이로 돌아온다', () => {
    const terrain = flatTerrain(2, 3, BlockType.DIRT);

    const removed = terrain.dig(1, 1);
    expect(removed).not.toBeNull();
    expect(terrain.place(1, 1, removed!)).toBe(true);
    expect(terrain.columnHeight(1, 1)).toBe(3);
  });
});

describe('Terrain 쌓기', () => {
  it('맨 위에 블록을 얹고 높이를 1 늘린다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, 1, BlockType.STONE);

    expect(terrain.place(0, 0, BlockType.DIRT)).toBe(true);
    expect(terrain.columnHeight(0, 0)).toBe(2);
    expect(terrain.surfaceBlock(0, 0)).toBe(BlockType.DIRT);
  });

  it('빈 열에도 놓을 수 있다 — 파낸 구덩이를 되메우는 경우', () => {
    const terrain = new Terrain(2, 2);

    expect(terrain.place(0, 0, BlockType.DIRT)).toBe(true);
    expect(terrain.columnHeight(0, 0)).toBe(1);
  });

  it('최대 높이를 넘겨 쌓을 수 없다', () => {
    const terrain = new Terrain(2, 2);
    terrain.fillColumn(0, 0, MAX_LAYERS, BlockType.STONE);

    expect(terrain.place(0, 0, BlockType.DIRT)).toBe(false);
    expect(terrain.columnHeight(0, 0)).toBe(MAX_LAYERS);
  });

  it('놓을 수 없는 블록은 거부한다 — 철광석은 지형 재료가 아니다', () => {
    const terrain = new Terrain(2, 2);

    expect(terrain.place(0, 0, BlockType.IRON_ORE)).toBe(false);
    expect(terrain.place(0, 0, BlockType.EMPTY)).toBe(false);
    expect(terrain.columnHeight(0, 0)).toBe(0);
  });

  it('맵 밖에는 놓을 수 없다', () => {
    const terrain = flatTerrain(2, 1);

    expect(terrain.place(-1, 0, BlockType.DIRT)).toBe(false);
    expect(terrain.place(0, 5, BlockType.DIRT)).toBe(false);
  });
});

describe('Terrain 평탄도 판정', () => {
  it('같은 높이의 사각 영역은 평탄하다', () => {
    const terrain = flatTerrain(6, 3);

    expect(terrain.isFlatArea(1, 1, 3, 2)).toBe(true);
  });

  it('한 칸이라도 높이가 다르면 평탄하지 않다', () => {
    const terrain = flatTerrain(6, 3);
    terrain.place(2, 1, BlockType.DIRT);

    expect(terrain.isFlatArea(1, 1, 3, 2)).toBe(false);
  });

  it('파낸 자리가 섞여도 평탄하지 않다', () => {
    const terrain = flatTerrain(6, 3);
    terrain.dig(2, 2);

    expect(terrain.isFlatArea(1, 1, 3, 3)).toBe(false);
  });

  it('바닥까지 파인 자리는 평탄해도 건축 대상이 아니다', () => {
    const terrain = flatTerrain(4, 1);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) terrain.dig(x, y);
    }

    expect(terrain.isFlatArea(0, 0, 2, 2)).toBe(false);
  });

  it('영역이 맵 경계를 넘으면 거부한다', () => {
    const terrain = flatTerrain(4, 3);

    expect(terrain.isFlatArea(3, 3, 2, 2)).toBe(false);
    expect(terrain.isFlatArea(-1, 0, 2, 2)).toBe(false);
  });

  it('1×1 영역도 판정한다', () => {
    const terrain = flatTerrain(4, 2);

    expect(terrain.isFlatArea(2, 2, 1, 1)).toBe(true);
  });

  it('크기가 1 미만이거나 정수가 아니면 거부한다', () => {
    const terrain = flatTerrain(4, 2);

    expect(terrain.isFlatArea(0, 0, 0, 2)).toBe(false);
    expect(terrain.isFlatArea(0, 0, 2, -1)).toBe(false);
    expect(terrain.isFlatArea(0, 0, 1.5, 2)).toBe(false);
  });

  it('쌓아서 평탄하게 만들면 판정이 참으로 바뀐다', () => {
    const terrain = flatTerrain(4, 3);
    terrain.dig(1, 1);
    expect(terrain.isFlatArea(0, 0, 3, 3)).toBe(false);

    terrain.place(1, 1, BlockType.DIRT);
    expect(terrain.isFlatArea(0, 0, 3, 3)).toBe(true);
  });
});
