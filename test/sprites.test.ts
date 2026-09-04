import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { TILE_HEIGHT, TILE_WIDTH, gridToWorld } from '../src/core/coordinates';
import { Terrain } from '../src/core/Terrain';
import { Camera } from '../src/render/Camera';
import { createSpriteSet, type Sprite, type SpriteSet } from '../src/render/sprites';
import { WorldRenderer, type Entity } from '../src/render/WorldRenderer';

/** drawImage 호출을 기록하는 최소 컨텍스트 대역. */
class ImageRecordingContext {
  readonly images: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
  /** 도형 채우기 횟수. 스프라이트 경로에서 도형을 그리지 않는지 확인한다. */
  fills = 0;

  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalAlpha = 1;

  /** 상태 저장. 플레이어 위치 고리의 투명도를 격리할 때 쓴다. */
  save(): void {}
  /** 상태 복원. 플레이어 위치 고리 뒤에 다른 오브젝트가 영향을 받지 않게 한다. */
  restore(): void {}

  /** 경로를 시작한다. */
  beginPath(): void {}
  /** 시작점을 옮긴다. */
  moveTo(): void {}
  /** 선분을 잇는다. */
  lineTo(): void {}
  /** 경로를 닫는다. */
  closePath(): void {}
  /** 채운다. */
  fill(): void {
    this.fills += 1;
  }
  /** 선을 그린다. */
  stroke(): void {}
  /** 사각형을 채운다. */
  fillRect(): void {}
  /** 타원을 그린다. */
  ellipse(): void {}
  /** 원호를 그린다. */
  arc(): void {}

  /**
   * 이미지를 그린다.
   *
   * @param image 이미지.
   * @param x 목적지 x.
   * @param y 목적지 y.
   * @param w 목적지 폭.
   * @param h 목적지 높이.
   */
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void {
    this.images.push({ id: (image as { id: string }).id, x, y, w, h });
  }
}

/**
 * 식별 가능한 가짜 스프라이트를 만든다.
 *
 * @param id 식별자.
 * @param width 논리 폭.
 * @param height 논리 높이.
 * @param offsetX 기준점 오프셋 x.
 * @param offsetY 기준점 오프셋 y.
 */
function fakeSprite(id: string, width = 10, height = 10, offsetX = 0, offsetY = 0): Sprite {
  return { image: { id } as unknown as CanvasImageSource, width, height, offsetX, offsetY };
}

/** 모든 요청에 식별 가능한 스프라이트를 돌려주는 대역. */
function fakeSpriteSet(): SpriteSet {
  return {
    top: (block) => fakeSprite(`top:${block}`, TILE_WIDTH, TILE_HEIGHT, -TILE_WIDTH / 2, -TILE_HEIGHT / 2),
    sideX: (block) => fakeSprite(`sx:${block}`),
    sideY: (block) => fakeSprite(`sy:${block}`),
    tree: (stage) => fakeSprite(`tree:${stage}`),
    oreVein: (ore, stage) => fakeSprite(`ore:${ore}:${stage}`),
    building: (style, width, depth) => fakeSprite(`b:${style}:${width}x${depth}`),
    pawn: (hue, stride = 0, facing = 'south') => fakeSprite(`pawn:${hue}:${stride}:${facing}`),
  };
}

/**
 * 평지 지형과 렌더러를 준비한다.
 *
 * @param size 정사각 맵의 한 변 길이.
 * @param height 각 열의 블록 수.
 */
function setup(size = 4, height = 2) {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, height, BlockType.DIRT);
  }

  const ctx = new ImageRecordingContext();
  const camera = new Camera();
  camera.setViewport(800, 600);
  const center = terrain.centerTile;
  const world = gridToWorld(center.x, center.y, 0);
  camera.lookAt(world.x, world.y);

  const renderer = new WorldRenderer(ctx as unknown as CanvasRenderingContext2D, camera, terrain);

  return { ctx, camera, terrain, renderer };
}

describe('createSpriteSet', () => {
  it('캔버스를 만들 수 없는 환경에서는 null이다 — 도형 폴백이 도는 조건', () => {
    // node 테스트에는 OffscreenCanvas도 document도 없다.
    expect(createSpriteSet()).toBeNull();
  });
});

