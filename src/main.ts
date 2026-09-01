import { gridToWorld } from './core/coordinates';
import { DEFAULT_STEP_MS } from './core/fixedTimestep';
import { pickSurfaceTile } from './core/picking';
import { generateTerrain } from './core/terrainGen';
import { BlockType } from './core/blocks';
import { CanvasRenderer } from './render/CanvasRenderer';
import { Camera } from './render/Camera';
import { WorldRenderer } from './render/WorldRenderer';
import { GameLoop } from './sim/GameLoop';
import { GameState } from './sim/GameState';
import { Game } from './sim/Game';
import { DebugOverlay } from './ui/DebugOverlay';
import { KeyboardControls } from './ui/KeyboardControls';
import { PointerControls } from './ui/PointerControls';

/** 맵 크기(타일). */
const MAP_WIDTH = 32;
const MAP_HEIGHT = 32;

/** 지형 생성 시드. 고정해 두면 실행마다 같은 맵이 나와 확인이 쉽다. */
const TERRAIN_SEED = 20260901;

/** 시작 확대율. */
const INITIAL_ZOOM = 1;

/**
 * 카메라가 한 스텝에 플레이어 쪽으로 좁히는 거리 비율.
 * 값이 크면 딱딱하게 따라붙고, 작으면 뒤늦게 끌려온다.
 */
const CAMERA_FOLLOW_FACTOR = 0.12;

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
  const game = new Game(terrain);

  const camera = new Camera();
  camera.setViewport(surface.size.width, surface.size.height);
  camera.setZoom(INITIAL_ZOOM);
  const world = new WorldRenderer(surface.context, camera, terrain);

  // 시작 시점에 플레이어가 화면 가운데 오도록 카메라를 맞춘다.
  const start = game.player.position;
  const startWorld = gridToWorld(start.x, start.y, 0);
  camera.lookAt(startWorld.x, startWorld.y);

  // 지형 높이를 아는 피커를 넘겨 언덕 윗면을 정확히 집어내게 한다.
  const pointer = new PointerControls(canvas, camera, (worldX, worldY) =>
    pickSurfaceTile(terrain, worldX, worldY),
  );
  pointer.setTileClickHandler((tile, button) => {
    if (button === 'primary') game.digAt(tile);
    else game.placeAt(tile);
  });
  pointer.attach();

  const keyboard = new KeyboardControls();
  keyboard.setSlotHandler((index) => game.player.selectTool(index));
  keyboard.attach();

  /**
   * 카메라가 플레이어를 따라가는지 여부.
   *
   * 걷기 시작하면 켜고, 시야를 드래그하면 끈다. 이렇게 하면 주변을 둘러보는
   * 조작과 플레이어 추적이 서로 싸우지 않는다 — 둘러보다가 걸으면 다시 따라온다.
   */
  let followPlayer = true;

  const loop = new GameLoop(
    {
      update: (stepMs) => {
        state.step(stepMs);

        // 이동은 키 이벤트가 아니라 눌린 상태를 보고 고정 간격으로 시도한다.
        const intent = keyboard.moveIntent;
        if (intent && game.movePlayer(intent.dx, intent.dy)) followPlayer = true;

        game.update(stepMs);

        // 드래그로 시야를 옮기는 동안에는 추적을 멈춘다.
        if (pointer.dragging) followPlayer = false;

        if (followPlayer) {
          const pose = game.player.pose(terrain);
          const target = gridToWorld(pose.x, pose.y, pose.z);
          camera.moveToward(target.x, target.y, CAMERA_FOLLOW_FACTOR);
        }
      },
      render: (_alpha, frameTimeMs) => {
        const size = surface.beginFrame();
        camera.setViewport(size.width, size.height);

        const hovered = pointer.hovered;
        const stats = world.render(hovered, game.entities());

        overlay.update(
          frameTimeMs,
          {
            hovered,
            hoveredHeight: hovered ? terrain.columnHeight(hovered.x, hovered.y) : 0,
            hoveredSurface: hovered ? terrain.surfaceBlock(hovered.x, hovered.y) : BlockType.EMPTY,
            drawnColumns: stats.drawnColumns,
            drawnWalls: stats.drawnWalls,
            zoom: camera.zoom,
            playerTile: game.player.position,
            tool: game.player.tool,
          },
          game.stash,
        );
      },
    },
    { stepMs: DEFAULT_STEP_MS },
  );

  loop.start();
}

bootstrap();
