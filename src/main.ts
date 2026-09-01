import { gridToWorld } from './core/coordinates';
import { DEFAULT_STEP_MS } from './core/fixedTimestep';
import { TileGrid } from './core/TileGrid';
import { CanvasRenderer } from './render/CanvasRenderer';
import { Camera } from './render/Camera';
import { WorldRenderer } from './render/WorldRenderer';
import { GameLoop } from './sim/GameLoop';
import { GameState } from './sim/GameState';
import { DebugOverlay } from './ui/DebugOverlay';
import { PointerControls } from './ui/PointerControls';

/** Phase 1 확인용 맵 크기(타일). Phase 2에서 지형 생성으로 대체한다. */
const MAP_WIDTH = 32;
const MAP_HEIGHT = 32;

/**
 * 시작 확대율. 맵 전체가 한눈에 들어오도록 살짝 축소한 상태에서 시작한다 —
 * 컬링과 맵 경계가 실제로 동작하는지 바로 보이게 하려는 의도다.
 */
const INITIAL_ZOOM = 0.7;

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
  const overlay = new DebugOverlay(requireElement('fps'), requireElement('info'));
  const state = new GameState();

  const grid = new TileGrid(MAP_WIDTH, MAP_HEIGHT);
  const camera = new Camera();
  camera.setViewport(surface.size.width, surface.size.height);
  const world = new WorldRenderer(surface.context, camera, grid);

  // 시작 시점에 맵 중앙이 화면 가운데 오도록 카메라를 맞춘다.
  const centerTile = grid.centerTile;
  const centerWorld = gridToWorld(centerTile.x, centerTile.y, 0);
  camera.lookAt(centerWorld.x, centerWorld.y);
  camera.setZoom(INITIAL_ZOOM);

  const controls = new PointerControls(canvas, camera);
  controls.attach();

  const loop = new GameLoop(
    {
      update: (stepMs) => state.step(stepMs),
      render: (_alpha, frameTimeMs) => {
        const size = surface.beginFrame();
        camera.setViewport(size.width, size.height);

        const stats = world.render(controls.hovered);
        overlay.update(frameTimeMs, {
          hovered: controls.hovered,
          drawnTiles: stats.drawnTiles,
          zoom: camera.zoom,
        });
      },
    },
    { stepMs: DEFAULT_STEP_MS },
  );

  // 창 크기가 바뀌면 다음 프레임의 beginFrame()이 잡아내므로 별도 리스너는 두지 않는다.
  loop.start();
}

bootstrap();
