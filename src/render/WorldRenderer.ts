import { LAYER_HEIGHT, TILE_HEIGHT, TILE_WIDTH, gridToWorld } from '../core/coordinates';
import { BlockType, blockInfo } from '../core/blocks';
import type { Terrain } from '../core/Terrain';
import type { Camera } from './Camera';

/** 타일 한 칸을 가리키는 좌표. 커서 하이라이트 대상 등에 쓴다. */
export interface TileRef {
  x: number;
  y: number;
}

/** 이번 프레임에 실제로 그린 양. 컬링과 면 생략이 동작하는지 확인하는 용도다. */
export interface RenderStats {
  /** 윗면을 그린 열 수. */
  drawnColumns: number;
  /** 그린 측면 조각 수. */
  drawnWalls: number;
  /** 컬링 범위에는 들었지만 맵 밖이거나 빈 열이어서 건너뛴 수. */
  skippedColumns: number;
}

const TILE_STROKE = 'rgba(0, 0, 0, 0.25)';
const HOVER_FILL = 'rgba(255, 236, 150, 0.35)';
const HOVER_STROKE = '#ffe98a';

/** 이 확대율보다 작아지면 타일 외곽선을 생략한다 — 선이 뭉쳐 지저분해진다. */
const OUTLINE_MIN_ZOOM = 0.6;

/**
 * 아이소메트릭 지형 렌더러.
 *
 * 그리기 순서는 `x + y` 오름차순(대각선 단위)이며 `compareDepth`가 정의한 순서와
 * 같다. 매 프레임 배열을 만들어 정렬하는 대신 대각선을 직접 순회해 같은 순서를
 * 얻는다. 한 열은 측면 → 윗면 순서로 한 번에 그린다.
 *
 * 측면은 **이웃 열보다 높은 만큼만** 그린다. 이웃에 가려지는 면을 그리지 않으므로
 * 평지에서는 측면 비용이 0이고, 지형이 울퉁불퉁할 때만 늘어난다. 노출된 부분은
 * 레이어 단위로 나눠 각 레이어의 블록 색으로 칠해 흙/돌/철광석 층이 드러난다.
 *
 * 호버 하이라이트도 이 순회 안에서 해당 열을 그린 직후에 얹는다. 맨 마지막에
 * 그리면 그 열을 가려야 할 앞쪽 열 위에까지 하이라이트가 올라와 지형을 투시하는
 * 것처럼 보인다.
 */
