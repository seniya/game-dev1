import { FpsCounter } from '../core/FpsCounter';
import { BlockType, blockInfo } from '../core/blocks';
import type { BlockStash } from '../core/BlockStash';

/** 오버레이에 표시할 프레임별 정보. */
export interface DebugInfo {
  /** 커서가 올라간 타일. 없으면 null. */
  hovered: { x: number; y: number } | null;
  /** 커서가 올라간 열의 블록 수. 커서가 지형 위에 없으면 0. */
  hoveredHeight: number;
  /** 커서가 올라간 열의 표면 블록 타입. */
  hoveredSurface: BlockType;
  /** 이번 프레임에 윗면을 그린 열 수. */
  drawnColumns: number;
  /** 이번 프레임에 그린 측면 조각 수. */
  drawnWalls: number;
  /** 현재 확대율. */
  zoom: number;
}

/**
 * 캔버스 위에 얹는 디버그 텍스트 오버레이.
 *
 * FPS와 좌표를 캔버스에 직접 그리지 않고 DOM으로 처리해, 렌더러가 게임 화면만
 * 책임지게 한다. 갱신은 초당 몇 회로 제한한다 — 매 프레임 텍스트를 바꾸면
 * 숫자가 읽히지 않고 레이아웃 비용만 늘어난다.
 */
export class DebugOverlay {
  private readonly fpsElement: HTMLElement;
  private readonly infoElement: HTMLElement;
  private readonly stashElement: HTMLElement;
  private readonly counter = new FpsCounter();

  /** 화면 텍스트 갱신 간격(ms). */
  private readonly refreshIntervalMs = 250;
  /** 마지막 갱신 이후 누적 시간(ms). */
  private sinceRefreshMs = 0;

  /**
   * @param fpsElement FPS 숫자를 표시할 엘리먼트.
   * @param infoElement 좌표·지형 정보를 표시할 엘리먼트.
   * @param stashElement 보유 블록 수를 표시할 엘리먼트.
   */
  constructor(fpsElement: HTMLElement, infoElement: HTMLElement, stashElement: HTMLElement) {
    this.fpsElement = fpsElement;
    this.infoElement = infoElement;
    this.stashElement = stashElement;
  }

  /**
   * 프레임 정보를 반영한다. 렌더 직후 매 프레임 호출한다.
   *
   * @param frameTimeMs 직전 프레임과의 간격(ms).
   * @param info 이번 프레임의 디버그 정보.
   * @param stash 보유 블록 저장소.
   */
  update(frameTimeMs: number, info: DebugInfo, stash: BlockStash): void {
    this.counter.sample(frameTimeMs);

    this.sinceRefreshMs += frameTimeMs;
    if (this.sinceRefreshMs < this.refreshIntervalMs) return;

    this.sinceRefreshMs = 0;
    this.fpsElement.textContent = `${Math.round(this.counter.fps)} fps`;

    const tile = info.hovered
      ? `(${info.hovered.x}, ${info.hovered.y}) ${blockInfo(info.hoveredSurface).label} 높이 ${info.hoveredHeight}`
      : '(--, --)';
    this.infoElement.textContent = `타일 ${tile} · 윗면 ${info.drawnColumns} 측면 ${info.drawnWalls} · 줌 ${info.zoom.toFixed(2)}x`;

    this.stashElement.textContent = formatStash(stash);
  }
}

/**
 * 보유 블록을 한 줄 텍스트로 만든다.
 *
 * @param stash 보유 블록 저장소.
 * @returns "흙 3 · 돌 1" 형태의 문자열. 비어 있으면 안내 문구.
 */
function formatStash(stash: BlockStash): string {
  const parts: string[] = [];
  for (const type of [BlockType.DIRT, BlockType.STONE, BlockType.IRON_ORE]) {
    const count = stash.count(type);
    if (count > 0) parts.push(`${blockInfo(type).label} ${count}`);
  }

  return parts.length > 0 ? `보유 ${parts.join(' · ')}` : '보유 없음';
}
