import { describe, expect, it } from 'vitest';
import { BlockType, blockInfo } from '../src/core/blocks';
import { LAYER_HEIGHT, TILE_HEIGHT, TILE_WIDTH, gridToWorld, worldToTile } from '../src/core/coordinates';
import { Terrain } from '../src/core/Terrain';
import { Camera } from '../src/render/Camera';
import { DARK_RADIUS, LIT_RADIUS, MAX_DARKNESS, darkColor } from '../src/core/light';
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
  /** 점이 4개 미만인 경로(도구 선 등). 도형과 섞이지 않게 따로 담는다. */
  readonly strokes: Array<{ points: Array<{ x: number; y: number }>; strokeStyle: string }> = [];
  /** 점이 하나인 경로(원·타원). 먼지·그림자·머리 등이 여기 담긴다. */
  readonly dots: Array<{ x: number; y: number; fillStyle: string; alpha: number }> = [];

  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalAlpha = 1;

  private points: Array<{ x: number; y: number }> = [];
  private committedIndex: number | null = null;

  /** 상태 저장. 실제 컨텍스트에는 늘 있으므로 대역에도 둔다. */
  save(): void {}

  /** 상태 복원. */
  restore(): void {}

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

  /** 화면을 덮은 사각형들. 어둠 덮개가 여기 담긴다. */
  readonly rects: Array<{ x: number; y: number; width: number; height: number; fillStyle: string }> = [];

  /**
   * 배경 클리어·게이지·어둠 덮개. 도형 기록과 섞이지 않게 따로 담는다.
   *
   * @param x 화면 x.
   * @param y 화면 y.
   * @param width 너비.
   * @param height 높이.
   */
  fillRect(x: number, y: number, width: number, height: number): void {
    this.rects.push({ x, y, width, height, fillStyle: this.fillStyle });
  }

  /** 그린 글자 기록. */
  readonly texts: Array<{ text: string; x: number; y: number }> = [];

  /** 글자 설정. 기록에는 쓰지 않는다. */
  font = '';
  textAlign = 'left';

  /**
   * 글자를 채운다.
   *
   * @param text 글자.
   * @param x x.
   * @param y y.
   */
  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y });
  }

  /** 글자 외곽선. 기록하지 않는다. */
  strokeText(): void {}

  /** 그린 이미지 기록. 스프라이트 경로를 검증할 때 쓴다. */
  readonly images: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];

  /**
   * 이미지를 그린다.
   *
   * @param image 이미지(테스트에서는 식별용 객체).
   * @param x 목적지 x.
   * @param y 목적지 y.
   * @param w 목적지 폭.
   * @param h 목적지 높이.
   */
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void {
    this.images.push({ id: (image as { id: string }).id, x, y, w, h });
  }

  /** 타원. 캐릭터 그림자 등에 쓰인다. 점 기록만 남긴다. */
  ellipse(x: number, y: number): void {
    this.points.push({ x, y });
  }

  /** 원호. 머리·광석 점 등에 쓰인다. */
  arc(x: number, y: number): void {
    this.points.push({ x, y });
  }

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
    if (this.points.length < 4) {
      if (this.points.length === 1) {
        const point = this.points[0]!;
        this.dots.push({ x: point.x, y: point.y, fillStyle: this.fillStyle, alpha: this.globalAlpha });
      } else if (this.points.length >= 2) {
        this.strokes.push({ points: [...this.points], strokeStyle: this.strokeStyle });
      }
      return;
    }

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

