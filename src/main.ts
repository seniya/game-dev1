import { BlockStash } from './core/BlockStash';
import { BlockType, isPlaceable } from './core/blocks';
import { gridToWorld } from './core/coordinates';
import { DEFAULT_STEP_MS } from './core/fixedTimestep';
import { pickSurfaceTile } from './core/picking';
import { generateTerrain } from './core/terrainGen';
import { CanvasRenderer } from './render/CanvasRenderer';
import { Camera } from './render/Camera';
import { WorldRenderer } from './render/WorldRenderer';
import type { TileRef } from './render/WorldRenderer';
import { GameLoop } from './sim/GameLoop';
import { GameState } from './sim/GameState';
import { DebugOverlay } from './ui/DebugOverlay';
import { PointerControls } from './ui/PointerControls';
import type { PointerButtonKind } from './ui/PointerControls';

/** Phase 2 확인용 맵 크기(타일). */
const MAP_WIDTH = 32;
const MAP_HEIGHT = 32;

/** 지형 생성 시드. 고정해 두면 실행마다 같은 맵이 나와 확인이 쉽다. */
const TERRAIN_SEED = 20260901;

/**
 * 시작 확대율. 맵 전체가 한눈에 들어오도록 살짝 축소한 상태에서 시작한다 —
 * 컬링과 맵 경계가 실제로 동작하는지 바로 보이게 하려는 의도다.
 */
const INITIAL_ZOOM = 0.7;

/**
 * 쌓기에 쓸 블록의 우선순위. 흙을 먼저 쓰고 없으면 돌을 쓴다.
 * Phase 5에서 인벤토리 슬롯 선택으로 대체된다.
 */
const PLACE_PRIORITY = [BlockType.DIRT, BlockType.STONE] as const;

/**
 * 필수 DOM 엘리먼트를 찾아온다. 없으면 조용히 넘기지 않고 즉시 실패시킨다 —
 * index.html과 코드가 어긋난 상태로 빈 화면을 보는 것이 더 찾기 어렵다.
 *
 * @param id 찾을 엘리먼트 id.
 * @returns 해당 엘리먼트.
 * @throws 엘리먼트가 없으면 예외를 던진다.
 */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`#${id} 엘리먼트를 찾을 수 없다.`);
  }
  return element as T;
}

/** 게임을 초기화하고 루프를 시작한다. */
function bootstrap(): void {
  const canvas = requireElement<HTMLCanvasElement>('game');
  const surface = new CanvasRenderer(canvas);
  const overlay = new DebugOverlay(
    requireElement('fps'),
    requireElement('info'),
    requireElement('stash'),
  );
  const state = new GameState();

  const terrain = generateTerrain(MAP_WIDTH, MAP_HEIGHT, { seed: TERRAIN_SEED });
  const stash = new BlockStash();

  const camera = new Camera();
  camera.setViewport(surface.size.width, surface.size.height);
  const world = new WorldRenderer(surface.context, camera, terrain);

  // 시작 시점에 맵 중앙이 화면 가운데 오도록 카메라를 맞춘다.
  const centerTile = terrain.centerTile;
  const centerWorld = gridToWorld(centerTile.x, centerTile.y, 0);
  camera.lookAt(centerWorld.x, centerWorld.y);
  camera.setZoom(INITIAL_ZOOM);

  // 지형 높이를 아는 피커를 넘겨 언덕 윗면을 정확히 집어내게 한다.
  const controls = new PointerControls(canvas, camera, (worldX, worldY) =>
    pickSurfaceTile(terrain, worldX, worldY),
  );
  controls.setTileClickHandler((tile, button) => handleTileClick(tile, button));
  controls.attach();

  /**
   * 타일 클릭을 지형 조작으로 옮긴다.
   * 주 버튼은 파기, 보조 버튼(오른쪽)은 쌓기다.
   *
   * @param tile 클릭된 타일.
   * @param button 클릭에 쓰인 버튼 종류.
   */
  function handleTileClick(tile: TileRef, button: PointerButtonKind): void {
    if (button === 'primary') {
      const removed = terrain.dig(tile.x, tile.y);
      // 파낸 블록 중 지형에 되놓을 수 있는 것만 손에 남긴다.
      if (removed !== null && isPlaceable(removed)) stash.add(removed);
      return;
    }

    for (const type of PLACE_PRIORITY) {
      if (stash.count(type) === 0) continue;
      if (terrain.place(tile.x, tile.y, type)) stash.take(type);
      return;
    }
  }

  const loop = new GameLoop(
    {
      update: (stepMs) => state.step(stepMs),
      render: (_alpha, frameTimeMs) => {
        const size = surface.beginFrame();
        camera.setViewport(size.width, size.height);

        const hovered = controls.hovered;
        const stats = world.render(hovered);

        overlay.update(
          frameTimeMs,
          {
            hovered,
            hoveredHeight: hovered ? terrain.columnHeight(hovered.x, hovered.y) : 0,
            hoveredSurface: hovered ? terrain.surfaceBlock(hovered.x, hovered.y) : BlockType.EMPTY,
            drawnColumns: stats.drawnColumns,
            drawnWalls: stats.drawnWalls,
            zoom: camera.zoom,
          },
          stash,
        );
      },
    },
    { stepMs: DEFAULT_STEP_MS },
  );

  // 창 크기가 바뀌면 다음 프레임의 beginFrame()이 잡아내므로 별도 리스너는 두지 않는다.
  loop.start();
}

bootstrap();
