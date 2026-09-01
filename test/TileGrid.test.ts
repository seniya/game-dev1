import { describe, expect, it } from 'vitest';
import { TileGrid } from '../src/core/TileGrid';

describe('TileGrid', () => {
  it('크기와 타일 수를 보고한다', () => {
    const grid = new TileGrid(48, 32);

    expect(grid.width).toBe(48);
    expect(grid.height).toBe(32);
    expect(grid.tileCount).toBe(48 * 32);
  });

  it('범위 안의 정수 좌표만 포함으로 본다', () => {
    const grid = new TileGrid(4, 3);

    expect(grid.contains(0, 0)).toBe(true);
    expect(grid.contains(3, 2)).toBe(true);
    expect(grid.contains(4, 2)).toBe(false);
    expect(grid.contains(3, 3)).toBe(false);
    expect(grid.contains(-1, 0)).toBe(false);
    expect(grid.contains(0, -1)).toBe(false);
  });

  it('소수 좌표는 포함으로 보지 않는다', () => {
    const grid = new TileGrid(4, 4);

    expect(grid.contains(1.5, 2)).toBe(false);
    expect(grid.contains(1, Number.NaN)).toBe(false);
  });

  it('중심 타일은 짝수·홀수 크기 모두에서 기하 중심이다', () => {
    expect(new TileGrid(4, 4).centerTile).toEqual({ x: 1.5, y: 1.5 });
    expect(new TileGrid(5, 3).centerTile).toEqual({ x: 2, y: 1 });
  });

  it('크기가 1 미만이거나 정수가 아니면 예외를 던진다', () => {
    expect(() => new TileGrid(0, 4)).toThrow(RangeError);
    expect(() => new TileGrid(4, -1)).toThrow(RangeError);
    expect(() => new TileGrid(4.5, 4)).toThrow(RangeError);
  });
});