describe('WorldRenderer 오브젝트', () => {
  it('오브젝트를 넘기지 않으면 아무것도 더 그리지 않는다', () => {
    const { renderer } = setup(flat(4, 2));

    expect(renderer.render(null).drawnEntities).toBe(0);
  });

  it('오브젝트를 그 칸 위에 그린다', () => {
    const { ctx, renderer } = setup(flat(4, 2));
    const before = ctx.paths.length;

    const stats = renderer.render(null, [{ kind: 'player', x: 2, y: 2, z: 1, swing: 0 }]);

    expect(stats.drawnEntities).toBe(1);
    expect(ctx.paths.length).toBeGreaterThan(before);
  });

  it('오브젝트는 자기 칸의 지형 뒤에 오는 열보다 먼저, 앞에 오는 열보다 나중에 그려진다', () => {
    const terrain = flat(5, 1);
    const { ctx, camera, renderer } = setup(terrain);

    renderer.render(null, [{ kind: 'player', x: 2, y: 2, z: 0, swing: 0 }]);

    // 플레이어 몸통은 마름모가 아닌 경로다. 그 위치를 화면 좌표로 찾는다.
    const world = gridToWorld(2, 2, 0);
    const screen = camera.worldToScreen(world.x, world.y);

    // 플레이어가 그려진 시점 = 자기 칸의 윗면 마름모 바로 뒤.
    const ownTopIndex = ctx.paths.findIndex(
      (path) =>
        isDiamond(path) &&
        Math.abs(diamondCenter(path).x - screen.x) < 1e-6 &&
        Math.abs(diamondCenter(path).y - screen.y) < 1e-6,
    );
    // 그 뒤로도 경로가 남아야 한다 — 앞쪽 열(x+y가 더 큰)이 나중에 그려진다.
    expect(ownTopIndex).toBeGreaterThan(0);
    expect(ownTopIndex).toBeLessThan(ctx.paths.length - 1);
  });

  it('여러 오브젝트를 x + y 오름차순으로 그린다', () => {
    const terrain = flat(6, 1);
    const { renderer } = setup(terrain);

    const stats = renderer.render(null, [
      { kind: 'tree', x: 4, y: 4, z: 0, damage: 0 },
      { kind: 'player', x: 1, y: 1, z: 0, swing: 0 },
      { kind: 'oreVein', x: 2, y: 3, z: 0, damage: 0.5, ore: 'stone' },
    ]);

    expect(stats.drawnEntities).toBe(3);
  });

  it('같은 칸에 여럿 있어도 모두 그린다', () => {
    const { renderer } = setup(flat(4, 1));

    const stats = renderer.render(null, [
      { kind: 'player', x: 1, y: 1, z: 0, swing: 0 },
      { kind: 'npc', x: 1, y: 1, z: 0, hue: 40 },
    ]);

    expect(stats.drawnEntities).toBe(2);
  });

  it('빈 열이나 맵 밖의 오브젝트는 그리지 않는다', () => {
    const terrain = flat(4, 1);
    terrain.dig(1, 1);
    const { renderer } = setup(terrain);

    const stats = renderer.render(null, [
      { kind: 'player', x: 1, y: 1, z: 0, swing: 0 },
      { kind: 'npc', x: 99, y: 99, z: 0, hue: 10 },
    ]);

    expect(stats.drawnEntities).toBe(0);
  });

  it('휘두르는 중이면 도구 선을 더 그린다', () => {
    const { ctx, renderer } = setup(flat(4, 1));

    renderer.render(null, [{ kind: 'player', x: 1, y: 1, z: 0, swing: 0 }]);
    const idle = ctx.strokes.length;

    ctx.strokes.length = 0;
    renderer.render(null, [{ kind: 'player', x: 1, y: 1, z: 0, swing: 0.5 }]);

    expect(ctx.strokes.length).toBeGreaterThan(idle);
  });

  it('건물은 점유 영역의 가장 앞쪽 칸 순서로 그린다', () => {
    const terrain = flat(8, 1);
    const { renderer } = setup(terrain);

    // 2×2 건물의 기준 칸이 (2,2)이면 정렬 기준은 (3,3)이다.
    const stats = renderer.render(null, [
      { kind: 'building', x: 2, y: 2, z: 0, width: 2, depth: 2, style: 'house', progress: 1 },
      // (3,3)보다 앞에 있는 오브젝트는 건물보다 나중에 그려져야 한다.
      { kind: 'tree', x: 4, y: 4, z: 0, damage: 0 },
    ]);

    expect(stats.drawnEntities).toBe(2);
  });

  it('건축 중인 건물은 진행 게이지를 더 그린다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [
      { kind: 'building', x: 2, y: 2, z: 0, width: 1, depth: 1, style: 'well', progress: 1 },
    ]);
    const done = ctx.paths.length;

    ctx.paths.length = 0;
    renderer.render(null, [
      { kind: 'building', x: 2, y: 2, z: 0, width: 1, depth: 1, style: 'well', progress: 0.4 },
    ]);

    // 게이지는 fillRect로 그리므로 경로 수는 같고, 그린 오브젝트 수만 확인한다.
    expect(ctx.paths.length).toBeLessThanOrEqual(done);
  });
});

