import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { Terrain } from '../src/core/Terrain';
import {
  FOREST_RADIUS,
  MEADOW_RADIUS,
  ZONE_ORDER,
  Zone,
  distanceFromCenter,
  zoneAt,
  zoneLabel,
} from '../src/core/zones';

/**
 * 지정 크기의 평지를 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function flat(size: number): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
  }
  return terrain;
}

describe('구역', () => {
  it('바깥으로 갈수록 상위 구역이다', () => {
    expect(ZONE_ORDER).toEqual([Zone.MEADOW, Zone.FOREST, Zone.MOUNTAIN]);
  });

  it('모든 구역에 이름이 있다', () => {
    expect(ZONE_ORDER.map(zoneLabel)).toEqual(['초원', '숲', '산악']);
  });
});

describe('distanceFromCenter', () => {
  it('중심에서는 0이다', () => {
    const terrain = flat(9);

    expect(distanceFromCenter(terrain, 4, 4)).toBe(0);
  });

  it('체비쇼프 거리를 쓴다 — 대각선도 같은 거리로 본다', () => {
    const terrain = flat(9);

    expect(distanceFromCenter(terrain, 6, 4)).toBe(2);
    expect(distanceFromCenter(terrain, 6, 6)).toBe(2);
  });
});

describe('zoneAt', () => {
  it('마을 주변은 초원이다', () => {
    const terrain = flat(40);
    const center = Math.floor((40 - 1) / 2);

    expect(zoneAt(terrain, center, center)).toBe(Zone.MEADOW);
    expect(zoneAt(terrain, center + MEADOW_RADIUS, center)).toBe(Zone.MEADOW);
  });

  it('초원 바깥은 숲이다', () => {
    const terrain = flat(40);
    const center = Math.floor((40 - 1) / 2);

    expect(zoneAt(terrain, center + MEADOW_RADIUS + 1, center)).toBe(Zone.FOREST);
    expect(zoneAt(terrain, center + FOREST_RADIUS, center)).toBe(Zone.FOREST);
  });

  it('숲 바깥은 산악이다', () => {
    const terrain = flat(40);
    const center = Math.floor((40 - 1) / 2);

    expect(zoneAt(terrain, center + FOREST_RADIUS + 1, center)).toBe(Zone.MOUNTAIN);
  });

  it('네 방향 모두 같은 거리에서 구역이 바뀐다', () => {
    const terrain = flat(41);
    const center = 20;
    const edge = MEADOW_RADIUS + 1;

    for (const [dx, dy] of [
      [edge, 0],
      [-edge, 0],
      [0, edge],
      [0, -edge],
    ] as const) {
      expect(zoneAt(terrain, center + dx, center + dy)).toBe(Zone.FOREST);
    }
  });
});
