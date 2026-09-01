import { describe, expect, it } from 'vitest';
import { BlueprintId, blueprintById, buildDurationMs } from '../src/core/blueprints';
import { BlockType } from '../src/core/blocks';
import { Terrain } from '../src/core/Terrain';
import { Buildings, type NodeBlocker } from '../src/sim/Buildings';

/**
 * 지정 크기의 평지를 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 * @param height 각 열의 블록 수.
 */
function flat(size: number, height = 2): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, height, BlockType.DIRT);
  }
  return terrain;
}

/** 아무 칸도 막지 않는 노드 대역. */
const noNodes: NodeBlocker = { isBlocked: () => false };

/**
 * 특정 칸만 막는 노드 대역을 만든다.
 *
 * @param blocked 막을 칸 목록.
 */
function nodesAt(blocked: Array<{ x: number; y: number }>): NodeBlocker {
  return {
    isBlocked: (x, y) => blocked.some((tile) => tile.x === x && tile.y === y),
  };
}

const cottage = blueprintById(BlueprintId.COTTAGE);
const well = blueprintById(BlueprintId.WELL);

describe('Buildings 배치 판정', () => {
  it('평탄한 빈 자리에는 놓을 수 있다', () => {
    const buildings = new Buildings(flat(8));

    expect(buildings.canPlace(cottage, 2, 2, noNodes)).toEqual({ ok: true });
  });

  it('맵 경계를 넘으면 거절한다', () => {
    const buildings = new Buildings(flat(8));

    expect(buildings.canPlace(cottage, 7, 7, noNodes)).toEqual({ ok: false, reason: 'outOfBounds' });
    expect(buildings.canPlace(cottage, -1, 0, noNodes)).toEqual({ ok: false, reason: 'outOfBounds' });
  });

  it('정수가 아닌 좌표는 거절한다', () => {
    const buildings = new Buildings(flat(8));

    expect(buildings.canPlace(cottage, 1.5, 2, noNodes)).toEqual({
      ok: false,
      reason: 'outOfBounds',
    });
  });

  it('평탄하지 않은 자리는 거절한다 — 기획서 5.3', () => {
    const terrain = flat(8);
    terrain.place(3, 3, BlockType.DIRT);
    const buildings = new Buildings(terrain);

    expect(buildings.canPlace(cottage, 2, 2, noNodes)).toEqual({ ok: false, reason: 'notFlat' });
  });

  it('바닥까지 파인 자리는 평탄해도 거절한다', () => {
    const terrain = flat(8, 1);
    for (let y = 2; y < 4; y += 1) {
      for (let x = 2; x < 4; x += 1) terrain.dig(x, y);
    }
    const buildings = new Buildings(terrain);

    expect(buildings.canPlace(cottage, 2, 2, noNodes)).toEqual({ ok: false, reason: 'notFlat' });
  });

  it('자원 노드가 막고 있으면 거절한다', () => {
    const buildings = new Buildings(flat(8));

    expect(buildings.canPlace(cottage, 2, 2, nodesAt([{ x: 3, y: 3 }]))).toEqual({
      ok: false,
      reason: 'nodeInWay',
    });
  });

  it('다른 건물과 겹치면 거절한다', () => {
    const buildings = new Buildings(flat(8));
    buildings.place(cottage, 2, 2, noNodes);

    expect(buildings.canPlace(cottage, 3, 3, noNodes)).toEqual({ ok: false, reason: 'overlaps' });
    expect(buildings.canPlace(well, 2, 2, noNodes)).toEqual({ ok: false, reason: 'overlaps' });
  });

  it('바로 옆에 붙여 짓는 것은 허용한다', () => {
    const buildings = new Buildings(flat(8));
    buildings.place(cottage, 2, 2, noNodes);

    expect(buildings.canPlace(cottage, 4, 2, noNodes)).toEqual({ ok: true });
  });

  it('쌓아서 평탄하게 만들면 배치가 가능해진다', () => {
    const terrain = flat(8);
    terrain.place(3, 3, BlockType.DIRT);
    const buildings = new Buildings(terrain);
    expect(buildings.canPlace(cottage, 2, 2, noNodes).ok).toBe(false);

    terrain.place(2, 2, BlockType.DIRT);
    terrain.place(2, 3, BlockType.DIRT);
    terrain.place(3, 2, BlockType.DIRT);

    expect(buildings.canPlace(cottage, 2, 2, noNodes)).toEqual({ ok: true });
  });
});

