import { describe, expect, it } from 'vitest';
import { BlockType, blockInfo } from '../src/core/blocks';
import { LAYER_HEIGHT, TILE_HEIGHT, TILE_WIDTH, gridToWorld, worldToTile } from '../src/core/coordinates';
import { Terrain } from '../src/core/Terrain';
import { Camera } from '../src/render/Camera';
import { WorldRenderer } from '../src/render/WorldRenderer';

/** 가짜 컨텍스트가 기록하는 경로 하나. */
interface RecordedPath {
  /** 경로를 이루는 점들(화면 좌표). */
  points: Array<{ x: number; y: number }>;
  /** 이 경로에 적용된 채우기 색. */
  fillStyle: string;
  /** 이 경로에 선을 그렸는지 여부. */
  stroked: boolean;
}

/**
 * 그리기 호출을 기록하는 최소 Canvas 2D 컨텍스트 대역.
 *
 * 실제 브라우저 없이 "무엇을 몇 개, 어떤 순서로 그렸는지"를 검증하기 위한
 * 것이다. 픽셀 결과가 아니라 렌더러의 판단(컬링·면 생략·정렬)을 확인한다.
 */
class RecordingContext {
  readonly paths: RecordedPath[] = [];

  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;

  private points: Array<{ x: number; y: number }> = [];
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

  /** 배경 클리어용. 도형 기록에는 넣지 않는다. */
  fillRect(): void {}

  /**
   * 현재 경로를 기록에 반영한다. 같은 경로에 fill과 stroke가 모두 오면
   * 기존 기록의 stroked 플래그만 올린다.
   *
   * @param stroked 이번 호출이 stroke인지 여부.
   */
  private commit(stroked: boolean): void {
    if (this.committedIndex !== null) {
      if (stroked) this.paths[this.committedIndex]!.stroked = true;
      return;
    }
    if (this.points.length < 4) return;

    this.paths.push({ points: [...this.points], fillStyle: this.fillStyle, stroked });
    this.committedIndex = this.paths.length - 1;
  }
}

/**
 * 경로가 윗면 마름모인지 판정한다.
 * 마름모는 북·동·남·서 순서라 첫 점과 세 번째 점의 x가 같다.
 *
 * @param path 판정할 경로.
 */
function isDiamond(path: RecordedPath): boolean {
  const [n, e, s, w] = path.points;
  if (!n || !e || !s || !w) return false;
  return n.x === s.x && e.y === w.y && e.x !== w.x;
}

/**
 * 마름모 경로의 중심을 구한다.
 *
 * @param path 마름모 경로.
 */
function diamondCenter(path: RecordedPath): { x: number; y: number } {
  const [n, , s] = path.points as [{ x: number; y: number }, unknown, { x: number; y: number }];
  return { x: n.x, y: (n.y + s.y) / 2 };
}

/**
 * 지형과 렌더러를 준비한다. 카메라는 맵 중앙을 본다.
 *
 * @param terrain 그릴 지형.
 * @param viewport 뷰포트 크기(CSS px).
 */
function setup(terrain: Terrain, viewport = { width: 900, height: 700 }) {
  const ctx = new RecordingContext();
  const camera = new Camera();
  camera.setViewport(viewport.width, viewport.height);

  const center = terrain.centerTile;
  const centerWorld = gridToWorld(center.x, center.y, 0);
  camera.lookAt(centerWorld.x, centerWorld.y);

  const renderer = new WorldRenderer(ctx as unknown as CanvasRenderingContext2D, camera, terrain);

  return { ctx, camera, renderer, terrain };
}

/**
 * 모든 열이 같은 높이인 지형을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 * @param height 각 열의 블록 수.
 * @param type 채울 블록 타입.
 */
function flat(size: number, height: number, type: BlockType = BlockType.DIRT): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, height, type);
  }
  return terrain;
}