describe('WorldRenderer 스프라이트 전환', () => {
  it('기본은 도형이고, 붙이면 스프라이트로 바뀐다', () => {
    const { renderer } = setup();

    expect(renderer.usingSprites).toBe(false);

    renderer.setSprites(fakeSpriteSet());
    expect(renderer.usingSprites).toBe(true);

    renderer.setSprites(null);
    expect(renderer.usingSprites).toBe(false);
  });

  it('스프라이트가 있으면 윗면을 이미지로 그린다', () => {
    const { ctx, renderer } = setup(4, 2);
    renderer.setSprites(fakeSpriteSet());

    const stats = renderer.render(null);

    expect(stats.drawnColumns).toBe(16);
    expect(ctx.images.filter((image) => image.id.startsWith('top:'))).toHaveLength(16);
  });

  it('스프라이트 경로에서는 윗면 도형을 그리지 않는다', () => {
    const { ctx, renderer } = setup(4, 2);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null);

    // 하이라이트나 미리보기가 없으므로 도형 채우기가 없어야 한다.
    expect(ctx.fills).toBe(0);
  });

  it('윗면 이미지는 기준점에 맞춰 놓인다', () => {
    const { ctx, camera, renderer } = setup(4, 2);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null);

    const world = gridToWorld(0, 0, 1);
    const screen = camera.worldToScreen(world.x, world.y);
    const drawn = ctx.images.find(
      (image) => image.id.startsWith('top:') && Math.abs(image.x - (screen.x - TILE_WIDTH / 2)) < 1e-6,
    );

    expect(drawn).toBeDefined();
    expect(drawn!.y).toBeCloseTo(screen.y - TILE_HEIGHT / 2, 6);
    expect(drawn!.w).toBeCloseTo(TILE_WIDTH, 6);
  });

  it('확대율이 이미지 크기에 반영된다', () => {
    const { ctx, camera, renderer } = setup(3, 1);
    renderer.setSprites(fakeSpriteSet());
    camera.setZoom(2);

    renderer.render(null);

    expect(ctx.images[0]!.w).toBeCloseTo(TILE_WIDTH * 2, 6);
    expect(ctx.images[0]!.h).toBeCloseTo(TILE_HEIGHT * 2, 6);
  });

  it('블록 타입마다 다른 스프라이트를 쓴다', () => {
    const { ctx, terrain, renderer } = setup(3, 2);
    terrain.setBlock(1, 1, 1, BlockType.STONE);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null);

    const ids = new Set(ctx.images.filter((image) => image.id.startsWith('top:')).map((i) => i.id));
    expect(ids.size).toBe(2);
  });

  it('측면도 스프라이트로 그린다', () => {
    const { ctx, renderer } = setup(3, 2);
    renderer.setSprites(fakeSpriteSet());

    const stats = renderer.render(null);

    expect(stats.drawnWalls).toBeGreaterThan(0);
    expect(ctx.images.filter((image) => image.id.startsWith('sx:')).length).toBeGreaterThan(0);
    expect(ctx.images.filter((image) => image.id.startsWith('sy:')).length).toBeGreaterThan(0);
  });
});

describe('WorldRenderer 오브젝트 스프라이트', () => {
  it('종류마다 맞는 스프라이트를 고른다', () => {
    const { ctx, renderer } = setup(6, 1);
    renderer.setSprites(fakeSpriteSet());

    const entities: Entity[] = [
      { kind: 'player', x: 1, y: 1, z: 0, swing: 0 },
      { kind: 'npc', x: 2, y: 1, z: 0, hue: 200 },
      { kind: 'tree', x: 3, y: 1, z: 0, damage: 0 },
      { kind: 'oreVein', x: 4, y: 1, z: 0, damage: 0, ore: 'iron' },
      { kind: 'building', x: 1, y: 3, z: 0, width: 2, depth: 2, style: 'house', progress: 1 },
    ];

    renderer.render(null, entities);

    const ids = ctx.images.map((image) => image.id);
    expect(ids).toContain('pawn:-1:0:south');
    expect(ids).toContain('pawn:200:0:south');
    expect(ids).toContain('tree:0');
    expect(ids).toContain('ore:iron:0');
    expect(ids).toContain('b:house:2x2');
  });

  it('광맥 세 종류가 서로 다른 스프라이트를 쓴다 — 수정이 돌과 같으면 갈 이유가 안 보인다', () => {
    const { ctx, renderer } = setup(8, 1);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null, [
      { kind: 'oreVein', x: 1, y: 1, z: 0, damage: 0, ore: 'iron' },
      { kind: 'oreVein', x: 3, y: 1, z: 0, damage: 0, ore: 'stone' },
      { kind: 'oreVein', x: 5, y: 1, z: 0, damage: 0, ore: 'crystal' },
    ]);

    const ids = ctx.images.map((image) => image.id);
    expect(ids).toContain('ore:iron:0');
    expect(ids).toContain('ore:stone:0');
    expect(ids).toContain('ore:crystal:0');
  });

  it('손상도가 단계로 바뀐다', () => {
    const { ctx, renderer } = setup(6, 1);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null, [
      { kind: 'tree', x: 1, y: 1, z: 0, damage: 0 },
      { kind: 'tree', x: 2, y: 2, z: 0, damage: 0.5 },
      { kind: 'tree', x: 3, y: 3, z: 0, damage: 1 },
    ]);

    const stages = ctx.images.filter((image) => image.id.startsWith('tree:')).map((i) => i.id);
    expect(new Set(stages).size).toBe(3);
  });

  it('건축 중인 건물은 스프라이트가 아니라 연출 도형으로 그린다', () => {
    const { ctx, renderer } = setup(6, 1);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null, [
      { kind: 'building', x: 1, y: 1, z: 0, width: 1, depth: 1, style: 'well', progress: 0.4 },
    ]);

    expect(ctx.images.some((image) => image.id.startsWith('b:'))).toBe(false);
    // 진행도에 따라 매 프레임 달라지는 그림이라 캐시 대상이 아니다.
    expect(ctx.fills).toBeGreaterThan(0);
  });

  it('휘두르는 동작은 스프라이트 위에 덧그린다', () => {
    const { ctx, renderer } = setup(6, 1);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null, [{ kind: 'player', x: 1, y: 1, z: 0, swing: 0.5 }]);

    expect(ctx.images.some((image) => image.id === 'pawn:-1:0:south')).toBe(true);
  });

  it('걷는 캐릭터는 진행도와 방향이 담긴 스프라이트를 고른다', () => {
    const { ctx, renderer } = setup(6, 1);
    renderer.setSprites(fakeSpriteSet());

    renderer.render(null, [{ kind: 'player', x: 1, y: 1, z: 0, swing: 0, stride: 0.5, facing: 'west' }]);

    expect(ctx.images.some((image) => image.id === 'pawn:-1:0.5:west')).toBe(true);
  });
});
