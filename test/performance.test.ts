import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { gridToWorld } from '../src/core/coordinates';
import { Terrain } from '../src/core/Terrain';
import { Camera } from '../src/render/Camera';
import { WorldRenderer, type Entity } from '../src/render/WorldRenderer';

/**
 * 아무것도 하지 않는 Canvas 2D 대역.
 *
 * 실제 래스터라이즈 비용은 브라우저 몫이므로, 여기서는 **렌더러 자신의 일**
 * (컬링·순회·정렬)만 잰다. 맵이 커질 때 늘어나는 것이 그 부분이기 때문이다.
 */
class NullContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalAlpha = 1;

  /** 경로를 시작한다. */
  beginPath(): void {}
  /** 시작점을 옮긴다. */
  moveTo(): void {}
  /** 선분을 잇는다. */
  lineTo(): void {}
  /** 경로를 닫는다. */
  closePath(): void {}
  /** 채운다. */
  fill(): void {}
  /** 선을 그린다. */
  stroke(): void {}
  /** 사각형을 채운다. */
  fillRect(): void {}
  /** 타원을 그린다. */
  ellipse(): void {}
  /** 원호를 그린다. */
  arc(): void {}
}

/**
 * 기복이 있는 지형을 만든다. 측면 벽이 생겨 렌더 비용이 실제와 가까워진다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function bumpyTerrain(size: number): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const height = 2 + ((x * 7 + y * 13) % 3);
      terrain.fillColumn(x, y, height, BlockType.DIRT);
    }
  }
  return terrain;
}

/**
 * 렌더러를 준비한다. 카메라는 맵 중앙을 본다.
 *
 * @param terrain 지형.
 * @param zoom 확대율.
 */
function setup(terrain: Terrain, zoom = 1) {
  const ctx = new NullContext();
  const camera = new Camera();
  camera.setViewport(1280, 720);
  camera.setZoom(zoom);

  const center = terrain.centerTile;
  const world = gridToWorld(center.x, center.y, 0);
  camera.lookAt(world.x, world.y);

  return {
    camera,
    renderer: new WorldRenderer(ctx as unknown as CanvasRenderingContext2D, camera, terrain),
  };
}

/**
 * 렌더를 여러 번 돌려 프레임당 평균 시간을 잰다.
 *
 * @param render 한 프레임을 그리는 함수.
 * @param frames 프레임 수.
 * @returns 프레임당 평균 시간(ms).
 */
function measure(render: () => void, frames: number): number {
  // 첫 몇 프레임은 JIT 예열이므로 버린다.
  for (let i = 0; i < 10; i += 1) render();

  const start = performance.now();
  for (let i = 0; i < frames; i += 1) render();

  return (performance.now() - start) / frames;
}

describe('렌더 성능', () => {
  it('맵이 16배 커져도 그리는 타일 수는 그대로다 — 컬링이 뷰포트에만 비례한다', () => {
    const small = setup(bumpyTerrain(32));
    const large = setup(bumpyTerrain(128));

    const smallStats = small.renderer.render(null);
    const largeStats = large.renderer.render(null);

    // 작은 맵은 화면보다 작아 전부 그리고, 큰 맵은 화면에 들어오는 만큼만 그린다.
    expect(smallStats.drawnColumns).toBeLessThanOrEqual(32 * 32);
    expect(largeStats.drawnColumns).toBeLessThan(32 * 32 * 4);
  });

  it('맵이 커져도 프레임 시간이 비례해 늘지 않는다', () => {
    const small = setup(bumpyTerrain(32));
    const large = setup(bumpyTerrain(128));

    const smallMs = measure(() => small.renderer.render(null), 60);
    const largeMs = measure(() => large.renderer.render(null), 60);

    // 맵은 16배지만 프레임 시간은 몇 배 안에 머물러야 한다.
    expect(largeMs).toBeLessThan(smallMs * 6 + 1);
  });

  it('화면을 가득 채운 지형을 60fps 예산 안에 그린다', () => {
    const { renderer } = setup(bumpyTerrain(96));

    const frameMs = measure(() => renderer.render(null), 120);

    // 16.7ms 예산 중 렌더러 자신의 몫은 넉넉히 남아야 한다.
    expect(frameMs).toBeLessThan(8);
  });

  it('오브젝트가 수백 개여도 프레임 예산을 넘지 않는다', () => {
    const terrain = bumpyTerrain(64);
    const { renderer } = setup(terrain);

    const entities: Entity[] = [];
    for (let i = 0; i < 400; i += 1) {
      const x = i % 64;
      const y = Math.floor(i / 64) * 3;
      entities.push({ kind: 'tree', x, y, z: terrain.columnHeight(x, y) - 1, damage: 0 });
    }
    entities.push({ kind: 'player', x: 32, y: 32, z: 2, swing: 0 });

    const frameMs = measure(() => renderer.render({ x: 32, y: 32 }, entities), 60);

    expect(frameMs).toBeLessThan(10);
  });

  it('많이 축소해도 프레임 예산 안에 그린다', () => {
    const { renderer } = setup(bumpyTerrain(128), 0.4);

    const frameMs = measure(() => renderer.render(null), 60);

    expect(frameMs).toBeLessThan(12);
  });
});
