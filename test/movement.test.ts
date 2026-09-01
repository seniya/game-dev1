import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { MAX_CLIMB, canInteract, canStand, canWalk, isAdjacent, walkableNeighbors } from '../src/core/movement';
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

describe('canStand', () => {
  it('지면이 있는 맵 안 칸에만 설 수 있다', () => {
    const terrain = flat(4, 2);

    expect(canStand(terrain, 0, 0)).toBe(true);
    expect(canStand(terrain, -1, 0)).toBe(false);
    expect(canStand(terrain, 4, 0)).toBe(false);
  });

  it('바닥까지 파인 칸에는 설 수 없다', () => {
    const terrain = flat(4, 1);
    terrain.dig(2, 2);

    expect(canStand(terrain, 2, 2)).toBe(false);
  });
});

describe('isAdjacent', () => {
  it('4방향만 인접으로 본다', () => {
    expect(isAdjacent({ x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
    expect(isAdjacent({ x: 2, y: 2 }, { x: 2, y: 1 })).toBe(true);
    expect(isAdjacent({ x: 2, y: 2 }, { x: 3, y: 3 })).toBe(false);
  });

  it('같은 칸은 인접이 아니다', () => {
    expect(isAdjacent({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(false);
  });

  it('두 칸 떨어진 곳은 인접이 아니다', () => {
    expect(isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
  });
});

describe('canWalk', () => {
  it('평지의 인접 칸으로는 걸어갈 수 있다', () => {
    const terrain = flat(5, 2);

    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });

  it('대각선으로는 걸어갈 수 없다', () => {
    const terrain = flat(5, 2);

    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 3 })).toBe(false);
  });

  it(`높이 차 ${MAX_CLIMB}칸까지는 오르내릴 수 있다`, () => {
    const terrain = flat(5, 2);
    terrain.place(3, 2, BlockType.DIRT);

    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
    expect(canWalk(terrain, { x: 3, y: 2 }, { x: 2, y: 2 })).toBe(true);
  });

  it('높이 차가 제한을 넘으면 걸어갈 수 없다', () => {
    const terrain = flat(5, 2);
    terrain.place(3, 2, BlockType.DIRT);
    terrain.place(3, 2, BlockType.DIRT);

    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(false);
  });

  it('쌓아서 계단을 만들면 오를 수 있게 된다 — 지형 변형이 이동로를 만든다', () => {
    const terrain = flat(5, 1);
    for (let i = 0; i < 3; i += 1) terrain.place(3, 2, BlockType.DIRT);
    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(false);

    // 중간 칸을 쌓아 높이 차를 1로 줄이면 통행이 열린다.
    terrain.place(2, 2, BlockType.DIRT);
    terrain.place(2, 2, BlockType.DIRT);
    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });

  it('뚫린 칸이나 맵 밖으로는 걸어갈 수 없다', () => {
    const terrain = flat(5, 1);
    terrain.dig(3, 2);

    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(false);
    expect(canWalk(terrain, { x: 0, y: 0 }, { x: -1, y: 0 })).toBe(false);
  });
});

describe('canInteract', () => {
  it('인접 칸만 상호작용 대상이다', () => {
    const terrain = flat(5, 2);

    expect(canInteract(terrain, { x: 2, y: 2 }, { x: 2, y: 3 })).toBe(true);
    expect(canInteract(terrain, { x: 2, y: 2 }, { x: 4, y: 2 })).toBe(false);
  });

  it('자기가 선 칸은 대상이 아니다 — 발밑을 팔 수 없다', () => {
    const terrain = flat(5, 2);

    expect(canInteract(terrain, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(false);
  });

  it('높이 차가 커도 인접하면 상호작용할 수 있다 — 이동과 다른 규칙이다', () => {
    const terrain = flat(5, 1);
    for (let i = 0; i < 4; i += 1) terrain.place(3, 2, BlockType.DIRT);

    expect(canWalk(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(false);
    expect(canInteract(terrain, { x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
  });

  it('맵 밖은 대상이 아니다', () => {
    const terrain = flat(5, 2);

    expect(canInteract(terrain, { x: 0, y: 0 }, { x: -1, y: 0 })).toBe(false);
  });
});

describe('walkableNeighbors', () => {
  it('평지 한가운데서는 네 방향이 모두 열린다', () => {
    const terrain = flat(5, 2);

    expect(walkableNeighbors(terrain, { x: 2, y: 2 })).toHaveLength(4);
  });

  it('맵 모서리에서는 두 방향만 열린다', () => {
    const terrain = flat(5, 2);

    expect(walkableNeighbors(terrain, { x: 0, y: 0 })).toHaveLength(2);
  });

  it('높은 벽에 막힌 방향은 제외된다', () => {
    const terrain = flat(5, 1);
    terrain.place(3, 2, BlockType.DIRT);
    terrain.place(3, 2, BlockType.DIRT);

    const neighbors = walkableNeighbors(terrain, { x: 2, y: 2 });

    expect(neighbors).toHaveLength(3);
    expect(neighbors).not.toContainEqual({ x: 3, y: 2 });
  });
});
