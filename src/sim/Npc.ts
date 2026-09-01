import { hashNoise } from '../core/random';
import { walkableNeighbors, type TilePos } from '../core/movement';
import type { Terrain } from '../core/Terrain';

/** NPC 한 칸 이동에 걸리는 시간(ms). 플레이어보다 느긋하게 걷는다. */
export const NPC_MOVE_DURATION_MS = 420;

/** 이동 사이에 머무는 최소·최대 시간(ms). */
const IDLE_MIN_MS = 900;
const IDLE_MAX_MS = 2600;

/** 집에서 벗어날 수 있는 최대 거리(타일). 마을 안에 머물게 한다. */
const WANDER_RADIUS = 6;

/** 렌더러에 넘길 NPC 위치. */
export interface NpcPose {
  /** 그리드 x(소수 가능). */
  x: number;
  /** 그리드 y(소수 가능). */
  y: number;
  /** 발이 놓인 높이(소수 가능). */
  z: number;
}

/**
 * 마을 주민.
 *
 * 기획서 5.4에 따라 "각자 정해진 시간대에 맵 내를 배회하는 단순 AI"다. 경로 탐색은
 * 하지 않는다 — 갈 수 있는 인접 칸 중 하나를 골라 한 칸씩 움직이는 것이 전부다.
 * 목적지가 없으므로 길이 막혀도 곤란해질 일이 없다.
 *
 * 무작위는 `hashNoise(id, tick, seed)`로 만든다. `Math.random`을 쓰면 같은 상태에서
 * 같은 행동을 재현할 수 없어 테스트가 불안정해진다.
 */
export class Npc {
  /** 고유 번호. */
  readonly id: number;
  /** 집으로 삼은 건물 번호. */
  readonly homeBuildingId: number;
  /** 집 앞 칸. 배회 반경의 기준점이다. */
  readonly homeTile: TilePos;
  /** 스프라이트 색을 가르는 색상값(0~359). */
  readonly hue: number;

  /** 현재 서 있는 칸. */
  private tile: TilePos;
  /** 진행 중인 이동. 없으면 null. */
  private movement: { from: TilePos; to: TilePos; elapsedMs: number } | null = null;
  /** 다음 이동까지 남은 대기 시간(ms). */
  private idleRemainingMs: number;
  /** 무작위 뽑기 횟수. 시드에 섞어 같은 값이 반복되지 않게 한다. */
  private rollCount = 0;

  /**
   * @param id 고유 번호.
   * @param homeBuildingId 집 건물 번호.
   * @param homeTile 집 앞 칸(시작 위치).
   */
  constructor(id: number, homeBuildingId: number, homeTile: TilePos) {
    this.id = id;
    this.homeBuildingId = homeBuildingId;
    this.homeTile = { x: homeTile.x, y: homeTile.y };
    this.tile = { x: homeTile.x, y: homeTile.y };
    this.hue = Math.floor(hashNoise(id, 17, 991) * 360);
    this.idleRemainingMs = this.pickIdleTime();
  }

  /** 현재 서 있는 칸(정수). */
  get position(): TilePos {
    return { x: this.tile.x, y: this.tile.y };
  }

  /** 이동 중인지 여부. */
  get moving(): boolean {
    return this.movement !== null;
  }

  /**
   * 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @param terrain 지형.
   */
  update(stepMs: number, terrain: Terrain): void {
    if (this.movement) {
      this.movement.elapsedMs += stepMs;
      if (this.movement.elapsedMs >= NPC_MOVE_DURATION_MS) {
        this.tile = this.movement.to;
        this.movement = null;
        this.idleRemainingMs = this.pickIdleTime();
      }
      return;
    }

    this.idleRemainingMs -= stepMs;
    if (this.idleRemainingMs > 0) return;

    this.startWander(terrain);
  }

  /**
   * 배회를 시작한다. 갈 수 있는 인접 칸 중 하나를 고른다.
   *
   * 집에서 너무 멀어지지 않도록, 반경을 벗어나는 칸은 후보에서 뺀다. 후보가
   * 하나도 없으면(사방이 막힌 경우) 대기 시간만 새로 잡고 넘어간다.
   *
   * @param terrain 지형.
   */
  private startWander(terrain: Terrain): void {
    const candidates = walkableNeighbors(terrain, this.tile).filter(
      (tile) => this.distanceFromHome(tile) <= WANDER_RADIUS,
    );

    if (candidates.length === 0) {
      this.idleRemainingMs = this.pickIdleTime();
      return;
    }

    const pick = Math.floor(this.roll() * candidates.length);
    this.movement = {
      from: this.tile,
      to: candidates[Math.min(pick, candidates.length - 1)]!,
      elapsedMs: 0,
    };
  }

  /**
   * 집에서의 거리를 구한다.
   *
   * @param tile 대상 칸.
   * @returns 맨해튼 거리.
   */
  private distanceFromHome(tile: TilePos): number {
    return Math.abs(tile.x - this.homeTile.x) + Math.abs(tile.y - this.homeTile.y);
  }

  /**
   * 다음 대기 시간을 뽑는다.
   *
   * @returns 대기 시간(ms).
   */
  private pickIdleTime(): number {
    return IDLE_MIN_MS + this.roll() * (IDLE_MAX_MS - IDLE_MIN_MS);
  }

  /**
   * 0 이상 1 미만의 결정적 무작위 값을 뽑는다.
   *
   * @returns 무작위 값.
   */
  private roll(): number {
    this.rollCount += 1;

    return hashNoise(this.id, this.rollCount, 3571);
  }

  /**
   * 화면에 그릴 위치를 구한다.
   *
   * @param terrain 지형(발 높이를 읽는다).
   * @returns 렌더용 위치.
   */
  pose(terrain: Terrain): NpcPose {
    if (!this.movement) {
      return {
        x: this.tile.x,
        y: this.tile.y,
        z: Math.max(0, terrain.columnHeight(this.tile.x, this.tile.y) - 1),
      };
    }

    const { from, to, elapsedMs } = this.movement;
    const progress = Math.min(1, elapsedMs / NPC_MOVE_DURATION_MS);
    const fromZ = Math.max(0, terrain.columnHeight(from.x, from.y) - 1);
    const toZ = Math.max(0, terrain.columnHeight(to.x, to.y) - 1);

    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: fromZ + (toZ - fromZ) * progress,
    };
  }
}
