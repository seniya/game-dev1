import { worldToTile } from '../core/coordinates';
import type { Camera } from '../render/Camera';
import type { TileRef } from '../render/WorldRenderer';

/** 휠 한 칸당 확대율 배수. 1보다 크며, 클수록 줌이 빠르다. */
const WHEEL_ZOOM_STEP = 1.12;

/**
 * 드래그가 아닌 클릭으로 볼 최대 이동 거리(px).
 * 팬 도중 손이 미세하게 떨려도 클릭으로 인정되도록 여유를 둔다.
 * Phase 3 이후 타일 클릭(파기/건축 확정)에서 쓴다.
 */
const CLICK_SLOP_PX = 4;

/**
 * 캔버스 포인터 입력을 카메라 조작과 타일 피킹으로 옮기는 컨트롤러.
 *
 * 기획서 3절에 따라 회전은 제공하지 않는다 — 드래그는 팬, 휠은 줌뿐이다.
 * DOM 이벤트를 다루므로 순수 로직(`src/core`)과 분리해 `src/ui`에 둔다.
 */
export class PointerControls {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;

  /** 커서가 올라간 타일. 캔버스 밖이면 null. */
  private hoveredTile: TileRef | null = null;

  /** 드래그 중인 포인터 id. 드래그가 아니면 null. */
  private dragPointerId: number | null = null;
  /** 직전 포인터 위치(캔버스 기준 CSS px). */
  private lastX = 0;
  private lastY = 0;
  /** 이번 드래그에서 누적 이동한 거리(px). 클릭/드래그 구분에 쓴다. */
  private dragDistance = 0;

  /** 타일 클릭 콜백. Phase 3 이후 채집·건축이 여기에 붙는다. */
  private onTileClick: ((tile: TileRef) => void) | null = null;

  /**
   * @param canvas 입력을 받을 캔버스.
   * @param camera 조작할 카메라.
   */
  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;
  }

  /** 커서가 올라간 타일. 캔버스 밖이면 null. */
  get hovered(): TileRef | null {
    return this.hoveredTile;
  }

  /** 지금 드래그(팬) 중인지 여부. */
  get dragging(): boolean {
    return this.dragPointerId !== null;
  }

  /**
   * 타일 클릭 콜백을 등록한다. 드래그로 판정된 조작은 클릭으로 보지 않는다.
   *
   * @param handler 클릭된 타일을 받는 콜백.
   */
  setTileClickHandler(handler: (tile: TileRef) => void): void {
    this.onTileClick = handler;
  }

  /** 이벤트 리스너를 붙인다. */
  attach(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    // 드래그 중 브라우저 기본 컨텍스트 메뉴/선택이 끼어들지 않게 막는다.
    this.canvas.addEventListener('contextmenu', preventDefault);
  }

  /** 붙였던 이벤트 리스너를 모두 뗀다. */
  detach(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', preventDefault);
  }

  /**
   * 이벤트의 클라이언트 좌표를 캔버스 기준 CSS 픽셀 좌표로 바꾼다.
   *
   * @param event 포인터/휠 이벤트.
   * @returns 캔버스 좌상단 기준 좌표.
   */
  private toCanvasPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * 캔버스 좌표가 가리키는 타일을 갱신한다.
   *
   * @param x 캔버스 기준 x(CSS px).
   * @param y 캔버스 기준 y(CSS px).
   */
  private updateHover(x: number, y: number): void {
    const world = this.camera.screenToWorld(x, y);
    this.hoveredTile = worldToTile(world.x, world.y, 0);
  }

  /**
   * 드래그를 시작한다.
   *
   * @param event 포인터 다운 이벤트.
   */
  private handlePointerDown = (event: PointerEvent): void => {
    // 주 버튼(마우스 왼쪽/터치)만 팬으로 받는다.
    if (event.button !== 0) return;

    const point = this.toCanvasPoint(event);
    this.dragPointerId = event.pointerId;
    this.lastX = point.x;
    this.lastY = point.y;
    this.dragDistance = 0;

    // 이동 없이 바로 누른 경우(터치 탭)에도 대상 타일이 정해져야 한다.
    this.updateHover(point.x, point.y);

    // 커서가 캔버스를 벗어나도 이벤트를 계속 받아 팬이 끊기지 않게 한다.
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
  };

  /**
   * 커서 위치를 반영한다. 드래그 중이면 카메라를 옮긴다.
   *
   * @param event 포인터 무브 이벤트.
   */
  private handlePointerMove = (event: PointerEvent): void => {
    const point = this.toCanvasPoint(event);

    if (this.dragPointerId === event.pointerId) {
      const deltaX = point.x - this.lastX;
      const deltaY = point.y - this.lastY;
      this.camera.panByScreen(deltaX, deltaY);
      this.dragDistance += Math.hypot(deltaX, deltaY);
    }

    this.lastX = point.x;
    this.lastY = point.y;
    this.updateHover(point.x, point.y);
  };

  /**
   * 드래그를 끝낸다. 이동이 거의 없었다면 클릭으로 본다.
   *
   * @param event 포인터 업/캔슬 이벤트.
   */
  private handlePointerUp = (event: PointerEvent): void => {
    if (this.dragPointerId !== event.pointerId) return;

    this.dragPointerId = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.canvas.style.cursor = '';

    if (
      event.type === 'pointerup' &&
      this.dragDistance <= CLICK_SLOP_PX &&
      this.hoveredTile &&
      this.onTileClick
    ) {
      this.onTileClick(this.hoveredTile);
    }
  };

  /** 커서가 캔버스를 떠나면 하이라이트를 끈다. */
  private handlePointerLeave = (): void => {
    if (this.dragging) return;
    this.hoveredTile = null;
  };

  /**
   * 커서 위치를 고정한 채 줌한다.
   *
   * @param event 휠 이벤트.
   */
  private handleWheel = (event: WheelEvent): void => {
    // 페이지 스크롤/브라우저 확대가 대신 일어나는 것을 막는다.
    event.preventDefault();

    const point = this.toCanvasPoint(event);
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    this.camera.zoomAt(point.x, point.y, factor);
    this.updateHover(point.x, point.y);
  };
}

/**
 * 이벤트 기본 동작을 막는 리스너. addEventListener/removeEventListener에
 * 같은 참조를 넘겨야 하므로 모듈 수준에 둔다.
 *
 * @param event 대상 이벤트.
 */
function preventDefault(event: Event): void {
  event.preventDefault();
}
