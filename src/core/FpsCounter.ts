/**
 * 프레임률 측정기.
 *
 * 프레임 간격은 한 프레임만 보면 심하게 흔들리므로, 최근 N개 샘플의 평균으로
 * 표시값을 안정시킨다. 시간 소스에 의존하지 않고 경과 시간(ms)만 받으므로
 * 단위 테스트가 가능하다.
 */
export class FpsCounter {
  /** 최근 프레임 간격(ms)을 담는 링 버퍼. */
  private readonly samples: number[];
  /** 다음에 덮어쓸 링 버퍼 위치. */
  private cursor = 0;
  /** 지금까지 채워진 샘플 수(버퍼 크기가 상한). */
  private filled = 0;

  /**
   * @param windowSize 평균에 사용할 샘플 개수. 1 이상이어야 한다.
   */
  constructor(windowSize = 60) {
    if (!Number.isInteger(windowSize) || windowSize < 1) {
      throw new RangeError(`windowSize는 1 이상의 정수여야 한다: ${windowSize}`);
    }
    this.samples = new Array<number>(windowSize).fill(0);
  }

  /**
   * 프레임 간격 한 건을 기록한다. 0 이하이거나 유한하지 않은 값은 무시한다.
   *
   * @param frameTimeMs 직전 프레임과의 간격(ms).
   */
  sample(frameTimeMs: number): void {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return;

    this.samples[this.cursor] = frameTimeMs;
    this.cursor = (this.cursor + 1) % this.samples.length;
    if (this.filled < this.samples.length) this.filled += 1;
  }

  /**
   * 현재 평균 FPS를 돌려준다.
   *
   * @returns 샘플이 없으면 0, 있으면 평균 프레임 간격의 역수(초당 프레임).
   */
  get fps(): number {
    if (this.filled === 0) return 0;

    let total = 0;
    for (let i = 0; i < this.filled; i += 1) total += this.samples[i];

    return 1000 / (total / this.filled);
  }

  /** 측정값을 모두 버린다. 씬 전환처럼 프레임 흐름이 끊길 때 호출한다. */
  reset(): void {
    this.samples.fill(0);
    this.cursor = 0;
    this.filled = 0;
  }
}
