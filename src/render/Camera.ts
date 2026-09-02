import {
  LAYER_HEIGHT,
  MAX_LAYERS,
  TILE_HEIGHT,
  TILE_WIDTH,
  gridToWorld,
  worldToGrid,
  type WorldPos,
} from '../core/coordinates';

/** 축소 한계. 이보다 작아지면 타일이 몇 픽셀로 뭉개진다. */
export const MIN_ZOOM = 0.4;

/** 확대 한계. */
export const MAX_ZOOM = 3;

/** 화면에 보이는 정수 타일 범위(양끝 포함). */
export interface TileRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 월드 좌표계에서의 사각 영역. */
export interface WorldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 팬과 줌만 지원하는 2D 카메라.
 *
 * 기획서 3절이 "회전 없는 고정 각도"를 명시하므로 회전은 의도적으로 구현하지
 * 않는다. 덕분에 변환이 이동+등방 스케일뿐이어서 역변환과 가시 범위 계산이
 * 단순하다.
 *
 * DOM에 의존하지 않는다 — 뷰포트 크기를 외부에서 받으므로 단위 테스트가 가능하다.
 */
export class Camera {
  /** 뷰포트 중심에 오는 월드 좌표. */
  private centerX = 0;
  private centerY = 0;

  /** 확대율. 1이면 월드 1px = 화면 1px. */
  private scale = 1;

  /** 뷰포트 크기(CSS px). */
  private viewportWidth = 1;
  private viewportHeight = 1;

  /**
   * 카메라 중심이 머물 수 있는 월드 영역. null이면 제한하지 않는다.
   *
   * 제한이 없으면 드래그로 맵에서 한없이 멀어져 검은 화면만 남는다 — 되돌아올 단서가
   * 없어 사실상 길을 잃는다.
   */
  private bounds: WorldBounds | null = null;

  /** 현재 확대율. */
  get zoom(): number {
    return this.scale;
  }

  /** 뷰포트 중심의 월드 좌표. */
  get center(): WorldPos {
    return { x: this.centerX, y: this.centerY };
  }

