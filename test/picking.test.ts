import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { LAYER_HEIGHT, MAX_LAYERS, TILE_HEIGHT, TILE_WIDTH, gridToWorld } from '../src/core/coordinates';
import { pickSurfaceTile } from '../src/core/picking';
import { Terrain } from '../src/core/Terrain';

/**
 * 모든 열이 같은 높이인 지형을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 * @param height 각 열의 블록 수.
 */
function flat(size: number, height: number): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, height, BlockType.DIRT);
  }
  return terrain;
}

describe('pickSurfaceTile', () => {
  it('평지에서 타일 윗면 중심을 집으면 그 타일이 나온다', () => {
    const terrain = flat(8, 3);

    for (const [x, y] of [
      [0, 0],
      [3, 5],
      [7, 7],
    ] as const) {
      const world = gridToWorld(x, y, 2);
      const hit = pickSurfaceTile(terrain, world.x, world.y);

      expect(hit).toEqual({ x, y, z: 2 });
    }
  });

  it('높이가 달라도 각 열의 윗면을 정확히 집는다', () => {
    const terrain = flat(8, 2);
    terrain.place(4, 4, BlockType.DIRT);
    terrain.place(4, 4, BlockType.DIRT);

    const tall = gridToWorld(4, 4, 3);
    expect(pickSurfaceTile(terrain, tall.x, tall.y)).toEqual({ x: 4, y: 4, z: 3 });

    const short = gridToWorld(2, 6, 1);
    expect(pickSurfaceTile(terrain, short.x, short.y)).toEqual({ x: 2, y: 6, z: 1 });
  });

  it('언덕 윗면을 집으면 뒤에 겹친 낮은 땅이 아니라 언덕이 나온다', () => {
    const terrain = flat(8, 1);
    // (3,3)을 최대 높이까지 쌓아 올린다.
    for (let i = 1; i < MAX_LAYERS; i += 1) terrain.place(3, 3, BlockType.DIRT);

    const world = gridToWorld(3, 3, MAX_LAYERS - 1);
    const hit = pickSurfaceTile(terrain, world.x, world.y);

    expect(hit).toEqual({ x: 3, y: 3, z: MAX_LAYERS - 1 });

    // 같은 화면 지점을 z = 0 평면으로만 해석하면 다른 타일이 나온다 —
    // 높이를 고려하지 않는 피킹이 왜 안 되는지 보여주는 대조 케이스다.
    const naive = {
      x: Math.round((world.x / (TILE_WIDTH / 2) + world.y / (TILE_HEIGHT / 2)) / 2),
      y: Math.round((world.y / (TILE_HEIGHT / 2) - world.x / (TILE_WIDTH / 2)) / 2),
    };
    expect(naive).not.toEqual({ x: 3, y: 3 });
  });

  it('측면 벽을 집으면 그 벽의 주인 열이 나온다', () => {
    const terrain = flat(8, 1);
    // (5,5)만 3칸으로 세워 +x 쪽 측면이 2레이어 노출되게 만든다.
    terrain.place(5, 5, BlockType.DIRT);
    terrain.place(5, 5, BlockType.DIRT);

    const top = gridToWorld(5, 5, 2);
    // 윗면의 동-남 변 중앙에서 한 레이어 아래 지점 = +x 측면 위쪽.
    const probe = {
      x: top.x + TILE_WIDTH / 4,
      y: top.y + TILE_HEIGHT / 4 + LAYER_HEIGHT,
    };

    expect(pickSurfaceTile(terrain, probe.x, probe.y)).toEqual({ x: 5, y: 5, z: 2 });
  });

  it('바닥까지 파인 자리는 집히지 않는다', () => {
    const terrain = flat(4, 1);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) terrain.dig(x, y);
    }

    const world = gridToWorld(2, 2, 0);
    expect(pickSurfaceTile(terrain, world.x, world.y)).toBeNull();
  });

  it('맵 밖을 집으면 null이다', () => {
    const terrain = flat(4, 3);

    const world = gridToWorld(50, 50, 2);
    expect(pickSurfaceTile(terrain, world.x, world.y)).toBeNull();
  });

  it('맵 안 모든 열의 윗면 중심이 자기 자신으로 집힌다', () => {
    const terrain = new Terrain(10, 10);
    // 열마다 높이를 다르게 줘 최악의 경우를 만든다.
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        terrain.fillColumn(x, y, ((x * 3 + y * 7) % MAX_LAYERS) + 1, BlockType.DIRT);
      }
    }

    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 10; x += 1) {
        const z = terrain.columnHeight(x, y) - 1;
        const world = gridToWorld(x, y, z);

        expect(pickSurfaceTile(terrain, world.x, world.y)).toEqual({ x, y, z });
      }
    }
  });

  it('반환하는 z는 항상 그 열의 표면 레이어다', () => {
    const terrain = flat(6, 4);
    terrain.dig(2, 2);

    const world = gridToWorld(2, 2, 2);
    const hit = pickSurfaceTile(terrain, world.x, world.y);

    expect(hit).not.toBeNull();
    expect(hit!.z).toBe(terrain.columnHeight(hit!.x, hit!.y) - 1);
  });
});
