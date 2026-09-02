import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import {
  CURSOR_RANGE,
  FORWARD_OFFSET,
  TargetCursor,
  facingOffset,
  resolveCursor,
  stepOffset,
} from '../src/core/cursor';
import { Terrain } from '../src/core/Terrain';

/**
 * 평평한 지형을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function makeTerrain(size = 9): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
  }
  return terrain;
}

describe('커서 오프셋', () => {
  it('한 칸씩 움직인다', () => {
    expect(stepOffset({ dx: 0, dy: 0 }, 1, 0)).toEqual({ dx: 1, dy: 0 });
    expect(stepOffset({ dx: 1, dy: 0 }, 0, -1)).toEqual({ dx: 1, dy: -1 });
  });

  it('범위를 벗어나면 경계에 머문다 — 커서가 화면 밖으로 나가면 안 보인다', () => {
    const far = stepOffset({ dx: CURSOR_RANGE, dy: 0 }, 1, 0);

    expect(far.dx).toBe(CURSOR_RANGE);
  });

  it('걸은 방향을 인접 오프셋으로 바꾼다', () => {
    expect(facingOffset(0, 1)).toEqual({ dx: 0, dy: 1 });
    expect(facingOffset(0, 0)).toBeNull();
  });

  it('맵 밖을 겨냥하면 맵 안으로 당긴다', () => {
    const terrain = makeTerrain(5);

    expect(resolveCursor(terrain, { x: 0, y: 0 }, { dx: -3, dy: -3 })).toEqual({ x: 0, y: 0 });
    expect(resolveCursor(terrain, { x: 4, y: 4 }, { dx: 3, dy: 3 })).toEqual({ x: 4, y: 4 });
  });
});

describe('겨냥 커서', () => {
  it('처음에는 플레이어 앞 한 칸을 겨냥한다', () => {
    const terrain = makeTerrain();
    const cursor = new TargetCursor();

    expect(cursor.tile(terrain, { x: 4, y: 4 })).toEqual({
      x: 4 + FORWARD_OFFSET.dx,
      y: 4 + FORWARD_OFFSET.dy,
    });
  });

  it('걸으면 커서가 함께 따라온다 — 오프셋이 플레이어 기준이기 때문이다', () => {
    const terrain = makeTerrain();
    const cursor = new TargetCursor();

    expect(cursor.tile(terrain, { x: 4, y: 4 })).toEqual({ x: 5, y: 4 });
    expect(cursor.tile(terrain, { x: 4, y: 5 })).toEqual({ x: 5, y: 5 });
  });

  it('걸으면 그 방향을 겨냥한다', () => {
    const terrain = makeTerrain();
    const cursor = new TargetCursor();
    cursor.aimBy(0, -1);
    cursor.aimBy(0, -1);

    cursor.faceTowards(-1, 0);

    expect(cursor.tile(terrain, { x: 4, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('건축 모드에서는 걸어도 부지를 지킨다', () => {
    const terrain = makeTerrain();
    const cursor = new TargetCursor();
    cursor.aimBy(0, -1);
    cursor.aimBy(0, -1);

    cursor.faceTowards(-1, 0, true);

    // 찍어 둔 부지를 보며 각도를 옮기는 것이 건축의 흐름이다.
    expect(cursor.tile(terrain, { x: 4, y: 4 })).toEqual({ x: 5, y: 2 });
  });

  it('마우스가 움직이면 마우스가 대상을 가져간다', () => {
    const terrain = makeTerrain();
    const cursor = new TargetCursor();

    cursor.setPointer({ x: 1, y: 1 });

    expect(cursor.source).toBe('pointer');
    expect(cursor.tile(terrain, { x: 4, y: 4 })).toEqual({ x: 1, y: 1 });
  });

  it('마우스가 가만히 있으면 대상을 빼앗지 않는다 — 마우스를 두고 키보드로 논다', () => {
    const terrain = makeTerrain();
    const cursor = new TargetCursor();

    cursor.setPointer({ x: 1, y: 1 });
    cursor.aimBy(0, -1);
    // 매 프레임 같은 칸이 들어오지만 마우스는 움직이지 않았다.
    cursor.setPointer({ x: 1, y: 1 });
    cursor.setPointer({ x: 1, y: 1 });

    expect(cursor.source).toBe('keyboard');
    expect(cursor.tile(terrain, { x: 4, y: 4 })).toEqual({ x: 5, y: 3 });
  });

  it('마우스가 캔버스를 벗어나면 키보드 커서로 돌아온다', () => {
    const terrain = makeTerrain();
    const cursor = new TargetCursor();

    cursor.setPointer({ x: 1, y: 1 });
    cursor.setPointer(null);

    expect(cursor.source).toBe('keyboard');
    expect(cursor.tile(terrain, { x: 4, y: 4 })).toEqual({ x: 5, y: 4 });
  });
});
