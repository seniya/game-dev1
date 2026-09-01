import { describe, expect, it } from 'vitest';
import { TILE_HEIGHT, TILE_WIDTH, gridToWorld, worldToTile } from '../src/core/coordinates';
import { TileGrid } from '../src/core/TileGrid';
import { Camera } from '../src/render/Camera';
import { WorldRenderer } from '../src/render/WorldRenderer';

/** 가짜 컨텍스트가 기록하는 도형 하나. */
interface RecordedShape {
  /** 마름모 중심의 화면 좌표. moveTo한 위쪽 꼭짓점에서 역산한다. */
  centerX: number;
  centerY: number;
  /** 마름모 반폭·반높이. */
  halfWidth: number;
  halfHeight: number;
  /** 이 경로에 적용된 채우기 색. */
  fillStyle: string;
  /** 이 경로에 선을 그렸는지 여부. */
  stroked: boolean;
}

/**
 * 그리기 호출을 기록하는 최소 Canvas 2D 컨텍스트 대역.
 *
 * 실제 브라우저 없이 "무엇을 몇 개, 어떤 순서로 그렸는지"를 검증하기 위한
 * 것이다. 픽셀 결과가 아니라 렌더러의 판단(컬링·정렬·하이라이트)을 확인한다.
 */
class RecordingContext {
  /** 완성된 도형 기록. fill 또는 stroke 시점에 확정된다. */
  readonly shapes: RecordedShape[] = [];

  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;

  /** 현재 경로에서 모은 점들. */
  private points: Array<{ x: number; y: number }> = [];
  /** 현재 경로가 이미 shapes에 들어갔는지(fill 후 stroke까지 온 경우). */
  private committedIndex: number | null = null;

  /** 새 경로를 시작한다. */
  beginPath(): void {
    this.points = [];
    this.committedIndex = null;
  }

  /**
   * 경로의 시작점을 기록한다.
   *
   * @param x 화면 x.
   * @param y 화면 y.
   */
  moveTo(x: number, y: number): void {
    this.points.push({ x, y });
  }

  /**
   * 경로에 선분을 추가한다.
   *
   * @param x 화면 x.
   * @param y 화면 y.
   */
  lineTo(x: number, y: number): void {
    this.points.push({ x, y });
  }

  /** 경로를 닫는다. 기록에는 영향이 없다. */
  closePath(): void {}

  /** 현재 경로를 채운 것으로 기록한다. */
  fill(): void {
    this.commit(false);
  }

  /** 현재 경로에 선을 그린 것으로 기록한다. */
  stroke(): void {
    this.commit(true);
  }

  /**
   * 사각형을 채운다. 배경 클리어용이므로 도형 기록에는 넣지 않는다.
   */
  fillRect(): void {}

  /**
   * 현재 경로를 기록에 반영한다. 같은 경로에 fill과 stroke가 모두 오면
   * 기존 기록의 stroked 플래그만 올린다.
   *
   * @param stroked 이번 호출이 stroke인지 여부.
   */
  private commit(stroked: boolean): void {
    if (this.committedIndex !== null) {
      if (stroked) this.shapes[this.committedIndex]!.stroked = true;
      return;
    }

    // 마름모는 위 → 오른쪽 → 아래 → 왼쪽 순서로 그려진다.
    const [top, right, bottom, left] = this.points;
    if (!top || !right || !bottom || !left) return;

    this.shapes.push({
      centerX: top.x,
      centerY: (top.y + bottom.y) / 2,
      halfWidth: (right.x - left.x) / 2,
      halfHeight: (bottom.y - top.y) / 2,
      fillStyle: this.fillStyle,
      stroked,
    });
    this.committedIndex = this.shapes.length - 1;
  }
}

/**
 * 테스트용 렌더러 묶음을 만든다.
 *
 * @param gridSize 정사각 그리드의 한 변 길이(타일).
 * @param viewport 뷰포트 크기(CSS px).
 */
function setup(gridSize = 8, viewport = { width: 800, height: 600 }) {
  const ctx = new RecordingContext();
  const grid = new TileGrid(gridSize, gridSize);
  const camera = new Camera();
  camera.setViewport(viewport.width, viewport.height);

  const center = grid.centerTile;
  const centerWorld = gridToWorld(center.x, center.y, 0);
  camera.lookAt(centerWorld.x, centerWorld.y);

  const renderer = new WorldRenderer(ctx as unknown as CanvasRenderingContext2D, camera, grid);

  return { ctx, grid, camera, renderer };
}