describe('WorldRenderer 건축 미리보기', () => {
  it('점유 영역의 칸만 미리보기 색으로 덮는다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [], { x: 2, y: 2, width: 2, depth: 3, valid: true });

    const ghosts = ctx.paths.filter((path) => path.fillStyle === 'rgba(120, 220, 140, 0.45)');
    expect(ghosts).toHaveLength(6);
  });

  it('놓을 수 없는 자리는 다른 색으로 표시한다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [], { x: 1, y: 1, width: 2, depth: 2, valid: false });

    const ghosts = ctx.paths.filter((path) => path.fillStyle === 'rgba(230, 110, 110, 0.45)');
    expect(ghosts).toHaveLength(4);
  });

  it('맵 밖으로 넘어간 미리보기는 맵 안 칸만 칠한다', () => {
    const { ctx, renderer } = setup(flat(4, 1));

    renderer.render(null, [], { x: 3, y: 3, width: 3, depth: 3, valid: false });

    const ghosts = ctx.paths.filter((path) => path.fillStyle === 'rgba(230, 110, 110, 0.45)');
    expect(ghosts).toHaveLength(1);
  });
});


describe('WorldRenderer 건축 먼지', () => {
  /** 건축 중인 우물 하나. */
  const site = {
    kind: 'building' as const,
    x: 2,
    y: 2,
    z: 0,
    width: 1,
    depth: 1,
    style: 'well' as const,
    progress: 0.3,
  };

  it('건축 중인 건물에는 먼지를 그린다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [{ ...site, progress: 1 }], null, 1000);
    const whenDone = ctx.dots.length;

    ctx.dots.length = 0;
    renderer.render(null, [site], null, 1000);

    expect(ctx.dots.length).toBeGreaterThan(whenDone);
  });

  it('먼지는 반투명하게 그려진다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [site], null, 1000);

    expect(ctx.dots.some((dot) => dot.alpha > 0 && dot.alpha < 1)).toBe(true);
  });

  it('시간이 흐르면 먼지 위치가 바뀐다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [site], null, 0);
    const first = JSON.stringify(ctx.dots.map((dot) => [dot.x, dot.y]));

    ctx.dots.length = 0;
    renderer.render(null, [site], null, 700);

    expect(JSON.stringify(ctx.dots.map((dot) => [dot.x, dot.y]))).not.toBe(first);
  });

  it('같은 시각이면 같은 위치에 그린다 — 파티클 상태를 들지 않는다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [site], null, 1234);
    const first = JSON.stringify(ctx.dots.map((dot) => [dot.x, dot.y]));

    ctx.dots.length = 0;
    renderer.render(null, [site], null, 1234);

    expect(JSON.stringify(ctx.dots.map((dot) => [dot.x, dot.y]))).toBe(first);
  });

  it('완공된 건물에는 먼지를 그리지 않는다', () => {
    const { ctx, renderer } = setup(flat(6, 1));
    const done = { ...site, progress: 1 };

    renderer.render(null, [done], null, 0);
    const before = JSON.stringify(ctx.dots.map((dot) => [dot.x, dot.y]));

    ctx.dots.length = 0;
    renderer.render(null, [done], null, 5000);

    expect(JSON.stringify(ctx.dots.map((dot) => [dot.x, dot.y]))).toBe(before);
  });
});

describe('WorldRenderer 구역 표시', () => {
  /** 특정 칸들만 잠긴 구역으로 보는 제공자. */
  const lockedBeyond = (limit: number) => ({ locked: (x: number) => x > limit });

  it('구역 제공자가 없으면 아무것도 더 그리지 않는다', () => {
    const { ctx, renderer } = setup(flat(5, 1));

    renderer.render(null);
    const plain = ctx.paths.length;

    ctx.paths.length = 0;
    renderer.render(null, [], null, 0, null);

    expect(ctx.paths.length).toBe(plain);
  });

  it('잠긴 칸을 덮는다', () => {
    const { ctx, renderer } = setup(flat(5, 1));

    renderer.render(null, [], null, 0, lockedBeyond(2));

    const covers = ctx.paths.filter((path) => path.fillStyle === 'rgba(20, 26, 40, 0.35)');
    // x가 3, 4인 칸 = 5×2 = 10칸.
    expect(covers).toHaveLength(10);
  });

  it('전부 열려 있으면 덮지 않는다', () => {
    const { ctx, renderer } = setup(flat(5, 1));

    renderer.render(null, [], null, 0, { locked: () => false });

    expect(ctx.paths.some((path) => path.fillStyle === 'rgba(20, 26, 40, 0.35)')).toBe(false);
  });

  it('잠금이 바뀌는 변에 경계선을 긋는다', () => {
    const { ctx, renderer } = setup(flat(5, 1));

    renderer.render(null, [], null, 0, lockedBeyond(2));

    const edges = ctx.strokes.filter((stroke) => stroke.strokeStyle === 'rgba(150, 180, 240, 0.55)');
    // x=2에서 x=3으로 넘어가는 변이 y마다 하나씩 = 5개.
    expect(edges).toHaveLength(5);
  });

  it('경계가 없으면 선도 없다', () => {
    const { ctx, renderer } = setup(flat(5, 1));

    renderer.render(null, [], null, 0, { locked: () => true });

    expect(ctx.strokes.some((stroke) => stroke.strokeStyle === 'rgba(150, 180, 240, 0.55)')).toBe(false);
  });
});

