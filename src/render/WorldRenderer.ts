import { LAYER_HEIGHT, TILE_HEIGHT, TILE_WIDTH, gridToWorld } from '../core/coordinates';
import { darkColor, darknessAt } from '../core/light';
import { BlockType, blockInfo } from '../core/blocks';
import type { Terrain } from '../core/Terrain';
import type { Camera } from './Camera';
import { DAMAGE_STAGES, type Sprite, type SpriteSet } from './sprites';

/**
 * 화면 전체에 얹는 분위기.
 *
 * 렌더러는 "동굴"도 "밤"도 모른다. 색조와 빛의 중심만 받는다 — 어디가 왜 어두운지는
 * 규칙(`Game`)의 몫이다.
 */
export interface Atmosphere {
  /** 화면 전체에 얹을 색조. 없으면 얹지 않는다. */
  tint?: { color: string; alpha: number } | null;
  /** 빛의 중심과 반경(타일). 없으면 어둡게 하지 않는다. */
  light?: {
    x: number;
    y: number;
    z: number;
    /** 이 반경 안은 밝다. */
    lit: number;
    /** 이 반경 밖은 가장 어둡다. */
    dark: number;
    /** 가장 어두운 곳의 불투명도. */
    max: number;
  } | null;
}

/** 타일 한 칸을 가리키는 좌표. 커서 하이라이트 대상 등에 쓴다. */
export interface TileRef {
  x: number;
  y: number;
}

/**
 * 지형 위에 올라가는 시각 요소.
 *
 * 플레이어·나무·광맥·건물이 모두 이 형태로 들어온다. 스프라이트를 쓰지 않는
 * 단계이므로 그리기는 종류별 도형으로 처리한다(로드맵 3절: MVP는 도형으로 시작).
 * 깊이 정렬을 지형과 함께 해야 하므로 렌더러가 직접 그린다 — 별도 패스로 나중에
 * 그리면 언덕 뒤에 있어야 할 오브젝트가 언덕 위로 올라온다.
 */
export type Entity =
  | { kind: 'player'; x: number; y: number; z: number; swing: number }
  | { kind: 'tree'; x: number; y: number; z: number; damage: number }
  | { kind: 'oreVein'; x: number; y: number; z: number; damage: number; iron: boolean }
  | { kind: 'npc'; x: number; y: number; z: number; hue: number }
  /** 다른 맵으로 통하는 칸. `inward`면 들어가는 입구, 아니면 나가는 출구다. */
  | { kind: 'portal'; x: number; y: number; z: number; inward: boolean }
  | { kind: 'building'; x: number; y: number; z: number; width: number; depth: number; style: BuildingStyle; progress: number };

/** 건물 외형 종류. 블루프린트가 이 값으로 자기 모습을 지정한다. */
export type BuildingStyle =
  | 'house'
  | 'bigHouse'
  | 'warehouse'
  | 'well'
  | 'workbench'
  | 'forge'
  | 'quarry';

/**
 * 지형 위에 얹는 구역 표시.
 *
 * 렌더러는 구역이 무엇인지 모른다. "이 칸이 잠겼는가"만 물어보고, 잠긴 칸을 어둡게
 * 칠하고 잠금이 바뀌는 경계에 선을 긋는다. 규칙(어디가 왜 잠겼는지)은 `Game`의 몫이다.
 */
export interface ZoneOverlay {
  /**
   * 그 칸이 잠겨 있는지 확인한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   */
  locked(x: number, y: number): boolean;
}

/** 건축 모드의 반투명 미리보기. */
export interface GhostPreview {
  /** 점유 영역 좌상단 그리드 x. */
  x: number;
  /** 점유 영역 좌상단 그리드 y. */
  y: number;
  /** 가로 칸수. */
  width: number;
  /** 세로 칸수. */
  depth: number;
  /** 여기 지어도 되는지. 색으로 구분한다. */
  valid: boolean;
  /** 무엇을 짓는지. 커서 옆에 띄운다. */
  label?: string;
}

/** 이번 프레임에 실제로 그린 양. 컬링과 면 생략이 동작하는지 확인하는 용도다. */
export interface RenderStats {
  /** 윗면을 그린 열 수. */
  drawnColumns: number;
  /** 그린 측면 조각 수. */
  drawnWalls: number;
  /** 컬링 범위에는 들었지만 맵 밖이거나 빈 열이어서 건너뛴 수. */
  skippedColumns: number;
  /** 그린 오브젝트 수. */
  drawnEntities: number;
}

const TILE_STROKE = 'rgba(0, 0, 0, 0.25)';
const HOVER_FILL = 'rgba(255, 236, 150, 0.35)';
const HOVER_STROKE = '#ffe98a';

/** 잠긴 구역을 덮는 색. 지형이 보이되 손댈 수 없음이 읽혀야 한다. */
const ZONE_LOCKED_FILL = 'rgba(20, 26, 40, 0.35)';

/** 구역 경계선 색. */
const ZONE_EDGE = 'rgba(150, 180, 240, 0.55)';