describe('WorldRenderer', () => {
  it('화면에 다 들어오는 작은 그리드는 모든 타일을 정확히 한 번 그린다', () => {
    const { ctx, renderer } = setup(8);

    const stats = renderer.render(null);

    expect(stats.drawnTiles).toBe(64);
    expect(ctx.shapes).toHaveLength(64);
  });

  it('그리드 밖 좌표는 그리지 않고 컬링 수로 센다', () => {
    const { renderer } = setup(8);

    const stats = renderer.render(null);

    // 컬링 범위는 뷰포트를 감싸는 사각형이라 그리드 밖 후보가 반드시 섞인다.
    expect(stats.culledTiles).toBeGreaterThan(0);
  });

  it('그리기 순서는 x + y 오름차순이다', () => {
    const { ctx, renderer, camera } = setup(6);

    renderer.render(null);

    // 각 도형의 화면 좌표를 그리드 좌표로 되돌려 대각선 값이 단조 증가하는지 본다.
    const sums = ctx.shapes.map((shape) => {
      const world = camera.screenToWorld(shape.centerX, shape.centerY);
      const tile = worldToTile(world.x, world.y, 0);
      return tile.x + tile.y;
    });

    for (let i = 1; i < sums.length; i += 1) {
      expect(sums[i]!).toBeGreaterThanOrEqual(sums[i - 1]!);
    }
  });

  it('맵 밖으로 카메라가 나가면 아무것도 그리지 않는다', () => {
    const { ctx, renderer, camera } = setup(8);
    camera.lookAt(100_000, 100_000);

    const stats = renderer.render(null);

    expect(stats.drawnTiles).toBe(0);
    expect(ctx.shapes).toHaveLength(0);
  });

  it('축소해도 화면 밖 타일까지 훑지 않는다 — 컬링 범위가 유한하다', () => {
    const { renderer, camera } = setup(8);
    for (let i = 0; i < 20; i += 1) camera.zoomAt(400, 300, 0.5);

    const stats = renderer.render(null);

    // 8×8 그리드가 전부 보이되, 훑은 후보 수가 폭발하지 않아야 한다.
    expect(stats.drawnTiles).toBe(64);
    expect(stats.culledTiles).toBeLessThan(20_000);
  });

  it('하이라이트는 마지막에 그려 타일 위에 덮인다', () => {
    const { ctx, renderer, camera } = setup(8);

    const stats = renderer.render({ x: 3, y: 4 });

    expect(ctx.shapes).toHaveLength(stats.drawnTiles + 1);

    const highlight = ctx.shapes.at(-1)!;
    const world = gridToWorld(3, 4, 0);
    const screen = camera.worldToScreen(world.x, world.y);

    expect(highlight.centerX).toBeCloseTo(screen.x, 6);
    expect(highlight.centerY).toBeCloseTo(screen.y, 6);
    expect(highlight.stroked).toBe(true);
  });

  it('그리드 밖 타일을 하이라이트하라고 해도 무시한다', () => {
    const { ctx, renderer } = setup(8);

    const stats = renderer.render({ x: -1, y: 99 });

    expect(ctx.shapes).toHaveLength(stats.drawnTiles);
  });

  it('마름모 크기는 확대율에 비례한다', () => {
    const { ctx, renderer, camera } = setup(4);

    renderer.render(null);
    const atZoom1 = ctx.shapes[0]!;
    expect(atZoom1.halfWidth).toBeCloseTo(TILE_WIDTH / 2, 6);
    expect(atZoom1.halfHeight).toBeCloseTo(TILE_HEIGHT / 2, 6);

    ctx.shapes.length = 0;
    camera.zoomAt(400, 300, 2);
    renderer.render(null);

    const atZoom2 = ctx.shapes[0]!;
    expect(atZoom2.halfWidth).toBeCloseTo(TILE_WIDTH, 6);
    expect(atZoom2.halfHeight).toBeCloseTo(TILE_HEIGHT, 6);
  });

  it('많이 축소하면 외곽선을 생략한다', () => {
    const { ctx, renderer, camera } = setup(4);

    renderer.render(null);
    expect(ctx.shapes.every((shape) => shape.stroked)).toBe(true);

    ctx.shapes.length = 0;
    camera.zoomAt(400, 300, 0.5);
    renderer.render(null);

    expect(ctx.shapes.every((shape) => !shape.stroked)).toBe(true);
  });

  it('인접 타일은 서로 다른 색으로 그려 격자가 눈에 보인다', () => {
    const { ctx, renderer } = setup(4);

    renderer.render(null);
    const colors = new Set(ctx.shapes.map((shape) => shape.fillStyle));

    expect(colors.size).toBe(2);
  });
});