describe('WorldRenderer 윗면', () => {
  it('화면에 다 들어오는 지형은 모든 열의 윗면을 정확히 한 번 그린다', () => {
    const { ctx, renderer } = setup(flat(6, 2));

    const stats = renderer.render(null);

    expect(stats.drawnColumns).toBe(36);
    expect(ctx.paths.filter(isDiamond)).toHaveLength(36);
  });

  it('바닥까지 파인 열은 그리지 않고 건너뛴 수로 센다', () => {
    const terrain = flat(6, 1);
    terrain.dig(2, 3);

    const { renderer } = setup(terrain);
    const stats = renderer.render(null);

    expect(stats.drawnColumns).toBe(35);
    expect(stats.skippedColumns).toBeGreaterThan(0);
  });

  it('윗면 색은 표면 블록 타입을 따른다', () => {
    const terrain = flat(3, 3, BlockType.STONE);
    terrain.setBlock(1, 1, 2, BlockType.DIRT);

    const { ctx, camera, renderer } = setup(terrain);
    renderer.render(null);

    const dirtTop = blockInfo(BlockType.DIRT).topColor;
    const stoneTop = blockInfo(BlockType.STONE).topColor;

    const diamonds = ctx.paths.filter(isDiamond);
    expect(diamonds.filter((p) => p.fillStyle === dirtTop)).toHaveLength(1);
    expect(diamonds.filter((p) => p.fillStyle === stoneTop)).toHaveLength(8);

    // 흙 마름모가 실제로 (1,1) 위치에 그려졌는지 확인한다.
    const dirt = diamonds.find((p) => p.fillStyle === dirtTop)!;
    const expected = gridToWorld(1, 1, 2);
    const screen = camera.worldToScreen(expected.x, expected.y);
    expect(diamondCenter(dirt).x).toBeCloseTo(screen.x, 6);
    expect(diamondCenter(dirt).y).toBeCloseTo(screen.y, 6);
  });

  it('윗면 높이는 열의 높이를 따라 올라간다', () => {
    const terrain = flat(3, 1);
    terrain.place(1, 1, BlockType.DIRT);

    const { ctx, renderer } = setup(terrain);
    renderer.render(null);

    const centers = ctx.paths.filter(isDiamond).map(diamondCenter);
    const highest = Math.min(...centers.map((c) => c.y));
    const others = centers.filter((c) => c.y !== highest);

    // 쌓아 올린 열 하나만 한 레이어만큼 위에 있다.
    expect(centers.filter((c) => c.y === highest)).toHaveLength(1);
    expect(Math.min(...others.map((c) => c.y)) - highest).toBeCloseTo(LAYER_HEIGHT, 6);
  });
});

