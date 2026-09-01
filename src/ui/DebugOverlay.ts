import { FpsCounter } from '../core/FpsCounter';

/**
 * 캔버스 위에 얹는 디버그 텍스트 오버레이.
 *
 * FPS를 캔버스에 직접 그리지 않고 DOM으로 처리해, 렌더러가 게임 화면만 책임지게
 * 한다. 갱신은 초당 몇 회로 제한한다 — 매 프레임 텍스트를 바꾸면 숫자가 읽히지
 * 않고 레이아웃 비용만 늘어난다.
 */
export class DebugOverlay {
  private readonly fpsElement: HTMLElement;
  private readonly counter = new FpsCounter();

  /** 화면 텍스트 갱신 간격(ms). */
  private readonly refreshIntervalMs = 250;
  /** 마지막 갱신 이후 누적 시간(ms). */
  private sinceRefreshMs = 0;

  /**
   * @param fpsElement FPS 숫자를 표시할 엘리먼트.
   */
  constructor(fpsElement: HTMLElement) {
    this.fpsElement = fpsElement;
  }

  /**
   * 프레임 정보를 반영한다. 렌더 직후 매 프레임 호출한다.
   *
   * @param frameTimeMs 직전 프레임과의 간격(ms).
   */
  update(frameTimeMs: number): void {
    this.counter.sample(frameTimeMs);

    this.sinceRefreshMs += frameTimeMs;
    if (this.sinceRefreshMs < this.refreshIntervalMs) return;

    this.sinceRefreshMs = 0;
    this.fpsElement.textContent = `${Math.round(this.counter.fps)} fps`;
  }
}
