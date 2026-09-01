import { DEFAULT_STEP_MS } from './core/fixedTimestep';
import { CanvasRenderer } from './render/CanvasRenderer';
import { GameLoop } from './sim/GameLoop';
import { GameState } from './sim/GameState';
import { DebugOverlay } from './ui/DebugOverlay';

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
  const renderer = new CanvasRenderer(canvas);
  const overlay = new DebugOverlay(requireElement('fps'));
  const state = new GameState();

  const loop = new GameLoop(
    {
      update: (stepMs) => state.step(stepMs),
      render: (alpha, frameTimeMs) => {
        renderer.render(alpha);
        overlay.update(frameTimeMs);
      },
    },
    { stepMs: DEFAULT_STEP_MS },
  );

  // 창 크기가 바뀌면 다음 프레임의 resize()가 잡아내므로 별도 리스너는 두지 않는다.
  loop.start();
}

bootstrap();