describe('WorldRenderer 측면', () => {
  it('평지 내부에서는 측면을 그리지 않는다', () => {
    const size = 5;
    const height = 2;
    const { renderer } = setup(flat(size, height));

    const stats = renderer.render(null);

    // 맵 경계 밖은 높이 0이라 가장자리 두 변만 벽이 드러난다.
    expect(stats.drawnWalls).toBe(2 * size * height);
  });

  it('이웃보다 높은 만큼만 측면을 그린다', () => {
    const terrain = flat(5, 2);
    const before = setup(terrain).renderer.render(null).drawnWalls;

    // 가운데 열을 한 칸 올리면 +x·+y 두 면에 각각 한 조각이 늘어난다.
    terrain.place(2, 2, BlockType.DIRT);
    const after = setup(terrain).renderer.render(null).drawnWalls;

    expect(after - before).toBe(2);
  });

  it('파서 낮아진 자리는 이웃의 측면을 드러낸다', () => {
    const terrain = flat(5, 3);
    const before = setup(terrain).renderer.render(null).drawnWalls;

    // (2,2)를 한 칸 파면 (1,2)의 +x 면과 (2,1)의 +y 면이 한 조각씩 드러난다.
    terrain.dig(2, 2);
    const after = setup(terrain).renderer.render(null).drawnWalls;

    expect(after - before).toBe(2);
  });

  it('측면은 레이어별로 나눠 각 레이어의 블록 색으로 칠한다', () => {
    const terrain = new Terrain(2, 1);
    terrain.fillColumn(0, 0, 3, BlockType.STONE);
    terrain.setBlock(0, 0, 2, BlockType.DIRT);
    terrain.setBlock(0, 0, 0, BlockType.IRON_ORE);
    terrain.fillColumn(1, 0, 0, BlockType.STONE);

    const { ctx, renderer } = setup(terrain);
    renderer.render(null);

    const walls = ctx.paths.filter((p) => !isDiamond(p));
    const colors = walls.map((p) => p.fillStyle);

    // (0,0)의 +x 면은 이웃 높이가 0이라 3레이어가 모두 드러난다.
    expect(colors).toContain(blockInfo(BlockType.DIRT).sideColorX);
    expect(colors).toContain(blockInfo(BlockType.STONE).sideColorX);
    expect(colors).toContain(blockInfo(BlockType.IRON_ORE).sideColorX);
  });

  it('두 측면은 서로 다른 명도로 칠해 입체감을 만든다', () => {
    const terrain = flat(2, 1);

    const { ctx, renderer } = setup(terrain);
    renderer.render(null);

    const walls = ctx.paths.filter((p) => !isDiamond(p));
    const info = blockInfo(BlockType.DIRT);

    expect(info.sideColorX).not.toBe(info.sideColorY);
    expect(walls.some((p) => p.fillStyle === info.sideColorX)).toBe(true);
    expect(walls.some((p) => p.fillStyle === info.sideColorY)).toBe(true);
  });

  it('측면 조각의 높이는 확대율이 반영된 레이어 높이와 같다', () => {
    const terrain = flat(2, 1);
    const { ctx, camera, renderer } = setup(terrain);
    camera.setZoom(2);

    renderer.render(null);

    const wall = ctx.paths.find((p) => !isDiamond(p))!;
    const [a, , , d] = wall.points as Array<{ x: number; y: number }>;
    expect(d.y - a.y).toBeCloseTo(LAYER_HEIGHT * 2, 6);
  });
});

describe('WorldRenderer 컬링과 순서', () => {
  it('그리기 순서는 x + y 오름차순이다', () => {
    const terrain = flat(6, 2);
    const { ctx, camera, renderer } = setup(terrain);

    renderer.render(null);

    const sums = ctx.paths.filter(isDiamond).map((path) => {
      const center = diamondCenter(path);
      const world = camera.screenToWorld(center.x, center.y);
      // 윗면 중심이므로 그 열의 표면 레이어 평면에서 역변환한다.
      const tile = worldToTile(world.x, world.y, 1);
      return tile.x + tile.y;
    });

    for (let i = 1; i < sums.length; i += 1) {
      expect(sums[i]!).toBeGreaterThanOrEqual(sums[i - 1]!);
    }
  });

  it('맵 밖으로 카메라가 나가면 아무것도 그리지 않는다', () => {
    const { ctx, camera, renderer } = setup(flat(6, 2));
    camera.lookAt(100_000, 100_000);

    const stats = renderer.render(null);

    expect(stats.drawnColumns).toBe(0);
    expect(stats.drawnWalls).toBe(0);
    expect(ctx.paths).toHaveLength(0);
  });

  it('많이 축소해도 훑는 후보 수가 폭발하지 않는다', () => {
    const { camera, renderer } = setup(flat(6, 2));
    for (let i = 0; i < 20; i += 1) camera.zoomAt(450, 350, 0.5);

    const stats = renderer.render(null);

    expect(stats.drawnColumns).toBe(36);
    expect(stats.skippedColumns).toBeLessThan(20_000);
  });

  it('많이 축소하면 외곽선을 생략한다', () => {
    const { ctx, camera, renderer } = setup(flat(4, 1));

    renderer.render(null);
    expect(ctx.paths.filter(isDiamond).every((p) => p.stroked)).toBe(true);

    ctx.paths.length = 0;
    camera.setZoom(0.5);
    renderer.render(null);
    expect(ctx.paths.filter(isDiamond).every((p) => !p.stroked)).toBe(true);
  });
});

