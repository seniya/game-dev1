import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { MAX_LAYERS } from '../src/core/coordinates';
import { hashNoise } from '../src/core/random';
import { generateTerrain } from '../src/core/terrainGen';

describe('hashNoise', () => {
  it('항상 0 이상 1 미만이다', () => {
    for (let x = -50; x < 50; x += 7) {
      for (let y = -50; y < 50; y += 11) {
        const value = hashNoise(x, y, 3);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('같은 입력은 같은 값을 준다', () => {
    expect(hashNoise(4, 9, 1)).toBe(hashNoise(4, 9, 1));
  });

  it('시드가 다르면 값이 달라진다', () => {
    expect(hashNoise(4, 9, 1)).not.toBe(hashNoise(4, 9, 2));
  });

  it('인접 좌표가 같은 값으로 뭉치지 않는다', () => {
    const values = new Set<number>();
    for (let x = 0; x < 20; x += 1) values.add(hashNoise(x, 0, 1));

    expect(values.size).toBeGreaterThan(15);
  });

  it('값이 한쪽으로 심하게 치우치지 않는다', () => {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < 60; x += 1) {
      for (let y = 0; y < 60; y += 1) {
        sum += hashNoise(x, y, 42);
        count += 1;
      }
    }

    expect(sum / count).toBeGreaterThan(0.4);
    expect(sum / count).toBeLessThan(0.6);
  });
});

describe('generateTerrain', () => {
  it('같은 시드는 같은 지형을 만든다', () => {
    const a = generateTerrain(8, 8, { seed: 7 });
    const b = generateTerrain(8, 8, { seed: 7 });

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        expect(a.columnHeight(x, y)).toBe(b.columnHeight(x, y));
        expect(a.surfaceBlock(x, y)).toBe(b.surfaceBlock(x, y));
      }
    }
  });

  it('시드가 다르면 지형이 달라진다', () => {
    const a = generateTerrain(16, 16, { seed: 1 });
    const b = generateTerrain(16, 16, { seed: 2 });

    let differences = 0;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (a.columnHeight(x, y) !== b.columnHeight(x, y)) differences += 1;
      }
    }

    expect(differences).toBeGreaterThan(0);
  });

  it('모든 열이 1 이상 MAX_LAYERS 이하다 — 시작부터 뚫린 구멍은 없다', () => {
    const terrain = generateTerrain(24, 24, { seed: 5 });

    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        const height = terrain.columnHeight(x, y);
        expect(height).toBeGreaterThanOrEqual(1);
        expect(height).toBeLessThanOrEqual(MAX_LAYERS);
      }
    }
  });

  it('표면은 항상 흙이다 — 광석이 지표에 드러나지 않는다', () => {
    const terrain = generateTerrain(24, 24, { seed: 11 });

    for (let y = 0; y < 24; y += 1) {
      for (let x = 0; x < 24; x += 1) {
        expect(terrain.surfaceBlock(x, y)).toBe(BlockType.DIRT);
      }
    }
  });

  it('표면 아래는 돌이고 최하층에 철광석이 섞인다', () => {
    const terrain = generateTerrain(32, 32, { seed: 13, oreChance: 1 });

    let ore = 0;
    let stone = 0;
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const height = terrain.columnHeight(x, y);
        if (height < 3) continue;

        // 최하층은 광석(확률 1이므로 전부), 중간층은 돌이어야 한다.
        if (terrain.blockAt(x, y, 0) === BlockType.IRON_ORE) ore += 1;
        if (terrain.blockAt(x, y, 1) === BlockType.STONE) stone += 1;
      }
    }

    expect(ore).toBeGreaterThan(0);
    expect(stone).toBe(ore);
  });

  it('광석 확률 0이면 철광석이 없다', () => {
    const terrain = generateTerrain(16, 16, { seed: 17, oreChance: 0 });

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        for (let z = 0; z < MAX_LAYERS; z += 1) {
          expect(terrain.blockAt(x, y, z)).not.toBe(BlockType.IRON_ORE);
        }
      }
    }
  });

  it('기복 0이면 완전한 평지가 된다', () => {
    const terrain = generateTerrain(12, 12, { seed: 19, baseHeight: 3, reliefRange: 0 });

    expect(terrain.isFlatArea(0, 0, 12, 12)).toBe(true);
  });

  it('기복이 있으면 높이가 여러 값으로 나뉜다', () => {
    const terrain = generateTerrain(32, 32, { seed: 23, reliefRange: 1 });

    const heights = new Set<number>();
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) heights.add(terrain.columnHeight(x, y));
    }

    expect(heights.size).toBeGreaterThan(1);
  });

  it('기준 높이가 상한을 넘겨도 MAX_LAYERS로 잘린다', () => {
    const terrain = generateTerrain(8, 8, { seed: 29, baseHeight: 99, reliefRange: 3 });

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        expect(terrain.columnHeight(x, y)).toBe(MAX_LAYERS);
      }
    }
  });
});
