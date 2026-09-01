import { TILE_HEIGHT, TILE_WIDTH, gridToWorld } from '../core/coordinates';
import type { TileGrid } from '../core/TileGrid';
import type { Camera } from './Camera';

/** 타일 한 칸을 가리키는 좌표. 커서 하이라이트 대상 등에 쓴다. */
export interface TileRef {
  x: number;
  y: number;
}

/** 이번 프레임에 실제로 그린 양. 컬링이 동작하는지 확인하는 용도다. */
export interface RenderStats {
  /** 그린 타일 수. */
  drawnTiles: number;
  /** 컬링 범위에는 들었지만 그리드 밖이어서 건너뛴 타일 수. */
  culledTiles: number;
}

/** 타일 색상. Phase 1은 스프라이트 없이 색상 마름모로 그린다(로드맵 3절 권고). */
const TILE_FILL_EVEN = '#3c6836';
const TILE_FILL_ODD = '#487a41';
const TILE_STROKE = 'rgba(0, 0, 0, 0.22)';
const HOVER_FILL = 'rgba(255, 236, 150, 0.35)';
const HOVER_STROKE = '#ffe98a';

/** 이 확대율보다 작아지면 타일 외곽선을 생략한다 — 선이 뭉쳐 지저분해진다. */
const OUTLINE_MIN_ZOOM = 0.6;

/**
 * 아이소메트릭 타일 그리드 렌더러.
 *
 * 그리기 순서는 `x + y` 오름차순(대각선 단위)이며, 이는 `compareDepth`가 정의한
 * 순서와 같다. 매 프레임 배열을 만들어 정렬하는 대신 대각선을 직접 순회해
 * 같은 순서를 얻는다 — 프레임마다 수천 개 객체를 할당하고 정렬할 이유가 없다.
 */
export class WorldRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera: Camera;
  private readonly grid: TileGrid;

  /**
   * @param ctx CSS 픽셀 좌표계로 설정된 2D 컨텍스트.
   * @param camera 팬/줌 상태를 담은 카메라.
   * @param grid 그릴 타일 그리드.
   */
  constructor(ctx: CanvasRenderingContext2D, camera: Camera, grid: TileGrid) {
    this.ctx = ctx;
    this.camera = camera;
    this.grid = grid;
  }

  /**
   * 타일 그리드를 그린다.
   *
   * @param hovered 하이라이트할 타일. 없으면 null.
   * @returns 이번 프레임에 그린/건너뛴 타일 수.
   */
  render(hovered: TileRef | null): RenderStats {
    const range = this.camera.visibleTileRange();
    const zoom = this.camera.zoom;
    const halfWidth = (TILE_WIDTH / 2) * zoom;
    const halfHeight = (TILE_HEIGHT / 2) * zoom;
    const drawOutline = zoom >= OUTLINE_MIN_ZOOM;

    const stats: RenderStats = { drawnTiles: 0, culledTiles: 0 };

    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = TILE_STROKE;

    // 대각선(x + y = d) 단위로 뒤에서 앞 순서로 순회한다.
    const minSum = range.minX + range.minY;
    const maxSum = range.maxX + range.maxY;

    for (let sum = minSum; sum <= maxSum; sum += 1) {
      const startX = Math.max(range.minX, sum - range.maxY);
      const endX = Math.min(range.maxX, sum - range.minY);

      for (let x = startX; x <= endX; x += 1) {
        const y = sum - x;

        if (!this.grid.contains(x, y)) {
          stats.culledTiles += 1;
          continue;
        }

        const world = gridToWorld(x, y, 0);
        const screen = this.camera.worldToScreen(world.x, world.y);

        this.ctx.fillStyle = (x + y) % 2 === 0 ? TILE_FILL_EVEN : TILE_FILL_ODD;
        this.traceDiamond(screen.x, screen.y, halfWidth, halfHeight);
        this.ctx.fill();
        if (drawOutline) this.ctx.stroke();

        stats.drawnTiles += 1;
      }
    }

    if (hovered && this.grid.contains(hovered.x, hovered.y)) {
      this.drawHighlight(hovered, halfWidth, halfHeight);
    }

    return stats;
  }

  /**
   * 커서가 올라간 타일을 강조한다. 타일 위에 반투명하게 덮으므로 그리드를
   * 모두 그린 뒤 마지막에 호출한다.
   *
   * @param tile 강조할 타일.
   * @param halfWidth 확대율이 반영된 마름모 반폭(px).
   * @param halfHeight 확대율이 반영된 마름모 반높이(px).
   */
  private drawHighlight(tile: TileRef, halfWidth: number, halfHeight: number): void {
    const world = gridToWorld(tile.x, tile.y, 0);
    const screen = this.camera.worldToScreen(world.x, world.y);

    this.traceDiamond(screen.x, screen.y, halfWidth, halfHeight);
    this.ctx.fillStyle = HOVER_FILL;
    this.ctx.fill();

    this.ctx.strokeStyle = HOVER_STROKE;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
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
