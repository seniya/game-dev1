import {
  DEFAULT_MAX_STEPS_PER_FRAME,
  DEFAULT_STEP_MS,
  planSteps,
} from '../core/fixedTimestep';

/** 게임 루프가 매 프레임 호출하는 콜백 묶음. */
export interface GameLoopHandlers {
  /** 시뮬레이션 1스텝. 고정 간격으로만 호출된다. */
  update(stepMs: number): void;
  /**
   * 화면 그리기. 프레임당 정확히 한 번 호출된다.
   *
   * @param alpha 마지막 스텝 이후 진행률(0~1). 위치 보간에 쓴다.
   * @param frameTimeMs 직전 프레임과의 간격(ms).
   */
  render(alpha: number, frameTimeMs: number): void;
}

/** 게임 루프 설정. */
export interface GameLoopOptions {
  /** 시뮬레이션 1스텝 길이(ms). */
  stepMs?: number;
  /** 한 프레임 최대 스텝 수. */
  maxStepsPerFrame?: number;
}

/**
 * 고정 timestep 업데이트와 requestAnimationFrame 렌더를 분리한 게임 루프.
 *
 * update는 항상 stepMs 간격으로, render는 프레임당 한 번 호출된다.
 * 프레임이 밀리면 update를 여러 번 몰아 실행하되 상한을 둔다(fixedTimestep 참고).
 */
export class GameLoop {
  private readonly handlers: GameLoopHandlers;
  private readonly stepMs: number;
  private readonly maxStepsPerFrame: number;

  /** 아직 스텝으로 소비되지 않은 잔여 시간(ms). */
  private accumulator = 0;
  /** 직전 프레임의 시각(ms). 루프가 멈춘 동안은 null. */
  private lastTime: number | null = null;
  /** 진행 중인 rAF 핸들. 멈춘 상태면 null. */
  private frameHandle: number | null = null;

  /**
   * @param handlers update/render 콜백.
   * @param options 스텝 길이와 스텝 상한.
   */
  constructor(handlers: GameLoopHandlers, options: GameLoopOptions = {}) {
    this.handlers = handlers;
    this.stepMs = options.stepMs ?? DEFAULT_STEP_MS;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? DEFAULT_MAX_STEPS_PER_FRAME;
  }

  /** 루프가 돌고 있는지 여부. */
  get running(): boolean {
    return this.frameHandle !== null;
  }

  /** 루프를 시작한다. 이미 돌고 있으면 아무것도 하지 않는다. */
  start(): void {
    if (this.running) return;

    this.lastTime = null;
    this.accumulator = 0;
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  /** 루프를 멈춘다. 멈춘 상태에서 호출해도 안전하다. */
  stop(): void {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.lastTime = null;
  }

  /**
   * 한 프레임 처리. requestAnimationFrame 콜백으로만 호출된다.
   * 화살표 함수로 둬서 rAF에 넘길 때 this 바인딩이 유지된다.
   *
   * @param timestamp rAF가 넘겨주는 프레임 시각(ms).
   */
  private tick = (timestamp: number): void => {
    // 첫 프레임에는 기준 시각이 없으므로 경과 시간을 0으로 두고 넘어간다.
    const frameTimeMs = this.lastTime === null ? 0 : timestamp - this.lastTime;
    this.lastTime = timestamp;

    const plan = planSteps(this.accumulator, frameTimeMs, this.stepMs, this.maxStepsPerFrame);
    this.accumulator = plan.accumulator;

    for (let i = 0; i < plan.steps; i += 1) {
      this.handlers.update(this.stepMs);
    }

    this.handlers.render(plan.alpha, frameTimeMs);

    this.frameHandle = requestAnimationFrame(this.tick);
  };
}