  /**
   * 뷰포트 크기를 갱신한다. 캔버스 크기가 바뀔 때마다 호출한다.
   *
   * @param width 뷰포트 너비(CSS px).
   * @param height 뷰포트 높이(CSS px).
   */
  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    // 창 크기가 바뀌면 보이는 영역도 바뀌므로 범위를 다시 적용한다.
    this.applyBounds();
  }

  /**
   * 카메라 중심이 머물 수 있는 범위를 정한다.
   *
   * @param bounds 월드 영역. null이면 제한을 없앤다.
   */
  setBounds(bounds: WorldBounds | null): void {
    this.bounds = bounds;
    this.applyBounds();
  }

  /** 지금 걸려 있는 범위. 없으면 null. */
  get limits(): WorldBounds | null {
    return this.bounds;
  }

  /**
   * 카메라를 특정 월드 좌표에 맞춘다.
   *
   * @param worldX 월드 x.
   * @param worldY 월드 y.
   */
  lookAt(worldX: number, worldY: number): void {
    this.centerX = worldX;
    this.centerY = worldY;
    this.applyBounds();
  }

  /**
   * 중심을 허용 범위 안으로 되돌린다.
   *
   * 단순히 중심 좌표만 자르면 축소했을 때 맵이 화면 구석으로 밀린다 — 보이는 영역이
   * 맵보다 커지기 때문이다. 그래서 **보이는 영역**을 기준으로 자른다.
   *
   * - 맵이 화면보다 크면: 화면이 맵 밖을 넘지 않도록 중심을 제한한다.
   * - 맵이 화면보다 작으면: 팬할 여지가 없으므로 맵 가운데에 고정한다.
   */
  private applyBounds(): void {
    if (!this.bounds) return;

    const halfW = this.viewportWidth / 2 / this.scale;
    const halfH = this.viewportHeight / 2 / this.scale;

    const spanX = this.bounds.right - this.bounds.left;
    const spanY = this.bounds.bottom - this.bounds.top;
    const midX = (this.bounds.left + this.bounds.right) / 2;
    const midY = (this.bounds.top + this.bounds.bottom) / 2;

    this.centerX =
      spanX <= halfW * 2 ? midX : clamp(this.centerX, this.bounds.left + halfW, this.bounds.right - halfW);
    this.centerY =
      spanY <= halfH * 2 ? midY : clamp(this.centerY, this.bounds.top + halfH, this.bounds.bottom - halfH);
  }

  /**
   * 확대율을 직접 지정한다. 상·하한으로 잘린다.
   * 커서 기준 줌이 아니라 화면 중심을 고정한 채 배율만 바꾼다.
   *
   * @param zoom 목표 확대율.
   */
  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) return;
    this.scale = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  }

  /**
   * 지정한 월드 좌표를 향해 카메라를 일부만 옮긴다.
   *
   * 매 스텝 조금씩 당기면 플레이어를 딱딱하게 물고 가지 않고 부드럽게 따라간다.
   * 고정 timestep 안에서 호출되므로 프레임률이 흔들려도 추적 속도가 같다.
   *
   * @param worldX 목표 월드 x.
   * @param worldY 목표 월드 y.
   * @param factor 한 번에 좁힐 거리 비율(0~1). 1이면 즉시 도달한다.
   */
  moveToward(worldX: number, worldY: number, factor: number): void {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;

    const ratio = Math.max(0, Math.min(1, factor));
    this.centerX += (worldX - this.centerX) * ratio;
    this.centerY += (worldY - this.centerY) * ratio;
    this.applyBounds();
  }

  /**
   * 월드 좌표를 화면 좌표로 변환한다.
   *
   * @param worldX 월드 x.
   * @param worldY 월드 y.
   * @returns 화면 좌표(CSS px, 캔버스 좌상단 기준).
   */
  worldToScreen(worldX: number, worldY: number): WorldPos {
    return {
      x: (worldX - this.centerX) * this.scale + this.viewportWidth / 2,
      y: (worldY - this.centerY) * this.scale + this.viewportHeight / 2,
    };
  }

  /**
   * 화면 좌표를 월드 좌표로 되돌린다. 마우스 피킹의 첫 단계다.
   *
   * @param screenX 화면 x(CSS px).
   * @param screenY 화면 y(CSS px).
   * @returns 월드 좌표.
   */
  screenToWorld(screenX: number, screenY: number): WorldPos {
    return {
      x: (screenX - this.viewportWidth / 2) / this.scale + this.centerX,
      y: (screenY - this.viewportHeight / 2) / this.scale + this.centerY,
    };
  }

  /**
   * 화면상의 이동량만큼 카메라를 옮긴다. 드래그 팬에 쓴다.
   * 확대된 상태에서는 같은 픽셀 드래그가 더 적은 월드 거리에 대응해야 하므로
   * 이동량을 확대율로 나눈다.
   *
   * @param screenDeltaX 화면 x 이동량(px). 커서가 오른쪽으로 갔으면 양수.
   * @param screenDeltaY 화면 y 이동량(px).
   */
  panByScreen(screenDeltaX: number, screenDeltaY: number): void {
    // 커서를 오른쪽으로 끌면 화면 내용도 오른쪽으로 따라와야 하므로 카메라는 왼쪽으로 간다.
    this.centerX -= screenDeltaX / this.scale;
    this.centerY -= screenDeltaY / this.scale;
    this.applyBounds();
  }

  /**
   * 커서 위치를 고정한 채 확대/축소한다. 휠 줌에서 커서 아래 타일이
   * 그대로 머무는 동작을 만든다.
   *
   * @param screenX 고정할 화면 x(CSS px).
   * @param screenY 고정할 화면 y(CSS px).
   * @param factor 확대율 배수. 1보다 크면 확대.
   */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;

    const before = this.screenToWorld(screenX, screenY);
    this.scale = clamp(this.scale * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(screenX, screenY);

    // 줌 때문에 커서 아래 월드 지점이 밀린 만큼 카메라를 되돌린다.
    this.centerX += before.x - after.x;
    this.centerY += before.y - after.y;
    this.applyBounds();
  }

  /** 현재 화면에 보이는 월드 영역. */
  visibleWorldBounds(): WorldBounds {
    const halfW = this.viewportWidth / 2 / this.scale;
    const halfH = this.viewportHeight / 2 / this.scale;

    return {
      left: this.centerX - halfW,
      top: this.centerY - halfH,
      right: this.centerX + halfW,
      bottom: this.centerY + halfH,
    };
  }

  /**
   * 화면에 걸칠 수 있는 타일 범위를 구한다. 화면 밖 타일 컬링에 쓴다.
   *
   * 월드 좌표계의 사각 뷰포트는 그리드 좌표계에서 마름모가 되므로, 정확한
   * 범위 대신 **네 꼭짓점의 그리드 좌표를 감싸는 사각형**을 쓴다. 보수적이라
   * 화면 밖 타일이 일부 섞이지만, 보여야 할 타일을 빠뜨리지 않는다.
   *
   * z가 큰 블록은 화면에서 위로 밀려 그려지므로, 뷰포트 아래쪽 밖에 있는
   * 높은 블록도 보일 수 있다. z=0 평면과 최상단 레이어 평면 양쪽으로 범위를
   * 구해 합집합을 취한다.
   *
   * @param layerCount 지형 레이어 수. 기본값은 기획서상의 5.
   * @returns 양끝을 포함하는 정수 타일 범위.
   */
  visibleTileRange(layerCount = MAX_LAYERS): TileRange {
    const bounds = this.visibleWorldBounds();
    const corners: WorldPos[] = [
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
      { x: bounds.left, y: bounds.bottom },
      { x: bounds.right, y: bounds.bottom },
    ];

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const z of [0, Math.max(0, layerCount - 1)]) {
      for (const corner of corners) {
        const grid = worldToGrid(corner.x, corner.y, z);
        if (grid.x < minX) minX = grid.x;
        if (grid.x > maxX) maxX = grid.x;
        if (grid.y < minY) minY = grid.y;
        if (grid.y > maxY) maxY = grid.y;
      }
    }

    // 타일 중심이 화면 밖이어도 마름모 일부가 걸칠 수 있으니 한 칸 여유를 둔다.
    // 레이어 높이가 타일 높이보다 클 경우까지 대비해 y 여유를 조금 더 잡는다.
    const padY = 1 + Math.ceil(LAYER_HEIGHT / TILE_HEIGHT);

    return {
      minX: Math.floor(minX) - 1,
      maxX: Math.ceil(maxX) + 1,
      minY: Math.floor(minY) - padY,
      maxY: Math.ceil(maxY) + padY,
    };
  }
}

