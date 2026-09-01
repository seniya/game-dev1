import { describe, expect, it } from 'vitest';
import {
  LAYER_HEIGHT,
  MAX_LAYERS,
  TILE_HEIGHT,
  TILE_WIDTH,
  compareDepth,
  gridToWorld,
  sortByDepth,
  worldToGrid,
  worldToTile,
} from '../src/core/coordinates';

describe('좌표계 규약', () => {
  it('타일은 2:1 마름모이고 레이어 높이는 타일 높이의 절반이다', () => {
    expect(TILE_WIDTH).toBe(TILE_HEIGHT * 2);
    expect(LAYER_HEIGHT).toBe(TILE_HEIGHT / 2);
    expect(MAX_LAYERS).toBe(5);
  });
});

describe('gridToWorld', () => {
  it('원점 타일의 윗면 중심은 월드 원점이다', () => {
    expect(gridToWorld(0, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('x는 오른쪽-아래, y는 왼쪽-아래로 간다', () => {
    expect(gridToWorld(1, 0, 0)).toEqual({ x: TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
    expect(gridToWorld(0, 1, 0)).toEqual({ x: -TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
  });

  it('x와 y가 같이 늘면 화면 아래로만 내려간다', () => {
    expect(gridToWorld(3, 3, 0)).toEqual({ x: 0, y: 3 * TILE_HEIGHT });
  });

  it('z가 늘면 화면에서 위로 올라간다', () => {
    const ground = gridToWorld(2, 2, 0);
    const raised = gridToWorld(2, 2, 3);

    expect(raised.x).toBe(ground.x);
    expect(raised.y).toBe(ground.y - 3 * LAYER_HEIGHT);
  });
});

describe('worldToGrid', () => {
  it('gridToWorld와 왕복해도 값이 보존된다', () => {
    const samples = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 7, z: 2 },
      { x: 13, y: 5, z: 4 },
      { x: -6, y: -3, z: 1 },
      { x: 47, y: 47, z: 0 },
    ];

    for (const sample of samples) {
      const world = gridToWorld(sample.x, sample.y, sample.z);
      const back = worldToGrid(world.x, world.y, sample.z);

      expect(back.x).toBeCloseTo(sample.x, 9);
      expect(back.y).toBeCloseTo(sample.y, 9);
    }
  });

  it('소수 좌표도 왕복 보존된다 — 타일 내부 위치를 잃지 않는다', () => {
    const world = gridToWorld(3.25, 8.75, 0);
    const back = worldToGrid(world.x, world.y, 0);

    expect(back.x).toBeCloseTo(3.25, 9);
    expect(back.y).toBeCloseTo(8.75, 9);
  });

  it('기준 z를 틀리면 대각선 방향으로 어긋난다', () => {
    // z=2 블록의 윗면 중심을 z=0 평면으로 해석하면 x, y가 함께 줄어든다.
    const world = gridToWorld(10, 10, 2);
    const wrong = worldToGrid(world.x, world.y, 0);

    const shift = (2 * LAYER_HEIGHT) / TILE_HEIGHT;
    expect(wrong.x).toBeCloseTo(10 - shift, 9);
    expect(wrong.y).toBeCloseTo(10 - shift, 9);
  });
});

describe('worldToTile', () => {
  it('타일 중심은 그 타일로 판정된다', () => {
    for (const [x, y] of [
      [0, 0],
      [4, 9],
      [17, 2],
    ] as const) {
      const world = gridToWorld(x, y, 0);
      expect(worldToTile(world.x, world.y, 0)).toEqual({ x, y });
    }
  });

  it('마름모 내부의 네 방향 지점도 모두 같은 타일로 판정된다', () => {
    const center = gridToWorld(5, 5, 0);
    // 꼭짓점 바로 안쪽 — 경계에서 반올림이 옆 타일로 새지 않는지 본다.
    const inset = 1;
    const probes = [
      { x: center.x, y: center.y - TILE_HEIGHT / 2 + inset },
      { x: center.x + TILE_WIDTH / 2 - inset, y: center.y },
      { x: center.x, y: center.y + TILE_HEIGHT / 2 - inset },
      { x: center.x - TILE_WIDTH / 2 + inset, y: center.y },
    ];

    for (const probe of probes) {
      expect(worldToTile(probe.x, probe.y, 0)).toEqual({ x: 5, y: 5 });
    }
  });

  it('인접 타일 중심은 서로 다른 타일로 판정된다', () => {
    const seen = new Set<string>();
    for (let x = 0; x < 4; x += 1) {
      for (let y = 0; y < 4; y += 1) {
        const world = gridToWorld(x, y, 0);
        const tile = worldToTile(world.x, world.y, 0);
        seen.add(`${tile.x},${tile.y}`);
      }
    }

    expect(seen.size).toBe(16);
  });

  it('음수 좌표에서도 반올림이 대칭적으로 동작한다', () => {
    const world = gridToWorld(-3, -7, 0);
    expect(worldToTile(world.x, world.y, 0)).toEqual({ x: -3, y: -7 });
  });
});

describe('compareDepth / sortByDepth', () => {
  it('x + y가 작은 블록이 먼저 그려진다', () => {
    expect(compareDepth({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeLessThan(0);
    expect(compareDepth({ x: 2, y: 3, z: 0 }, { x: 1, y: 1, z: 4 })).toBeGreaterThan(0);
  });

  it('같은 대각선에서는 z가 낮은 블록이 먼저 그려진다', () => {
    expect(compareDepth({ x: 1, y: 1, z: 0 }, { x: 2, y: 0, z: 3 })).toBeLessThan(0);
    expect(compareDepth({ x: 0, y: 2, z: 4 }, { x: 1, y: 1, z: 1 })).toBeGreaterThan(0);
  });

  it('완전히 같은 위치는 0을 돌려준다', () => {
    expect(compareDepth({ x: 3, y: 4, z: 2 }, { x: 3, y: 4, z: 2 })).toBe(0);
  });

  it('정렬 결과는 (x + y, z) 오름차순이다', () => {
    const blocks = [
      { x: 2, y: 2, z: 0 },
      { x: 0, y: 0, z: 4 },
      { x: 1, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];

    const sorted = sortByDepth(blocks);

    expect(sorted.map((b) => [b.x + b.y, b.z])).toEqual([
      [0, 0],
      [0, 4],
      [1, 0],
      [1, 1],
      [4, 0],
    ]);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const blocks = [
      { x: 5, y: 5, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];
    const snapshot = [...blocks];

    sortByDepth(blocks);

    expect(blocks).toEqual(snapshot);
  });

  it('앞에 그려진 블록이 뒤 블록을 가리는 관계와 순서가 일치한다', () => {
    // (1,1,3)은 (0,0,0)의 윗면 일부와 화면에서 겹친다. 나중에 그려져야 한다.
    const near = { x: 1, y: 1, z: 3 };
    const far = { x: 0, y: 0, z: 0 };

    const nearWorld = gridToWorld(near.x, near.y, near.z);
    const farWorld = gridToWorld(far.x, far.y, far.z);
    // 화면에서 겹치는지 먼저 확인한다(같은 열, 세로 간격이 타일 높이 미만).
    expect(nearWorld.x).toBe(farWorld.x);
    expect(Math.abs(nearWorld.y - farWorld.y)).toBeLessThan(TILE_HEIGHT);

    expect(compareDepth(far, near)).toBeLessThan(0);
  });
});