describe('Buildings 배치', () => {
  it('점유 영역 전체를 차지한다', () => {
    const buildings = new Buildings(flat(8));
    const building = buildings.place(cottage, 2, 2, noNodes);

    expect(building).not.toBeNull();
    for (const [x, y] of [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ] as const) {
      expect(buildings.isOccupied(x, y)).toBe(true);
      expect(buildings.buildingAt(x, y)?.id).toBe(building!.id);
    }
    expect(buildings.isOccupied(4, 2)).toBe(false);
  });

  it('배치할 수 없는 자리면 null이고 점유도 남기지 않는다', () => {
    const buildings = new Buildings(flat(8));

    expect(buildings.place(cottage, 7, 7, noNodes)).toBeNull();
    expect(buildings.count).toBe(0);
  });

  it('착공한 건물은 건축 중이고, 즉시 완공 옵션은 바로 완성된다', () => {
    const buildings = new Buildings(flat(8));

    const building = buildings.place(cottage, 2, 2, noNodes)!;
    expect(building.buildRemainingMs).toBeGreaterThan(0);
    expect(buildings.completedCount).toBe(0);

    const instant = buildings.place(well, 5, 5, noNodes, true)!;
    expect(instant.buildRemainingMs).toBe(0);
    expect(buildings.completedCount).toBe(1);
  });

  it('건물마다 다른 번호를 준다', () => {
    const buildings = new Buildings(flat(8));

    const a = buildings.place(well, 1, 1, noNodes)!;
    const b = buildings.place(well, 3, 3, noNodes)!;

    expect(a.id).not.toBe(b.id);
  });
});

describe('Buildings 건축 진행', () => {
  it('시간이 지나면 완공되고 완공 목록을 돌려준다', () => {
    const buildings = new Buildings(flat(8));
    const building = buildings.place(cottage, 2, 2, noNodes)!;
    const duration = buildDurationMs(cottage);

    expect(buildings.update(duration - 100)).toHaveLength(0);
    expect(buildings.progressOf(building)).toBeGreaterThan(0.9);
    expect(buildings.progressOf(building)).toBeLessThan(1);

    const completed = buildings.update(200);

    expect(completed).toHaveLength(1);
    expect(completed[0]!.id).toBe(building.id);
    expect(buildings.progressOf(building)).toBe(1);
  });

  it('완공된 건물은 다시 완공 목록에 오르지 않는다', () => {
    const buildings = new Buildings(flat(8));
    buildings.place(well, 2, 2, noNodes);

    buildings.update(buildDurationMs(well) + 100);
    expect(buildings.update(10_000)).toHaveLength(0);
  });

  it('건축 중에도 자리를 점유해 다른 건물이 겹치지 못한다', () => {
    const buildings = new Buildings(flat(8));
    buildings.place(cottage, 2, 2, noNodes);

    expect(buildings.canPlace(well, 2, 2, noNodes)).toEqual({ ok: false, reason: 'overlaps' });
  });
});

describe('Buildings 조회', () => {
  it('완공된 블루프린트가 있는지 확인한다', () => {
    const buildings = new Buildings(flat(8));
    buildings.place(well, 2, 2, noNodes);

    expect(buildings.hasCompleted(BlueprintId.WELL)).toBe(false);

    buildings.update(buildDurationMs(well) + 100);
    expect(buildings.hasCompleted(BlueprintId.WELL)).toBe(true);
    expect(buildings.hasCompleted(BlueprintId.COTTAGE)).toBe(false);
  });

  it('완공 건물의 속성을 더한다 — 건축 중인 것은 세지 않는다', () => {
    const buildings = new Buildings(flat(10));
    buildings.place(cottage, 1, 1, noNodes, true);
    buildings.place(cottage, 4, 1, noNodes);

    expect(buildings.sumCompleted((blueprint) => blueprint.housing)).toBe(cottage.housing);

    buildings.update(buildDurationMs(cottage) + 100);
    expect(buildings.sumCompleted((blueprint) => blueprint.housing)).toBe(cottage.housing * 2);
  });

  it('인접한 완공 건물을 찾는다', () => {
    const buildings = new Buildings(flat(8));
    buildings.place(cottage, 3, 3, noNodes, true);

    // 2×2라 (3,3)~(4,4)를 덮는다. (3,5)는 (3,4)에 인접하므로 대상이고, (3,6)은 아니다.
    expect(buildings.adjacentCompleted({ x: 2, y: 3 })).toBeDefined();
    expect(buildings.adjacentCompleted({ x: 3, y: 5 })).toBeDefined();
    expect(buildings.adjacentCompleted({ x: 3, y: 6 })).toBeUndefined();
  });

  it('건축 중인 건물은 인접 대상이 아니다', () => {
    const buildings = new Buildings(flat(8));
    buildings.place(cottage, 3, 3, noNodes);

    expect(buildings.adjacentCompleted({ x: 2, y: 3 })).toBeUndefined();
  });

  it('블루프린트를 지정해 인접 건물을 찾을 수 있다', () => {
    const buildings = new Buildings(flat(10));
    buildings.place(well, 2, 2, noNodes, true);

    expect(buildings.adjacentCompleted({ x: 2, y: 3 }, BlueprintId.WELL)).toBeDefined();
    expect(buildings.adjacentCompleted({ x: 2, y: 3 }, BlueprintId.WAREHOUSE)).toBeUndefined();
  });
});