/** 이 확대율보다 작아지면 타일 외곽선을 생략한다 — 선이 뭉쳐 지저분해진다. */
const OUTLINE_MIN_ZOOM = 0.6;

/** 건축 중 먼지 알갱이 수. 많이 넣어도 도형으로는 더 그럴듯해지지 않는다. */
const DUST_COUNT = 7;

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
  private terrain: Terrain;

  /** 오브젝트 정렬용 내부 버퍼. 프레임마다 새 배열을 만들지 않으려고 재사용한다. */
  private readonly entityBuffer: Entity[] = [];

  /** 이번 프레임의 시각(ms). 건축 먼지처럼 시간에 따라 움직이는 연출에 쓴다. */
  private timeMs = 0;

  /**
   * 스프라이트 모음. 없으면 도형으로 그린다.
   *
   * 도형 경로를 지우지 않는 이유는 로드맵 02의 진행 원칙에 적어 뒀다 — 캔버스를 만들 수
   * 없는 환경(헤드리스 테스트)과 첫 프레임이 그 위에서 돈다.
   */
  private sprites: SpriteSet | null = null;

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
   * 그릴 지형을 바꾼다. 맵을 옮길 때 부른다.
   *
   * 렌더러가 지형을 생성자에서만 받던 시절에는 맵이 하나뿐이었다. 맵이 늘어난
   * 지금은 "지금 있는 맵"을 따라가야 한다.
   *
   * @param terrain 새로 그릴 지형.
   */
  setTerrain(terrain: Terrain): void {
    this.terrain = terrain;
  }

  /**
   * 스프라이트 모음을 붙인다. null이면 도형으로 그린다.
   *
   * @param sprites 스프라이트 모음.
   */
  setSprites(sprites: SpriteSet | null): void {
    this.sprites = sprites;
  }

  /** 지금 스프라이트로 그리는지 여부. */
  get usingSprites(): boolean {
    return this.sprites !== null;
  }

  /**
   * 스프라이트를 기준점에 맞춰 그린다.
   *
   * @param sprite 스프라이트.
   * @param anchorX 기준점의 화면 x.
   * @param anchorY 기준점의 화면 y.
   * @param zoom 확대율.
   */
  private drawSprite(sprite: Sprite, anchorX: number, anchorY: number, zoom: number): void {
    this.ctx.drawImage(
      sprite.image,
      anchorX + sprite.offsetX * zoom,
      anchorY + sprite.offsetY * zoom,
      sprite.width * zoom,
      sprite.height * zoom,
    );
  }

  /**
   * 손상도를 스프라이트 단계로 바꾼다.
   *
   * @param damage 손상도(0~1).
   * @returns 단계 번호.
   */
  private damageStage(damage: number): number {
    const stage = Math.floor(damage * DAMAGE_STAGES);

    return Math.max(0, Math.min(DAMAGE_STAGES - 1, stage));
  }

  /**
   * 지형과 그 위의 오브젝트를 그린다.
   *
   * @param hovered 하이라이트할 타일. 없으면 null.
   * @param entities 지형 위에 그릴 오브젝트. 순서는 상관없다(내부에서 정렬한다).
   * @param ghost 반투명 미리보기. 건축 모드에서만 넘긴다.
   * @param timeMs 시뮬레이션 시각. 시간에 따라 움직이는 연출에 쓴다.
   * @param zones 구역 표시. 없으면 잠긴 칸을 칠하지 않는다.
   * @param atmosphere 색조와 빛. 동굴의 어둠과 밤의 시야가 여기로 들어온다.
   * @returns 이번 프레임에 그린 양.
   */
  render(
    hovered: TileRef | null,
    entities: readonly Entity[] = [],
    ghost: GhostPreview | null = null,
    timeMs = 0,
    zones: ZoneOverlay | null = null,
    atmosphere: Atmosphere | null = null,
  ): RenderStats {
    this.timeMs = timeMs;
    const range = this.camera.visibleTileRange();
    const zoom = this.camera.zoom;
    const halfWidth = (TILE_WIDTH / 2) * zoom;
    const halfHeight = (TILE_HEIGHT / 2) * zoom;
    const layerPixels = LAYER_HEIGHT * zoom;
    const drawOutline = zoom >= OUTLINE_MIN_ZOOM;

    const stats: RenderStats = { drawnColumns: 0, drawnWalls: 0, skippedColumns: 0, drawnEntities: 0 };

    this.ctx.lineWidth = 1;

    // 오브젝트를 지형과 같은 순서(x + y 오름차순, 같은 대각선에서는 x 오름차순)로
    // 정렬해 두고, 순회하면서 해당 칸에 온 것만 꺼내 그린다. 매 프레임 새 배열을
    // 만들지 않도록 내부 버퍼를 재사용한다.
    const sorted = this.sortEntities(entities);
    let entityCursor = 0;

    // 대각선(x + y = sum) 단위로 뒤에서 앞 순서로 순회한다.
    const minSum = range.minX + range.minY;
    const maxSum = range.maxX + range.maxY;

    for (let sum = minSum; sum <= maxSum; sum += 1) {
      const startX = Math.max(range.minX, sum - range.maxY);
      const endX = Math.min(range.maxX, sum - range.minY);

      for (let x = startX; x <= endX; x += 1) {
        const y = sum - x;
        const height = this.terrain.columnHeight(x, y);

        // 이 칸보다 앞선 오브젝트는 이미 지났다는 뜻이므로 커서를 밀어 둔다.
        // 열을 건너뛰는 경우에도 커서가 멈추지 않도록 skip 판정보다 먼저 한다.
        while (entityCursor < sorted.length && compareEntityOrder(sorted[entityCursor]!, x, y) < 0) {
          entityCursor += 1;
        }

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

        if (zones) this.drawZoneMark(zones, x, y, screen, halfWidth, halfHeight);

        // 하이라이트는 이 열을 그린 직후에 얹는다. 앞쪽 열은 나중에 그려지므로
        // 가려야 할 부분을 정상적으로 덮는다.
        if (hovered && hovered.x === x && hovered.y === y) {
          this.drawHighlight(screen, halfWidth, halfHeight);
        }

        if (ghost) {
          this.drawGhostTile(ghost, x, y, screen, halfWidth, halfHeight);
          // 이름은 점유 영역의 기준 칸에서 한 번만 그린다.
          if (ghost.label && x === ghost.x && y === ghost.y) {
            this.drawGhostLabel(ghost.label, screen, halfHeight, zoom);
          }
        }

        // 이 칸에 놓인 오브젝트를 그린다. 같은 칸에 여럿 있을 수 있다.
        while (
          entityCursor < sorted.length &&
          compareEntityOrder(sorted[entityCursor]!, x, y) === 0
        ) {
          this.drawEntity(sorted[entityCursor]!, zoom);
          entityCursor += 1;
          stats.drawnEntities += 1;
        }
      }
    }

    // 색조와 어둠은 지형과 오브젝트를 모두 그린 뒤에 덮는다. 파편과 떠오르는 글자는
    // 그 위에 얹히므로(`main.ts`) 어두운 곳에서도 읽힌다.
    if (atmosphere?.tint && atmosphere.tint.alpha > 0) this.drawOverlay(atmosphere.tint.color);
    if (atmosphere?.light) this.drawDarkness(atmosphere.light, zoom);

    return stats;
  }

  /**
   * 빛의 중심 바깥을 어둡게 덮는다.
   *
   * 화면 전체를 한 번 덮는 방식이라 열 수와 무관하게 비용이 일정하다. 그라디언트를
   * 만들 수 없는 컨텍스트(헤드리스 테스트의 가짜 컨텍스트)에서는 **고른 어둠**으로
   * 떨어진다 — 도형 경로가 어떤 환경에서도 죽지 않아야 한다는 규칙(로드맵 02)과 같다.
   *
   * @param light 빛의 중심과 반경.
   * @param zoom 확대율.
   */
  private drawDarkness(light: NonNullable<Atmosphere['light']>, zoom: number): void {
    const world = gridToWorld(light.x, light.y, light.z);
    const screen = this.camera.worldToScreen(world.x, world.y);

    // 타일 반폭을 한 칸의 대표 길이로 삼아 반경을 픽셀로 옮긴다.
    const unit = (TILE_WIDTH / 2) * zoom;

    const ctx = this.ctx;
    const size = this.camera.viewport;

    ctx.save();
    // 카메라 변환 없이 화면 좌표로 덮는다.
    ctx.fillStyle = this.darknessFill(screen, light, unit);
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.restore();
  }

  /**
   * 화면 전체를 한 색으로 덮는다. 시간대 색조에 쓴다.
   *
   * @param color 덮을 색(불투명도 포함).
   */
  private drawOverlay(color: string): void {
    const ctx = this.ctx;
    const size = this.camera.viewport;

    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.restore();
  }

  /**
   * 어둠 덮개의 칠을 만든다.
   *
   * @param screen 빛의 중심 화면 좌표.
   * @param light 빛의 반경과 세기(타일 단위).
   * @param unit 타일 한 칸의 대표 픽셀 길이.
   * @returns 그라디언트 또는 고른 색.
   */
  private darknessFill(
    screen: { x: number; y: number },
    light: NonNullable<Atmosphere['light']>,
    unit: number,
  ): CanvasGradient | string {
    const ctx = this.ctx;
    if (typeof ctx.createRadialGradient !== 'function') return darkColor(light.max);

    const gradient = ctx.createRadialGradient(
      screen.x,
      screen.y,
      light.lit * unit,
      screen.x,
      screen.y,
      light.dark * unit,
    );
    // 중간 지점을 몇 개 찍어 `darknessAt`의 곡선을 그대로 옮긴다.
    for (let step = 0; step <= 4; step += 1) {
      const t = step / 4;
      const distance = light.lit + (light.dark - light.lit) * t;
      gradient.addColorStop(t, darkColor(darknessAt(distance, light.lit, light.dark, light.max)));
    }

    return gradient;
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

      if (this.sprites) {
        const zoom = layerPixels / LAYER_HEIGHT;
        const sprite = towardX ? this.sprites.sideX(block) : this.sprites.sideY(block);
        // 측면 스프라이트의 기준점은 윗면 중심이다. 레이어마다 아래로 내려 그린다.
        const anchorX = towardX ? edgeA.x - (TILE_WIDTH / 2) * zoom : edgeB.x + (TILE_WIDTH / 2) * zoom;
        const anchorY = (towardX ? edgeA.y : edgeB.y) + offsetTop;
        this.drawSprite(sprite, anchorX, anchorY, zoom);
        drawn += 1;
        continue;
      }

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

    if (this.sprites) {
      const zoom = (halfWidth * 2) / TILE_WIDTH;
      this.drawSprite(this.sprites.top(surface), center.x, center.y, zoom);
      return;
    }

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
   * 오브젝트를 그리기 순서대로 정렬한 내부 버퍼를 돌려준다.
   *
   * @param entities 정렬할 오브젝트 목록.
   * @returns 정렬된 내부 버퍼(호출자는 보관하지 않는다).
   */
  private sortEntities(entities: readonly Entity[]): Entity[] {
    this.entityBuffer.length = 0;
    for (const entity of entities) this.entityBuffer.push(entity);

    this.entityBuffer.sort((a, b) => {
      const anchorA = entityAnchor(a);
      const anchorB = entityAnchor(b);
      const diagonal = anchorA.x + anchorA.y - (anchorB.x + anchorB.y);
      if (diagonal !== 0) return diagonal;
      return anchorA.x - anchorB.x;
    });

    return this.entityBuffer;
  }

  /**
   * 오브젝트 하나를 그린다. 기준점은 그 오브젝트가 선 칸의 윗면 중심이다.
   *
   * @param entity 그릴 오브젝트.
   * @param zoom 현재 확대율.
   */
  private drawEntity(entity: Entity, zoom: number): void {
    const world = gridToWorld(entity.x, entity.y, entity.z);
    const screen = this.camera.worldToScreen(world.x, world.y);

    if (this.sprites) {
      this.drawEntitySprite(entity, screen, zoom);
      return;
    }

    switch (entity.kind) {
      case 'player':
        // 몸통은 파란 계열로 둔다. 건물 벽(베이지)과 지면(초록) 어느 쪽과도
        // 섞이지 않아야 플레이어가 항상 눈에 띈다.
        this.drawPawn(screen, zoom, '#4a86c8', '#20303f', entity.swing, 1);
        break;
      case 'npc':
        this.drawPawn(screen, zoom, `hsl(${entity.hue}, 45%, 72%)`, '#2f3542', 0, 0.85);
        break;
      case 'tree':
        this.drawTree(screen, zoom, entity.damage);
        break;
      case 'oreVein':
        this.drawOreVein(screen, zoom, entity.damage, entity.iron);
        break;
      case 'portal':
        this.drawPortal(screen, zoom, entity.inward);
        break;
      case 'building':
        this.drawBuilding(screen, zoom, entity);
        break;
    }
  }

  /**
   * 오브젝트를 스프라이트로 그린다.
   *
   * 건축 중 연출(반투명 골조·먼지·게이지)은 스프라이트로 만들 수 없으므로 도형 경로를
   * 그대로 쓴다 — 진행도에 따라 매 프레임 달라지는 그림이라 캐시할 대상이 아니다.
   *
   * @param entity 오브젝트.
   * @param screen 기준점의 화면 좌표.
   * @param zoom 확대율.
   */
  private drawEntitySprite(entity: Entity, screen: { x: number; y: number }, zoom: number): void {
    const sprites = this.sprites!;

    switch (entity.kind) {
      case 'player':
        this.drawSprite(sprites.pawn(-1), screen.x, screen.y, zoom);
        if (entity.swing > 0) this.drawSwing(screen, zoom, entity.swing);
        break;
      case 'npc':
        this.drawSprite(sprites.pawn(entity.hue), screen.x, screen.y, zoom);
        break;
      case 'tree':
        this.drawSprite(sprites.tree(this.damageStage(entity.damage)), screen.x, screen.y, zoom);
        break;
      case 'oreVein':
        this.drawSprite(
          sprites.oreVein(entity.iron, this.damageStage(entity.damage)),
          screen.x,
          screen.y,
          zoom,
        );
        break;
      // 통로는 지형에 뚫린 구멍이라 스프라이트를 따로 두지 않는다. 도형이 곧 최종 모습이다.
      case 'portal':
        this.drawPortal(screen, zoom, entity.inward);
        break;
      case 'building':
        if (entity.progress >= 1) {
          this.drawSprite(
            sprites.building(entity.style, entity.width, entity.depth),
            screen.x + ((entity.width - 1) - (entity.depth - 1)) * (TILE_WIDTH / 4) * zoom,
            screen.y + ((entity.width - 1) + (entity.depth - 1)) * (TILE_HEIGHT / 4) * zoom,
            zoom,
          );
          break;
        }
        this.drawBuilding(screen, zoom, entity);
        break;
    }
  }

  /**
   * 도구를 휘두르는 선을 그린다. 스프라이트 경로에서도 동작이 보이게 한다.
   *
   * @param screen 발이 놓인 칸의 윗면 중심.
   * @param zoom 확대율.
   * @param swing 휘두르기 진행도(0~1).
   */
  private drawSwing(screen: { x: number; y: number }, zoom: number, swing: number): void {
    const unit = TILE_HEIGHT * zoom;
    const angle = -Math.PI / 3 + swing * (Math.PI / 2);
    const originX = screen.x + unit * 0.2;
    const originY = screen.y - unit * 0.55;

    this.ctx.strokeStyle = '#c9b089';
    this.ctx.lineWidth = Math.max(1, unit * 0.09);
    this.ctx.beginPath();
    this.ctx.moveTo(originX, originY);
    this.ctx.lineTo(originX + Math.cos(angle) * unit * 0.7, originY + Math.sin(angle) * unit * 0.7);
    this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  /**
   * 캐릭터(플레이어·NPC)를 그린다. 스프라이트 대신 그림자 + 몸통 + 머리 도형이다.
   *
   * @param screen 발이 놓인 칸의 윗면 중심(화면 좌표).
   * @param zoom 확대율.
   * @param bodyColor 몸통 색.
   * @param headColor 머리 색.
   * @param swing 휘두르기 진행도(0~1). 0이면 팔을 내린 상태.
   * @param scale 크기 배수. NPC는 플레이어보다 조금 작다.
   */
  private drawPawn(
    screen: { x: number; y: number },
    zoom: number,
    bodyColor: string,
    headColor: string,
    swing: number,
    scale: number,
  ): void {
    const unit = TILE_HEIGHT * zoom * scale;
    const bodyWidth = unit * 0.42;
    const bodyHeight = unit * 0.72;
    const headRadius = unit * 0.22;

    // 발밑 그림자. 지면에 붙어 있다는 느낌을 준다.
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.beginPath();
    this.ctx.ellipse(screen.x, screen.y, bodyWidth * 0.8, bodyWidth * 0.4, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const bodyTop = screen.y - bodyHeight;
    this.ctx.fillStyle = bodyColor;
    this.ctx.beginPath();
    this.ctx.moveTo(screen.x - bodyWidth / 2, screen.y);
    this.ctx.lineTo(screen.x - bodyWidth / 2, bodyTop);
    this.ctx.lineTo(screen.x + bodyWidth / 2, bodyTop);
    this.ctx.lineTo(screen.x + bodyWidth / 2, screen.y);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = headColor;
    this.ctx.beginPath();
    this.ctx.arc(screen.x, bodyTop - headRadius * 0.8, headRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // 휘두르는 동안 도구를 나타내는 선을 앞으로 뻗는다.
    if (swing > 0) {
      const angle = -Math.PI / 3 + swing * (Math.PI / 2);
      const length = unit * 0.7;
      this.ctx.strokeStyle = '#c9b089';
      this.ctx.lineWidth = Math.max(1, unit * 0.09);
      this.ctx.beginPath();
      this.ctx.moveTo(screen.x + bodyWidth / 2, bodyTop + bodyHeight * 0.25);
      this.ctx.lineTo(
        screen.x + bodyWidth / 2 + Math.cos(angle) * length,
        bodyTop + bodyHeight * 0.25 + Math.sin(angle) * length,
      );
      this.ctx.stroke();
      this.ctx.lineWidth = 1;
    }
  }

  /**
   * 나무를 그린다. 손상도가 오르면 잎이 줄고 기울어져 곧 넘어갈 것을 알린다.
   *
   * @param screen 선 칸의 윗면 중심.
   * @param zoom 확대율.
   * @param damage 손상도(0~1).
   */
  private drawTree(screen: { x: number; y: number }, zoom: number, damage: number): void {
    const unit = TILE_HEIGHT * zoom;
    const lean = damage * unit * 0.35;
    const trunkWidth = unit * 0.2;
    const trunkHeight = unit * 0.6;
    const canopyRadius = unit * (0.62 - damage * 0.22);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    this.ctx.beginPath();
    this.ctx.ellipse(screen.x, screen.y, unit * 0.42, unit * 0.2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const topX = screen.x + lean;
    const topY = screen.y - trunkHeight;

    this.ctx.strokeStyle = '#6b4a2b';
    this.ctx.lineWidth = Math.max(1, trunkWidth);
    this.ctx.beginPath();
    this.ctx.moveTo(screen.x, screen.y);
    this.ctx.lineTo(topX, topY);
    this.ctx.stroke();
    this.ctx.lineWidth = 1;

    this.ctx.fillStyle = damage > 0.6 ? '#4c7a3f' : '#2f6b34';
    this.ctx.beginPath();
    this.ctx.arc(topX, topY - canopyRadius * 0.5, canopyRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * 광맥을 그린다. 돌덩이 위에 광석 점을 얹는다.
   *
   * @param screen 선 칸의 윗면 중심.
   * @param zoom 확대율.
   * @param damage 손상도(0~1).
   * @param iron 철광석 광맥이면 true.
   */
  private drawOreVein(
    screen: { x: number; y: number },
    zoom: number,
    damage: number,
    iron: boolean,
  ): void {
    const unit = TILE_HEIGHT * zoom;
    const size = unit * (0.62 - damage * 0.2);

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    this.ctx.beginPath();
    this.ctx.ellipse(screen.x, screen.y, size * 0.9, size * 0.4, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#71767e';
    this.ctx.beginPath();
    this.ctx.moveTo(screen.x - size, screen.y);
    this.ctx.lineTo(screen.x - size * 0.45, screen.y - size * 0.95);
    this.ctx.lineTo(screen.x + size * 0.5, screen.y - size * 0.8);
    this.ctx.lineTo(screen.x + size, screen.y);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = iron ? '#c98f5a' : '#9aa1a9';
    for (const spot of [
      { dx: -0.35, dy: -0.45 },
      { dx: 0.25, dy: -0.6 },
      { dx: 0.45, dy: -0.25 },
    ]) {
      this.ctx.beginPath();
      this.ctx.arc(screen.x + spot.dx * size, screen.y + spot.dy * size, size * 0.14, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /**
   * 건물을 그린다. 점유 영역 전체를 덮는 상자 형태이며, 건축 중이면
   * 낮은 골조와 진행 게이지로 표시한다.
   *
   * @param screen 점유 영역 기준 칸의 윗면 중심.
   * @param zoom 확대율.
   * @param entity 건물 오브젝트.
   */
  /**
   * 맵 사이를 잇는 통로를 그린다.
   *
   * 지면에 뚫린 어두운 구멍이다. 들어가는 입구(지상)와 나가는 출구(동굴)를 테두리
   * 색으로 구분한다 — 나가는 길은 밝아야 동굴 어둠 속에서 눈에 띈다.
   *
   * @param screen 칸 윗면 중심의 화면 좌표.
   * @param zoom 확대율.
   * @param inward 들어가는 입구인지 여부.
   */
  private drawPortal(screen: { x: number; y: number }, zoom: number, inward: boolean): void {
    const ctx = this.ctx;
    const radiusX = (TILE_WIDTH / 2) * 0.62 * zoom;
    const radiusY = (TILE_HEIGHT / 2) * 0.62 * zoom;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y, radiusX, radiusY, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#12151b';
    ctx.fill();
    ctx.lineWidth = Math.max(1, 2 * zoom);
    ctx.strokeStyle = inward ? '#6b5b45' : '#f0c674';
    ctx.stroke();
    ctx.restore();
  }

  private drawBuilding(
    screen: { x: number; y: number },
    zoom: number,
    entity: Extract<Entity, { kind: 'building' }>,
  ): void {
    const style = BUILDING_STYLE[entity.style];
    const halfW = (TILE_WIDTH / 2) * zoom;
    const halfH = (TILE_HEIGHT / 2) * zoom;
    const done = entity.progress >= 1;

    // 점유 영역의 중심으로 기준점을 옮긴다. entity.x/y는 좌상단 칸이다.
    const centerOffsetX = ((entity.width - 1) - (entity.depth - 1)) * halfW * 0.5;
    const centerOffsetY = ((entity.width - 1) + (entity.depth - 1)) * halfH * 0.5;
    const baseX = screen.x + centerOffsetX;
    const baseY = screen.y + centerOffsetY;

    // 밑면 마름모(점유 영역)의 반지름.
    const footHalfW = halfW * (entity.width + entity.depth) * 0.5;
    const footHalfH = halfH * (entity.width + entity.depth) * 0.5;

    const bodyHeight = TILE_HEIGHT * zoom * style.height * (done ? 1 : 0.35);

    // 벽면 두 장.
    this.ctx.fillStyle = done ? style.wallX : 'rgba(150, 130, 100, 0.55)';
    this.ctx.beginPath();
    this.ctx.moveTo(baseX + footHalfW, baseY - bodyHeight);
    this.ctx.lineTo(baseX, baseY + footHalfH - bodyHeight);
    this.ctx.lineTo(baseX, baseY + footHalfH);
    this.ctx.lineTo(baseX + footHalfW, baseY);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = done ? style.wallY : 'rgba(120, 104, 80, 0.55)';
    this.ctx.beginPath();
    this.ctx.moveTo(baseX, baseY + footHalfH - bodyHeight);
    this.ctx.lineTo(baseX - footHalfW, baseY - bodyHeight);
    this.ctx.lineTo(baseX - footHalfW, baseY);
    this.ctx.lineTo(baseX, baseY + footHalfH);
    this.ctx.closePath();
    this.ctx.fill();

    // 지붕(윗면 마름모).
    this.ctx.fillStyle = done ? style.roof : 'rgba(190, 175, 145, 0.5)';
    this.traceDiamond(baseX, baseY - bodyHeight, footHalfW, footHalfH);
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.stroke();

    if (!done) {
      this.drawDust(baseX, baseY, footHalfW, footHalfH);
      this.drawBuildProgress(baseX, baseY - bodyHeight - footHalfH, footHalfW, entity.progress);
    }
  }

  /**
   * 건축 중 먼지를 그린다(기획서 5.3의 "먼지 이펙트").
   *
   * 파티클 상태를 따로 들고 있지 않고 시각과 위치로 값을 계산한다 — 건물마다
   * 파티클 배열을 관리하면 완공·철거 때 정리할 상태가 늘어난다. 사인 곡선 몇 개로
   * 충분히 "무언가 일어나는 중"으로 읽힌다.
   *
   * @param baseX 점유 영역 중심의 화면 x.
   * @param baseY 점유 영역 중심의 화면 y.
   * @param halfWidth 밑면 반폭(px).
   * @param halfHeight 밑면 반높이(px).
   */
  private drawDust(baseX: number, baseY: number, halfWidth: number, halfHeight: number): void {
    const seconds = this.timeMs / 1000;

    // 색에는 알파를 넣지 않는다. globalAlpha와 곱해지면 너무 옅어져 보이지 않는다.
    this.ctx.fillStyle = '#efe3c6';
    for (let i = 0; i < DUST_COUNT; i += 1) {
      // 알갱이마다 위상을 달리해 한 덩어리로 뭉치지 않게 한다.
      const phase = (seconds * 1.6 + i * 0.37) % 1;
      const angle = i * ((Math.PI * 2) / DUST_COUNT) + seconds * 0.6;

      const spread = 0.35 + phase * 0.55;
      const x = baseX + Math.cos(angle) * halfWidth * spread;
      const y = baseY + Math.sin(angle) * halfHeight * spread - phase * halfHeight * 1.2;
      const radius = Math.max(1.5, halfHeight * 0.26 * (1 - phase * 0.6));

      this.ctx.globalAlpha = 0.8 * (1 - phase);
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;
  }

  /**
   * 건축 진행 게이지를 그린다.
   *
   * @param centerX 게이지 중심의 화면 x.
   * @param topY 게이지가 놓일 화면 y.
   * @param halfWidth 게이지 절반 폭(px).
   * @param progress 진행도(0~1).
   */
  private drawBuildProgress(centerX: number, topY: number, halfWidth: number, progress: number): void {
    const width = Math.max(16, halfWidth * 1.2);
    const height = Math.max(4, width * 0.12);
    const left = centerX - width / 2;
    const top = topY - height * 2;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    this.ctx.fillRect(left, top, width, height);
    this.ctx.fillStyle = '#f0c04a';
    this.ctx.fillRect(left, top, width * Math.max(0, Math.min(1, progress)), height);
  }

  /**
   * 잠긴 구역을 표시한다.
   *
   * 잠긴 칸은 어둡게 덮고, 잠금이 바뀌는 변에는 선을 긋는다. ADR 0007이 "구역 잠금이
   * 규칙이라 화면만 봐서는 경계가 보이지 않는다"를 감수 사항으로 남겨 뒀는데, 이것이
   * 그 답이다.
   *
   * @param zones 구역 표시 제공자.
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param screen 윗면 중심의 화면 좌표.
   * @param halfWidth 마름모 반폭(px).
   * @param halfHeight 마름모 반높이(px).
   */
  private drawZoneMark(
    zones: ZoneOverlay,
    x: number,
    y: number,
    screen: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
  ): void {
    const locked = zones.locked(x, y);

    if (locked) {
      this.traceDiamond(screen.x, screen.y, halfWidth, halfHeight);
      this.ctx.fillStyle = ZONE_LOCKED_FILL;
      this.ctx.fill();
    }

    // 경계선은 잠금이 바뀌는 쪽에만 긋는다. 양쪽에서 그으면 선이 두 번 겹친다.
    this.ctx.strokeStyle = ZONE_EDGE;
    this.ctx.lineWidth = 2;

    if (zones.locked(x + 1, y) !== locked) {
      this.ctx.beginPath();
      this.ctx.moveTo(screen.x + halfWidth, screen.y);
      this.ctx.lineTo(screen.x, screen.y + halfHeight);
      this.ctx.stroke();
    }
    if (zones.locked(x, y + 1) !== locked) {
      this.ctx.beginPath();
      this.ctx.moveTo(screen.x, screen.y + halfHeight);
      this.ctx.lineTo(screen.x - halfWidth, screen.y);
      this.ctx.stroke();
    }

    this.ctx.lineWidth = 1;
  }

  /**
   * 건축 미리보기의 한 칸을 그린다. 점유 영역에 속한 칸만 칠한다.
   *
   * @param ghost 미리보기 정보.
   * @param x 지금 그리는 칸의 그리드 x.
   * @param y 지금 그리는 칸의 그리드 y.
   * @param screen 그 칸 윗면 중심의 화면 좌표.
   * @param halfWidth 마름모 반폭(px).
   * @param halfHeight 마름모 반높이(px).
   */
  private drawGhostTile(
    ghost: GhostPreview,
    x: number,
    y: number,
    screen: { x: number; y: number },
    halfWidth: number,
    halfHeight: number,
  ): void {
    if (x < ghost.x || x >= ghost.x + ghost.width) return;
    if (y < ghost.y || y >= ghost.y + ghost.depth) return;

    this.traceDiamond(screen.x, screen.y, halfWidth, halfHeight);
    this.ctx.fillStyle = ghost.valid ? 'rgba(120, 220, 140, 0.45)' : 'rgba(230, 110, 110, 0.45)';
    this.ctx.fill();
    this.ctx.strokeStyle = ghost.valid ? '#8ef0a4' : '#ff9c9c';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.lineWidth = 1;
  }

  /**
   * 미리보기 이름을 커서 위에 띄운다.
   *
   * 하단 패널에도 같은 정보가 있지만, 배치하는 동안 시선은 커서에 있다. 무엇을 놓는지
   * 확인하려고 시선을 옮겨야 하면 배치가 번거로워진다.
   *
   * @param label 표시할 이름.
   * @param screen 기준 칸 윗면 중심의 화면 좌표.
   * @param halfHeight 마름모 반높이(px).
   * @param zoom 확대율.
   */
  private drawGhostLabel(
    label: string,
    screen: { x: number; y: number },
    halfHeight: number,
    zoom: number,
  ): void {
    const y = screen.y - halfHeight - 10 * zoom;

    this.ctx.font = `${Math.max(11, 12 * zoom)}px ui-monospace, monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.strokeText(label, screen.x, y);
    this.ctx.fillStyle = '#f0f3f6';
    this.ctx.fillText(label, screen.x, y);

    this.ctx.lineWidth = 1;
    this.ctx.textAlign = 'left';
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

/** 건물 외형별 색과 높이(타일 높이 배수). */
const BUILDING_STYLE: Readonly<
  Record<BuildingStyle, { roof: string; wallX: string; wallY: string; height: number }>
> = {
  house: { roof: '#b8563f', wallX: '#d9c39a', wallY: '#b8a37e', height: 1.5 },
  bigHouse: { roof: '#8e4a6b', wallX: '#dcc7a4', wallY: '#b9a482', height: 2 },
  warehouse: { roof: '#5f7d8c', wallX: '#c9b592', wallY: '#a89877', height: 1.6 },
  well: { roof: '#7a6a55', wallX: '#9aa0a6', wallY: '#7e848a', height: 0.8 },
  workbench: { roof: '#8a6f47', wallX: '#b39566', wallY: '#957b54', height: 0.7 },
  // 대장간은 어두운 벽과 달아오른 지붕으로 둔다 — 마을에서 한눈에 구분돼야
  // 동굴에 다녀온 보람이 보인다.
  forge: { roof: '#c26a3a', wallX: '#6f6a68', wallY: '#575250', height: 1.3 },
  quarry: { roof: '#7f8892', wallX: '#9aa0a6', wallY: '#7e848a', height: 0.9 },
};

/**
 * 오브젝트가 어느 칸의 순서를 따르는지 구한다.
 *
 * 여러 칸을 점유하는 건물은 **가장 앞쪽 칸**(x + depth 최대)의 순서를 쓴다.
 * 그러면 건물보다 앞에 있는 지형은 나중에 그려져 건물을 정상적으로 가리고,
 * 뒤에 있는 지형은 먼저 그려져 건물에 가려진다. 점유 영역 내부의 지형은
 * 어차피 건물이 덮으므로 순서가 문제되지 않는다.
 *
 * @param entity 대상 오브젝트.
 * @returns 정렬 기준이 되는 칸.
 */
function entityAnchor(entity: Entity): { x: number; y: number } {
  if (entity.kind === 'building') {
    return { x: entity.x + entity.width - 1, y: entity.y + entity.depth - 1 };
  }

  return { x: Math.round(entity.x), y: Math.round(entity.y) };
}

/**
 * 오브젝트의 그리기 순서를 특정 칸과 비교한다.
 *
 * @param entity 대상 오브젝트.
 * @param x 비교할 칸의 그리드 x.
 * @param y 비교할 칸의 그리드 y.
 * @returns 오브젝트가 먼저면 음수, 같은 칸이면 0, 나중이면 양수.
 */
function compareEntityOrder(entity: Entity, x: number, y: number): number {
  const anchor = entityAnchor(entity);
  const diagonal = anchor.x + anchor.y - (x + y);
  if (diagonal !== 0) return diagonal;

  return anchor.x - x;
}