export class WorldRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera: Camera;
  private readonly terrain: Terrain;

  /**
   * @param ctx CSS 픽셀 좌표계로 설정된 2D 컨텍스트.
   * @param camera 팬/줌 상태를 담은 카메라.
   * @param terrain 그릴 지형.
   */
  constructor(ctx: CanvasRenderingContext2D, camera: Camera, terrain: Terrain) {
    this.ctx = ctx;
    this.camera = camera;
    this.terrain = terrain;
  }

  /**
   * 지형을 그린다.
   *
   * @param hovered 하이라이트할 타일. 없으면 null.
   * @returns 이번 프레임에 그린 양.
   */
  render(hovered: TileRef | null): RenderStats {
    const range = this.camera.visibleTileRange();
    const zoom = this.camera.zoom;
    const halfWidth = (TILE_WIDTH / 2) * zoom;
    const halfHeight = (TILE_HEIGHT / 2) * zoom;
    const layerPixels = LAYER_HEIGHT * zoom;
    const drawOutline = zoom >= OUTLINE_MIN_ZOOM;

    const stats: RenderStats = { drawnColumns: 0, drawnWalls: 0, skippedColumns: 0 };

    this.ctx.lineWidth = 1;

    // 대각선(x + y = sum) 단위로 뒤에서 앞 순서로 순회한다.
    const minSum = range.minX + range.minY;
    const maxSum = range.maxX + range.maxY;

    for (let sum = minSum; sum <= maxSum; sum += 1) {
      const startX = Math.max(range.minX, sum - range.maxY);
      const endX = Math.min(range.maxX, sum - range.minY);

      for (let x = startX; x <= endX; x += 1) {
        const y = sum - x;
        const height = this.terrain.columnHeight(x, y);

        // 맵 밖이거나 바닥까지 파인 열은 그릴 것이 없다.
        if (!this.terrain.contains(x, y) || height === 0) {
          stats.skippedColumns += 1;
          continue;
        }

        const world = gridToWorld(x, y, height - 1);
        const screen = this.camera.worldToScreen(world.x, world.y);

        stats.drawnWalls += this.drawWalls(x, y, height, screen, halfWidth, halfHeight, layerPixels);
        this.drawTop(x, y, screen, halfWidth, halfHeight, drawOutline);
        stats.drawnColumns += 1;

        // 하이라이트는 이 열을 그린 직후에 얹는다. 앞쪽 열은 나중에 그려지므로
        // 가려야 할 부분을 정상적으로 덮는다.
        if (hovered && hovered.x === x && hovered.y === y) {
          this.drawHighlight(screen, halfWidth, halfHeight);
        }
      }
    }

    return stats;
  }

  /**
   * 한 열의 노출된 측면을 그린다.
   *
   * 카메라를 향하는 면은 +x 쪽(윗면의 오른쪽 아래 변)과 +y 쪽(왼쪽 아래 변)
   * 둘뿐이다. 각 면은 이웃 열 높이를 넘는 레이어만 보인다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param height 이 열의 블록 수.
   * @param top 윗면 중심의 화면 좌표.
   * @param halfWidth 확대율이 반영된 마름모 반폭(px).
   * @param halfHeight 확대율이 반영된 마름모 반높이(px).
   * @param layerPixels 확대율이 반영된 레이어 한 칸 높이(px).
   * @returns 그린 측면 조각 수.
   */
  private drawWalls(
    x: number,
    y: number,
    height: number,
    top: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
    layerPixels: number,
  ): number {
    let drawn = 0;

    // +x 면: 윗면의 동(E) → 남(S) 변을 아래로 늘인 사각형.
    drawn += this.drawWallFace(
      x,
      y,
      height,
      this.terrain.columnHeight(x + 1, y),
      { x: top.x + halfWidth, y: top.y },
      { x: top.x, y: top.y + halfHeight },
      layerPixels,
      true,
    );

    // +y 면: 윗면의 남(S) → 서(W) 변을 아래로 늘인 사각형.
    drawn += this.drawWallFace(
      x,
      y,
      height,
      this.terrain.columnHeight(x, y + 1),
      { x: top.x, y: top.y + halfHeight },
      { x: top.x - halfWidth, y: top.y },
      layerPixels,
      false,
    );

    return drawn;
  }

  /**
   * 측면 한 방향을 레이어 단위로 그린다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param height 이 열의 블록 수.
   * @param neighborHeight 이 면이 맞닿은 이웃 열의 블록 수.
   * @param edgeA 윗면 변의 한쪽 끝(화면 좌표).
   * @param edgeB 윗면 변의 다른 쪽 끝(화면 좌표).
   * @param layerPixels 레이어 한 칸의 화면 높이(px).
   * @param towardX +x 방향 면인지 여부. 색 선택에 쓴다.
   * @returns 그린 조각 수.
   */
  private drawWallFace(
    x: number,
    y: number,
    height: number,
    neighborHeight: number,
    edgeA: { x: number; y: number },
    edgeB: { x: number; y: number },
    layerPixels: number,
    towardX: boolean,
  ): number {
    const exposed = height - neighborHeight;
    if (exposed <= 0) return 0;

    let drawn = 0;

    // 위에서부터 노출된 레이어만 훑는다. z = height - 1이 표면 레이어다.
    for (let z = height - 1; z >= neighborHeight; z -= 1) {
      const block = this.terrain.blockAt(x, y, z);
      if (block === BlockType.EMPTY) continue;

      const offsetTop = (height - 1 - z) * layerPixels;
      const offsetBottom = offsetTop + layerPixels;
      const info = blockInfo(block);

      this.ctx.beginPath();
      this.ctx.moveTo(edgeA.x, edgeA.y + offsetTop);
      this.ctx.lineTo(edgeB.x, edgeB.y + offsetTop);
      this.ctx.lineTo(edgeB.x, edgeB.y + offsetBottom);
      this.ctx.lineTo(edgeA.x, edgeA.y + offsetBottom);
      this.ctx.closePath();

      this.ctx.fillStyle = towardX ? info.sideColorX : info.sideColorY;
      this.ctx.fill();
      drawn += 1;
    }

    return drawn;
  }

  /**
   * 열의 윗면을 그린다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param center 윗면 중심의 화면 좌표.
   * @param halfWidth 마름모 반폭(px).
   * @param halfHeight 마름모 반높이(px).
   * @param drawOutline 외곽선을 그릴지 여부.
   */
  private drawTop(
    x: number,
    y: number,
    center: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
    drawOutline: boolean,
  ): void {
    const surface = this.terrain.surfaceBlock(x, y);

    this.traceDiamond(center.x, center.y, halfWidth, halfHeight);
    this.ctx.fillStyle = blockInfo(surface).topColor;
    this.ctx.fill();

    if (drawOutline) {
      this.ctx.strokeStyle = TILE_STROKE;
      this.ctx.stroke();
    }
  }

  /**
   * 커서가 올라간 열의 표면을 강조한다. 그 열의 윗면을 그린 직후에 호출한다.
   *
   * @param screen 강조할 윗면 중심의 화면 좌표.
   * @param halfWidth 마름모 반폭(px).
   * @param halfHeight 마름모 반높이(px).
   */
  private drawHighlight(screen: { x: number; y: number }, halfWidth: number, halfHeight: number): void {
    this.traceDiamond(screen.x, screen.y, halfWidth, halfHeight);
    this.ctx.fillStyle = HOVER_FILL;
    this.ctx.fill();

    this.ctx.strokeStyle = HOVER_STROKE;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  /**
   * 마름모 경로를 만든다. 실제 채우기/선 그리기는 호출자가 한다.
   *
   * 꼭짓점을 배열로 만들지 않고 중심과 반폭·반높이로 직접 계산한다 —
   * 매 프레임 타일마다 객체를 할당하면 그대로 GC 부하가 된다.
   *
   * @param centerX 마름모 중심의 화면 x.
   * @param centerY 마름모 중심의 화면 y.
   * @param halfWidth 반폭(px).
   * @param halfHeight 반높이(px).
   */
  private traceDiamond(centerX: number, centerY: number, halfWidth: number, halfHeight: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY - halfHeight);
    this.ctx.lineTo(centerX + halfWidth, centerY);
    this.ctx.lineTo(centerX, centerY + halfHeight);
    this.ctx.lineTo(centerX - halfWidth, centerY);
    this.ctx.closePath();
  }
}