describe('WorldRenderer 하이라이트', () => {
  it('하이라이트는 그 열을 그린 직후에 얹는다 — 앞쪽 열이 정상적으로 가린다', () => {
    const terrain = flat(6, 2);
    const { ctx, camera, renderer } = setup(terrain);

    renderer.render({ x: 2, y: 2 });

    const world = gridToWorld(2, 2, 1);
    const screen = camera.worldToScreen(world.x, world.y);

    const highlightIndex = ctx.paths.findIndex(
      (path) =>
        isDiamond(path) &&
        path.fillStyle.startsWith('rgba') &&
        Math.abs(diamondCenter(path).x - screen.x) < 1e-6 &&
        Math.abs(diamondCenter(path).y - screen.y) < 1e-6,
    );
    expect(highlightIndex).toBeGreaterThanOrEqual(0);

    // 하이라이트 뒤에도 경로가 남아 있어야 한다 — 앞쪽 열들이 그 위에 그려진다.
    expect(highlightIndex).toBeLessThan(ctx.paths.length - 1);
  });

  it('앞쪽 열이 하이라이트를 덮는다 — 투시되지 않는다', () => {
    const terrain = flat(6, 1);
    // 커서 대상 앞쪽(x+1, y+1 방향) 열을 최대로 세워 확실히 가리게 만든다.
    for (let i = 1; i < 4; i += 1) terrain.place(3, 3, BlockType.DIRT);

    const { ctx, renderer } = setup(terrain);
    renderer.render({ x: 2, y: 2 });

    const highlightIndex = ctx.paths.findIndex((path) => path.fillStyle.startsWith('rgba'));
    const occluderIndex = ctx.paths.findLastIndex(
      (path) => isDiamond(path) && path.fillStyle === blockInfo(BlockType.DIRT).topColor,
    );

    expect(highlightIndex).toBeGreaterThanOrEqual(0);
    expect(occluderIndex).toBeGreaterThan(highlightIndex);
  });

  it('하이라이트 높이는 그 열의 표면 높이를 따른다', () => {
    const terrain = flat(6, 2);
    terrain.place(3, 4, BlockType.DIRT);
    terrain.place(3, 4, BlockType.DIRT);

    const { ctx, camera, renderer } = setup(terrain);
    renderer.render({ x: 3, y: 4 });

    const world = gridToWorld(3, 4, 3);
    const screen = camera.worldToScreen(world.x, world.y);

    const highlight = ctx.paths.find((path) => path.fillStyle.startsWith('rgba'))!;
    expect(diamondCenter(highlight).x).toBeCloseTo(screen.x, 6);
    expect(diamondCenter(highlight).y).toBeCloseTo(screen.y, 6);
  });

  it('맵 밖이나 빈 열은 하이라이트하지 않는다', () => {
    const terrain = flat(6, 1);
    terrain.dig(1, 1);

    const { ctx, renderer } = setup(terrain);

    renderer.render({ x: -5, y: 0 });
    expect(ctx.paths.some((path) => path.fillStyle.startsWith('rgba'))).toBe(false);

    ctx.paths.length = 0;
    renderer.render({ x: 1, y: 1 });
    expect(ctx.paths.some((path) => path.fillStyle.startsWith('rgba'))).toBe(false);
  });

  it('마름모 크기는 확대율에 비례한다', () => {
    const { ctx, camera, renderer } = setup(flat(3, 1));

    renderer.render(null);
    const atZoom1 = ctx.paths.filter(isDiamond)[0]!;
    const [n1, e1, s1, w1] = atZoom1.points as Array<{ x: number; y: number }>;
    expect(e1.x - w1.x).toBeCloseTo(TILE_WIDTH, 6);
    expect(s1.y - n1.y).toBeCloseTo(TILE_HEIGHT, 6);

    ctx.paths.length = 0;
    camera.setZoom(2);
    renderer.render(null);

    const atZoom2 = ctx.paths.filter(isDiamond)[0]!;
    const [n2, e2, s2, w2] = atZoom2.points as Array<{ x: number; y: number }>;
    expect(e2.x - w2.x).toBeCloseTo(TILE_WIDTH * 2, 6);
    expect(s2.y - n2.y).toBeCloseTo(TILE_HEIGHT * 2, 6);
  });
});