/**
 * 값을 범위 안으로 자른다.
 *
 * @param value 대상 값.
 * @param min 하한.
 * @param max 상한.
 * @returns 범위 안으로 잘린 값.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 맵 전체를 감싸는 카메라 이동 범위를 계산한다.
 *
 * 맵 네 모서리를 월드 좌표로 옮긴 뒤 여유를 둔다. 여유가 없으면 가장자리 타일이 화면
 * 끝에 딱 붙어 무엇이 있는지 보기 어렵다.
 *
 * @param width 맵 가로 타일 수.
 * @param height 맵 세로 타일 수.
 * @param margin 여유(px).
 * @returns 카메라 중심이 머물 수 있는 영역.
 */
export function boundsForMap(width: number, height: number, margin = TILE_WIDTH * 2): WorldBounds {
  const corners = [
    gridToWorld(0, 0, 0),
    gridToWorld(width - 1, 0, 0),
    gridToWorld(0, height - 1, 0),
    gridToWorld(width - 1, height - 1, 0),
  ];

  return {
    left: Math.min(...corners.map((corner) => corner.x)) - margin,
    right: Math.max(...corners.map((corner) => corner.x)) + margin,
    top: Math.min(...corners.map((corner) => corner.y)) - margin,
    bottom: Math.max(...corners.map((corner) => corner.y)) + margin,
  };
}