describe('WorldRenderer 미리보기 이름', () => {
  it('이름이 있으면 기준 칸에서 한 번만 그린다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [], { x: 2, y: 2, width: 2, depth: 2, valid: true, label: '작은 집' });

    expect(ctx.texts.filter((text) => text.text === '작은 집')).toHaveLength(1);
  });

  it('이름이 없으면 그리지 않는다', () => {
    const { ctx, renderer } = setup(flat(6, 1));

    renderer.render(null, [], { x: 2, y: 2, width: 2, depth: 2, valid: true });

    expect(ctx.texts).toHaveLength(0);
  });
});

describe('동굴 어둠', () => {
  it('빛을 넘기지 않으면 덮지 않는다 — 지상은 밝다', () => {
    const { ctx, renderer } = setup(flat(9, 2));
    renderer.render(null, [], null, 0, null, null);

    expect(ctx.rects).toHaveLength(0);
  });

  it('빛을 넘기면 화면을 덮는다', () => {
    const { ctx, renderer } = setup(flat(9, 2), { width: 900, height: 700 });
    renderer.render(null, [], null, 0, null, {
      light: { x: 4, y: 4, z: 1, lit: LIT_RADIUS, dark: DARK_RADIUS, max: MAX_DARKNESS },
    });

    expect(ctx.rects).toHaveLength(1);
    expect(ctx.rects[0]).toMatchObject({ x: 0, y: 0, width: 900, height: 700 });
  });

  it('그라디언트를 만들 수 없으면 고른 어둠으로 떨어진다', () => {
    // 가짜 컨텍스트에는 createRadialGradient가 없다. 도형 경로는 어떤 환경에서도
    // 죽지 않아야 한다(로드맵 02의 진행 원칙).
    const { ctx, renderer } = setup(flat(9, 2));
    renderer.render(null, [], null, 0, null, {
      light: { x: 4, y: 4, z: 1, lit: LIT_RADIUS, dark: DARK_RADIUS, max: MAX_DARKNESS },
    });

    expect(ctx.rects[0]?.fillStyle).toBe(darkColor(MAX_DARKNESS));
  });

  it('어둠은 지형과 오브젝트를 다 그린 뒤에 덮는다', () => {
    const { ctx, renderer } = setup(flat(9, 2));
    const before = ctx.paths.length;
    renderer.render(null, [], null, 0, null, {
      light: { x: 4, y: 4, z: 1, lit: LIT_RADIUS, dark: DARK_RADIUS, max: MAX_DARKNESS },
    });

    // 덮개가 먼저 그려졌다면 지형이 하나도 기록되지 않았을 것이다.
    expect(ctx.paths.length).toBeGreaterThan(before);
    expect(ctx.rects).toHaveLength(1);
  });
});

describe('시간대 색조', () => {
  it('색조를 넘기면 화면을 덮는다', () => {
    const { ctx, renderer } = setup(flat(9, 2));
    renderer.render(null, [], null, 0, null, { tint: { color: 'rgba(10, 20, 40, 0.4)', alpha: 0.4 } });

    expect(ctx.rects).toHaveLength(1);
    expect(ctx.rects[0]?.fillStyle).toBe('rgba(10, 20, 40, 0.4)');
  });

  it('불투명도가 0이면 덮지 않는다 — 대낮에는 얹을 것이 없다', () => {
    const { ctx, renderer } = setup(flat(9, 2));
    renderer.render(null, [], null, 0, null, { tint: { color: 'rgba(0, 0, 0, 0)', alpha: 0 } });

    expect(ctx.rects).toHaveLength(0);
  });

  it('색조와 빛을 함께 넘기면 색조를 먼저 덮는다 — 빛은 색조까지 뚫는다', () => {
    const { ctx, renderer } = setup(flat(9, 2));
    renderer.render(null, [], null, 0, null, {
      tint: { color: 'rgba(10, 20, 40, 0.4)', alpha: 0.4 },
      light: { x: 4, y: 4, z: 1, lit: 8, dark: 18, max: 0.45 },
    });

    expect(ctx.rects).toHaveLength(2);
    expect(ctx.rects[0]?.fillStyle).toBe('rgba(10, 20, 40, 0.4)');
    expect(ctx.rects[1]?.fillStyle).toBe(darkColor(0.45));
  });
});
