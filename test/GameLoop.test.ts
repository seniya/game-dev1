import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameLoop } from '../src/sim/GameLoop';

/**
 * rAF를 수동 제어하는 테스트용 스케줄러.
 * 실제 프레임을 기다리지 않고 원하는 간격의 프레임을 임의로 밀어넣기 위해
 * 전역 requestAnimationFrame/cancelAnimationFrame을 대체한다.
 */
class FakeRaf {
  /** 다음에 부여할 핸들 번호. 0은 "없음"과 구분되도록 1부터 시작한다. */
  private nextHandle = 1;
  /** 아직 실행되지 않은 콜백들. */
  private pending = new Map<number, FrameRequestCallback>();
  /** 가상 시계(ms). */
  private clock = 0;

  /** 전역 rAF/cancel을 이 인스턴스로 교체한다. */
  install(): void {
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const handle = this.nextHandle;
      this.nextHandle += 1;
      this.pending.set(handle, cb);
      return handle;
    };
    globalThis.cancelAnimationFrame = (handle: number): void => {
      this.pending.delete(handle);
    };
  }

  /** 교체한 전역 함수를 정리한다. */
  uninstall(): void {
    this.pending.clear();
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  }

  /** 예약된 콜백이 남아 있는지 여부. */
  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  /**
   * 가상 시계를 진행시키고 예약된 콜백을 한 번 실행한다.
   *
   * @param deltaMs 이번 프레임까지 흐른 시간(ms).
   */
  advance(deltaMs: number): void {
    this.clock += deltaMs;

    // 실행 중 새 콜백이 예약되므로, 지금 대기 중인 것만 떼어내 실행한다.
    const due = [...this.pending.entries()];
    this.pending.clear();
    for (const [, cb] of due) cb(this.clock);
  }
}

describe('GameLoop', () => {
  let raf: FakeRaf;

  beforeEach(() => {
    raf = new FakeRaf();
    raf.install();
  });

  afterEach(() => {
    raf.uninstall();
  });

  /**
   * update/render 호출을 세는 루프를 만든다.
   *
   * @param stepMs 시뮬레이션 스텝 길이(ms).
   * @param maxStepsPerFrame 프레임당 스텝 상한.
   */
  function makeLoop(stepMs: number, maxStepsPerFrame = 5) {
    const calls = { updates: 0, renders: 0, lastAlpha: -1, lastFrameTimeMs: -1 };
    const loop = new GameLoop(
      {
        update: () => {
          calls.updates += 1;
        },
        render: (alpha, frameTimeMs) => {
          calls.renders += 1;
          calls.lastAlpha = alpha;
          calls.lastFrameTimeMs = frameTimeMs;
        },
      },
      { stepMs, maxStepsPerFrame },
    );
    return { loop, calls };
  }

  it('start 전에는 돌지 않고, start/stop으로 상태가 바뀐다', () => {
    const { loop } = makeLoop(10);

    expect(loop.running).toBe(false);
    loop.start();
    expect(loop.running).toBe(true);
    loop.stop();
    expect(loop.running).toBe(false);
  });

  it('첫 프레임은 경과 시간이 없어 update 없이 render만 한다', () => {
    const { loop, calls } = makeLoop(10);
    loop.start();
    raf.advance(10);

    expect(calls.updates).toBe(0);
    expect(calls.renders).toBe(1);
    expect(calls.lastFrameTimeMs).toBe(0);
  });

  it('render는 프레임당 정확히 한 번, update는 고정 간격으로 호출된다', () => {
    const { loop, calls } = makeLoop(10);
    loop.start();

    raf.advance(0); // 기준 프레임
    for (let i = 0; i < 10; i += 1) raf.advance(30); // 30ms 프레임 → 스텝 3개씩

    expect(calls.renders).toBe(11);
    expect(calls.updates).toBe(30);
  });

  it('프레임률이 흔들려도 총 스텝 수는 흐른 시간에 비례한다', () => {
    const { loop, calls } = makeLoop(10);
    loop.start();

    raf.advance(0);
    // 합계 100ms를 불규칙하게 흘린다.
    for (const dt of [7, 13, 4, 26, 11, 9, 18, 12]) raf.advance(dt);

    expect(calls.updates).toBe(10);
  });

  it('긴 정지 후 복귀해도 스텝을 상한까지만 몰아 실행한다', () => {
    const { loop, calls } = makeLoop(10, 5);
    loop.start();

    raf.advance(0);
    raf.advance(5000); // 탭이 백그라운드에 있었던 상황

    expect(calls.updates).toBe(5);
    expect(calls.renders).toBe(2);
  });

  it('alpha는 항상 0 이상 1 미만이다', () => {
    const { loop, calls } = makeLoop(16);
    loop.start();

    raf.advance(0);
    for (const dt of [3, 21, 7, 40, 5]) {
      raf.advance(dt);
      expect(calls.lastAlpha).toBeGreaterThanOrEqual(0);
      expect(calls.lastAlpha).toBeLessThan(1);
    }
  });

  it('stop 이후에는 프레임이 더 예약되지 않는다', () => {
    const { loop, calls } = makeLoop(10);
    loop.start();

    raf.advance(0);
    raf.advance(10);
    const rendersBeforeStop = calls.renders;

    loop.stop();
    expect(raf.hasPending).toBe(false);

    raf.advance(100);
    expect(calls.renders).toBe(rendersBeforeStop);
  });

  it('start를 두 번 불러도 루프가 중복 실행되지 않는다', () => {
    const { loop, calls } = makeLoop(10);
    loop.start();
    loop.start();

    raf.advance(0);
    raf.advance(10);

    expect(calls.renders).toBe(2);
  });
});
