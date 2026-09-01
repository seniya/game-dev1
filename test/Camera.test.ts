import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, Camera } from '../src/render/Camera';
import { TILE_HEIGHT, TILE_WIDTH, gridToWorld } from '../src/core/coordinates';

/**
 * 뷰포트가 설정된 카메라를 만든다.
 *
 * @param width 뷰포트 너비(CSS px).
 * @param height 뷰포트 높이(CSS px).
 */
function makeCamera(width = 800, height = 600): Camera {
  const camera = new Camera();
  camera.setViewport(width, height);
  return camera;
}

describe('Camera 변환', () => {
  it('기본 상태에서 뷰포트 중심이 월드 원점이다', () => {
    const camera = makeCamera(800, 600);

    expect(camera.worldToScreen(0, 0)).toEqual({ x: 400, y: 300 });
    expect(camera.screenToWorld(400, 300)).toEqual({ x: 0, y: 0 });
  });

  it('worldToScreen과 screenToWorld는 서로의 역이다', () => {
    const camera = makeCamera(1024, 768);
    camera.lookAt(137, -49);
    camera.zoomAt(300, 200, 1.7);

    for (const point of [
      { x: 0, y: 0 },
      { x: 512.5, y: -300.25 },
      { x: -1000, y: 2500 },
    ]) {
      const screen = camera.worldToScreen(point.x, point.y);
      const back = camera.screenToWorld(screen.x, screen.y);

      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });

  it('lookAt한 지점이 화면 중앙에 온다', () => {
    const camera = makeCamera(800, 600);
    const world = gridToWorld(10, 4, 0);
    camera.lookAt(world.x, world.y);

    const screen = camera.worldToScreen(world.x, world.y);
    expect(screen).toEqual({ x: 400, y: 300 });
  });
});

describe('Camera 팬', () => {
  it('커서를 끈 방향으로 화면 내용이 따라온다', () => {
    const camera = makeCamera(800, 600);
    const before = camera.worldToScreen(0, 0);

    camera.panByScreen(50, -30);
    const after = camera.worldToScreen(0, 0);

    expect(after.x - before.x).toBeCloseTo(50, 6);
    expect(after.y - before.y).toBeCloseTo(-30, 6);
  });

  it('확대된 상태에서는 같은 픽셀 드래그가 더 짧은 월드 거리에 대응한다', () => {
    const zoomedIn = makeCamera();
    zoomedIn.zoomAt(400, 300, 2);
    zoomedIn.panByScreen(100, 0);

    const plain = makeCamera();
    plain.panByScreen(100, 0);

    expect(Math.abs(zoomedIn.center.x)).toBeCloseTo(Math.abs(plain.center.x) / 2, 6);
  });

  it('팬을 되돌리면 원래 위치로 돌아온다', () => {
    const camera = makeCamera();
    camera.panByScreen(123, -45);
    camera.panByScreen(-123, 45);

    expect(camera.center.x).toBeCloseTo(0, 6);
    expect(camera.center.y).toBeCloseTo(0, 6);
  });
});

describe('Camera 줌', () => {
  it('커서 아래 월드 지점이 줌 전후로 고정된다', () => {
    const camera = makeCamera(800, 600);
    const cursor = { x: 250, y: 180 };
    const anchor = camera.screenToWorld(cursor.x, cursor.y);

    camera.zoomAt(cursor.x, cursor.y, 1.5);
    const moved = camera.worldToScreen(anchor.x, anchor.y);

    expect(moved.x).toBeCloseTo(cursor.x, 6);
    expect(moved.y).toBeCloseTo(cursor.y, 6);
  });

  it('여러 번 줌해도 앵커가 유지된다', () => {
    const camera = makeCamera(800, 600);
    const cursor = { x: 610, y: 90 };
    const anchor = camera.screenToWorld(cursor.x, cursor.y);

    for (const factor of [1.2, 1.2, 0.8, 1.5, 0.5]) {
      camera.zoomAt(cursor.x, cursor.y, factor);
    }

    const moved = camera.worldToScreen(anchor.x, anchor.y);
    expect(moved.x).toBeCloseTo(cursor.x, 5);
    expect(moved.y).toBeCloseTo(cursor.y, 5);
  });

  it('확대율은 상·하한으로 잘린다', () => {
    const camera = makeCamera();

    for (let i = 0; i < 50; i += 1) camera.zoomAt(400, 300, 1.5);
    expect(camera.zoom).toBe(MAX_ZOOM);

    for (let i = 0; i < 50; i += 1) camera.zoomAt(400, 300, 0.5);
    expect(camera.zoom).toBe(MIN_ZOOM);
  });

  it('0 이하이거나 유한하지 않은 배수는 무시한다', () => {
    const camera = makeCamera();

    camera.zoomAt(400, 300, 0);
    camera.zoomAt(400, 300, -2);
    camera.zoomAt(400, 300, Number.NaN);

    expect(camera.zoom).toBe(1);
  });
});

describe('Camera 가시 범위', () => {
  it('보이는 월드 영역은 확대율에 반비례한다', () => {
    const camera = makeCamera(800, 600);
    const wide = camera.visibleWorldBounds();

    camera.zoomAt(400, 300, 2);
    const narrow = camera.visibleWorldBounds();

    expect(wide.right - wide.left).toBeCloseTo(800, 6);
    expect(narrow.right - narrow.left).toBeCloseTo(400, 6);
  });

  it('화면 중앙 타일은 항상 컬링 범위에 든다', () => {
    const camera = makeCamera(800, 600);
    const world = gridToWorld(20, 12, 0);
    camera.lookAt(world.x, world.y);

    const range = camera.visibleTileRange();

    expect(range.minX).toBeLessThanOrEqual(20);
    expect(range.maxX).toBeGreaterThanOrEqual(20);
    expect(range.minY).toBeLessThanOrEqual(12);
    expect(range.maxY).toBeGreaterThanOrEqual(12);
  });

  it('화면에 마름모가 걸치는 타일을 하나도 빠뜨리지 않는다', () => {
    const camera = makeCamera(640, 480);
    camera.lookAt(0, 0);
    const range = camera.visibleTileRange();
    const bounds = camera.visibleWorldBounds();

    // 넓은 후보 영역을 훑어, 화면과 겹치는 타일이 모두 범위 안에 있는지 본다.
    for (let x = -40; x <= 40; x += 1) {
      for (let y = -40; y <= 40; y += 1) {
        for (let z = 0; z < 5; z += 1) {
          const world = gridToWorld(x, y, z);
          const overlaps =
            world.x + TILE_WIDTH / 2 > bounds.left &&
            world.x - TILE_WIDTH / 2 < bounds.right &&
            world.y + TILE_HEIGHT / 2 > bounds.top &&
            world.y - TILE_HEIGHT / 2 < bounds.bottom;

          if (!overlaps) continue;

          expect(x).toBeGreaterThanOrEqual(range.minX);
          expect(x).toBeLessThanOrEqual(range.maxX);
          expect(y).toBeGreaterThanOrEqual(range.minY);
          expect(y).toBeLessThanOrEqual(range.maxY);
        }
      }
    }
  });

  it('멀리 떨어진 타일은 컬링 범위에서 제외된다', () => {
    const camera = makeCamera(800, 600);
    camera.lookAt(0, 0);
    const range = camera.visibleTileRange();

    expect(range.maxX).toBeLessThan(200);
    expect(range.maxY).toBeLessThan(200);
    expect(range.minX).toBeGreaterThan(-200);
    expect(range.minY).toBeGreaterThan(-200);
  });

  it('축소하면 컬링 범위가 넓어진다', () => {
    const camera = makeCamera(800, 600);
    const before = camera.visibleTileRange();

    camera.zoomAt(400, 300, 0.5);
    const after = camera.visibleTileRange();

    expect(after.maxX - after.minX).toBeGreaterThan(before.maxX - before.minX);
    expect(after.maxY - after.minY).toBeGreaterThan(before.maxY - before.minY);
  });

  it('팬하면 컬링 범위도 함께 움직인다', () => {
    const camera = makeCamera(800, 600);
    const before = camera.visibleTileRange();

    // 화면을 왼쪽-위로 크게 밀어 그리드 좌표가 증가하는 방향으로 이동시킨다.
    camera.panByScreen(-2000, -2000);
    const after = camera.visibleTileRange();

    expect(after.minX).toBeGreaterThan(before.minX);
    expect(after.maxX).toBeGreaterThan(before.maxX);
  });
});

describe('Camera.setZoom', () => {
  it('확대율을 직접 지정하되 화면 중심은 그대로 둔다', () => {
    const camera = makeCamera(800, 600);
    camera.lookAt(120, -80);

    camera.setZoom(0.7);

    expect(camera.zoom).toBeCloseTo(0.7, 6);
    expect(camera.center).toEqual({ x: 120, y: -80 });
  });

  it('상·하한을 벗어난 값은 잘린다', () => {
    const camera = makeCamera();

    camera.setZoom(100);
    expect(camera.zoom).toBe(MAX_ZOOM);

    camera.setZoom(0.001);
    expect(camera.zoom).toBe(MIN_ZOOM);
  });

  it('0 이하이거나 유한하지 않은 값은 무시한다', () => {
    const camera = makeCamera();

    camera.setZoom(0);
    camera.setZoom(-1);
    camera.setZoom(Number.NaN);

    expect(camera.zoom).toBe(1);
  });
});

describe('Camera.moveToward', () => {
  it('목표를 향해 일부만 다가간다', () => {
    const camera = makeCamera();
    camera.lookAt(0, 0);

    camera.moveToward(100, 200, 0.25);

    expect(camera.center.x).toBeCloseTo(25, 6);
    expect(camera.center.y).toBeCloseTo(50, 6);
  });

  it('반복하면 목표에 수렴한다', () => {
    const camera = makeCamera();
    camera.lookAt(0, 0);

    for (let i = 0; i < 200; i += 1) camera.moveToward(100, -50, 0.12);

    expect(camera.center.x).toBeCloseTo(100, 3);
    expect(camera.center.y).toBeCloseTo(-50, 3);
  });

  it('비율 1이면 즉시 도달하고, 0이면 움직이지 않는다', () => {
    const camera = makeCamera();

    camera.moveToward(10, 10, 1);
    expect(camera.center).toEqual({ x: 10, y: 10 });

    camera.moveToward(999, 999, 0);
    expect(camera.center).toEqual({ x: 10, y: 10 });
  });

  it('비율이 범위를 벗어나면 잘라 쓴다', () => {
    const camera = makeCamera();
    camera.lookAt(0, 0);

    camera.moveToward(100, 0, 5);
    expect(camera.center.x).toBeCloseTo(100, 6);

    camera.moveToward(0, 0, -1);
    expect(camera.center.x).toBeCloseTo(100, 6);
  });

  it('유한하지 않은 목표는 무시한다', () => {
    const camera = makeCamera();
    camera.lookAt(5, 5);

    camera.moveToward(Number.NaN, 0, 0.5);
    camera.moveToward(0, Number.POSITIVE_INFINITY, 0.5);

    expect(camera.center).toEqual({ x: 5, y: 5 });
  });
});
