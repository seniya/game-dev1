/**
 * Canvas 2D 렌더러.
 *
 * Phase 0에서는 화면을 배경색으로 지우는 것까지만 담당한다. 아이소메트릭 타일
 * 그리기와 깊이 정렬은 Phase 1에서 이 클래스 위에 얹는다.
 *
 * 해상도 처리 규칙: CSS 픽셀 크기(뷰포트)와 캔버스 내부 버퍼 크기를 분리하고,
 * 버퍼는 devicePixelRatio를 곱해 잡은 뒤 컨텍스트를 스케일한다. 이후 모든 그리기
 * 코드는 DPR을 신경 쓰지 않고 CSS 픽셀 좌표로만 작업한다.
 */
export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  /** 표시 영역 너비(CSS 픽셀). */
  private cssWidth = 0;
  /** 표시 영역 높이(CSS 픽셀). */
  private cssHeight = 0;
  /** 마지막으로 버퍼에 반영한 devicePixelRatio. */
  private appliedDpr = 0;

  /** 캔버스를 지울 때 쓰는 배경색. */
  private readonly background = '#0b0d10';

  /**
   * @param canvas 그릴 대상 캔버스 엘리먼트.
   * @throws 2D 컨텍스트를 얻을 수 없으면 예외를 던진다.
   */
  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D 컨텍스트를 얻을 수 없다.');
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.resize();
  }

  /** 현재 표시 영역 크기(CSS 픽셀). */
  get size(): { width: number; height: number } {
    return { width: this.cssWidth, height: this.cssHeight };
  }

  /**
   * 캔버스 버퍼를 현재 표시 크기와 DPR에 맞춘다.
   * 크기와 DPR이 모두 그대로면 버퍼를 건드리지 않는다 — 버퍼 크기를 대입하는
   * 것만으로도 캔버스 내용이 지워지기 때문이다.
   *
   * @returns 버퍼를 실제로 다시 잡았으면 true.
   */
  resize(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    if (width === this.cssWidth && height === this.cssHeight && dpr === this.appliedDpr) {
      return false;
    }

    this.cssWidth = width;
    this.cssHeight = height;
    this.appliedDpr = dpr;

    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));

    // 이후 그리기는 CSS 픽셀 좌표계에서 이뤄진다.
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  /**
   * 한 프레임을 그린다.
   *
   * @param _alpha 마지막 시뮬레이션 스텝 이후 보간 계수(0~1). Phase 1부터 사용한다.
   */
  render(_alpha: number): void {
    this.resize();
    this.clear();
  }

  /** 화면 전체를 배경색으로 채운다. */
  private clear(): void {
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
  }
}
