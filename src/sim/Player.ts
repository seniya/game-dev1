import { canWalk, type TilePos } from '../core/movement';
import { DEFAULT_ACTOR_FACING, easeWalk, facingFromDelta, type ActorFacing } from '../core/actorMotion';
import type { PlayerSave } from '../core/save';
import type { Terrain } from '../core/Terrain';
import { ToolKind, ToolTier, type Tool } from '../core/tools';

/** 한 칸 이동에 걸리는 시간(ms). */
export const MOVE_DURATION_MS = 180;

/** 도구 한 번 휘두르는 데 걸리는 시간(ms). 이 동안은 다른 행동을 받지 않는다. */
export const SWING_DURATION_MS = 220;

/** 진행 중인 이동. */
interface Movement {
  /** 출발 칸. */
  from: TilePos;
  /** 도착 칸. */
  to: TilePos;
  /** 시작 후 흐른 시간(ms). */
  elapsedMs: number;
}

/** 렌더러에 넘길 플레이어 위치. 이동 중에는 소수 좌표가 된다. */
export interface PlayerPose {
  /** 그리드 x(소수 가능). */
  x: number;
  /** 그리드 y(소수 가능). */
  y: number;
  /** 발이 놓인 높이(소수 가능). 열 높이를 보간한 값이다. */
  z: number;
  /** 도구를 휘두르는 중인지. 0~1 진행도. 휘두르지 않으면 0. */
  swing: number;
  /** 마지막으로 이동한 방향. 정지 중에도 마지막 방향을 유지한다. */
  facing: ActorFacing;
  /** 한 걸음 안에서의 선형 진행도. 정지 중이면 0이다. */
  stride: number;
}

/**
 * 플레이어.
 *
 * 논리 위치는 항상 정수 타일이며, 이동 중에는 출발·도착 칸 사이를 보간해 화면에
 * 그린다. 상호작용 판정은 정수 위치로만 하므로 "이동 중에 어느 칸에 있는가"라는
 * 애매함이 생기지 않는다 — 이동이 끝난 뒤에만 도착 칸의 주인이 된다.
 */
export class Player {
  /** 현재 서 있는 칸. 이동 중이면 출발 칸을 유지한다. */
  private tile: TilePos;
  /** 진행 중인 이동. 없으면 null. */
  private movement: Movement | null = null;
  /** 휘두르기 남은 시간(ms). 0이면 휘두르지 않는 상태. */
  private swingRemainingMs = 0;
  /** 마지막으로 이동한 방향. 렌더링에서 머리와 앞팔 위치를 정한다. */
  private facing: ActorFacing = DEFAULT_ACTOR_FACING;

  /** 보유 도구 슬롯. 기획서 5.2의 도끼/곡괭이/삽. */
  private readonly tools: Tool[] = [
    { kind: ToolKind.SHOVEL, tier: ToolTier.BASIC },
    { kind: ToolKind.PICKAXE, tier: ToolTier.BASIC },
    { kind: ToolKind.AXE, tier: ToolTier.BASIC },
  ];

  /** 선택된 도구 슬롯 번호. */
  private toolIndex = 0;

  /**
   * 이동 속도 배수. 마을 레벨 보상으로 오른다.
   *
   * 값을 따로 저장하지 않는다 — 레벨에서 파생되므로 되살릴 때 다시 계산하면 된다.
   */
  private speed = 1;

  /**
   * @param x 시작 그리드 x.
   * @param y 시작 그리드 y.
   */
  constructor(x: number, y: number) {
    this.tile = { x, y };
  }

  /** 현재 서 있는 칸(정수). */
  get position(): TilePos {
    return { x: this.tile.x, y: this.tile.y };
  }

  /** 이동 중인지 여부. */
  get moving(): boolean {
    return this.movement !== null;
  }

  /** 도구를 휘두르는 중인지 여부. */
  get swinging(): boolean {
    return this.swingRemainingMs > 0;
  }

  /** 새 행동을 받을 수 있는 상태인지. */
  get idle(): boolean {
    return !this.moving && !this.swinging;
  }

  /** 선택된 도구. */
  get tool(): Tool {
    return this.tools[this.toolIndex]!;
  }

  /** 선택된 도구 슬롯 번호. */
  get selectedSlot(): number {
    return this.toolIndex;
  }

  /** 보유 도구 슬롯 수. */
  get slotCount(): number {
    return this.tools.length;
  }

  /**
   * 플레이어를 다른 칸에 세운다.
   *
   * 걷기가 아니라 **자리를 옮기는 것**이다. 맵 이동처럼 인접 판정과 등반 한계가
   * 의미를 잃는 경우에만 쓴다. 진행 중이던 이동과 휘두르기는 취소한다 —
   * 다른 맵에서 시작된 동작을 이어 갈 이유가 없다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   */
  placeAt(x: number, y: number): void {
    this.tile = { x, y };
    this.movement = null;
    this.swingRemainingMs = 0;
  }

  /**
   * 이동 속도 배수를 설정한다.
   *
   * @param multiplier 배수. 1 이상만 받는다.
   */
  setSpeedMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier < 1) return;
    this.speed = multiplier;
  }

  /** 한 칸 이동에 걸리는 시간(ms). 속도 보너스가 반영된 값이다. */
  get moveDurationMs(): number {
    return MOVE_DURATION_MS / this.speed;
  }

  /**
   * 도구 슬롯을 고른다. 범위를 벗어난 번호는 무시한다.
   *
   * @param index 슬롯 번호(0부터).
   */
  selectTool(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.tools.length) return;
    this.toolIndex = index;
  }

  /**
   * 도구를 상위 등급으로 올린다. Phase 8의 마을 레벨 보상에서 호출한다.
   *
   * @param kind 올릴 도구 종류.
   * @param tier 새 등급. 현재 등급보다 낮으면 무시한다.
   * @returns 실제로 올렸으면 true.
   */
  upgradeTool(kind: ToolKind, tier: ToolTier): boolean {
    const index = this.tools.findIndex((tool) => tool.kind === kind);
    if (index < 0) return false;
    if (this.tools[index]!.tier >= tier) return false;

    this.tools[index] = { kind, tier };
    return true;
  }

  /**
   * 인접 칸으로 이동을 시작한다.
   *
   * @param terrain 지형.
   * @param dx x 방향 델타(-1, 0, 1).
   * @param dy y 방향 델타(-1, 0, 1).
   * @returns 이동을 시작했으면 true.
   */
  tryMove(terrain: Terrain, dx: number, dy: number): boolean {
    if (!this.idle) return false;

    const to = { x: this.tile.x + dx, y: this.tile.y + dy };
    if (!canWalk(terrain, this.tile, to)) return false;

    this.facing = facingFromDelta(dx, dy, this.facing);
    this.movement = { from: this.tile, to, elapsedMs: 0 };
    return true;
  }

  /**
   * 도구 휘두르기를 시작한다. 실제 파기·채집 판정은 호출부가 한다 —
   * 플레이어는 "지금 휘두르는 중"이라는 상태만 갖는다.
   *
   * @returns 휘두르기를 시작했으면 true.
   */
  trySwing(): boolean {
    if (!this.idle) return false;

    this.swingRemainingMs = SWING_DURATION_MS;
    return true;
  }

  /**
   * 시뮬레이션을 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  update(stepMs: number): void {
    if (this.swingRemainingMs > 0) {
      this.swingRemainingMs = Math.max(0, this.swingRemainingMs - stepMs);
    }

    if (this.movement) {
      this.movement.elapsedMs += stepMs;
      if (this.movement.elapsedMs >= this.moveDurationMs) {
        this.tile = this.movement.to;
        this.movement = null;
      }
    }
  }

  /**
   * 저장용 표현으로 바꾼다.
   *
   * 이동·휘두르기 같은 진행 중 상태는 담지 않는다. 불러온 순간 가만히 서 있는 것이
   * 자연스럽고, 중간 상태를 되살리면 저장 시점의 애매한 프레임이 그대로 재현된다.
   *
   * @returns 저장 데이터.
   */
  toSave(): PlayerSave {
    return {
      x: this.tile.x,
      y: this.tile.y,
      tools: this.tools.map((tool) => ({ kind: tool.kind, tier: tool.tier })),
      selectedSlot: this.toolIndex,
    };
  }

  /**
   * 저장에서 플레이어를 되살린다.
   *
   * @param data 저장 데이터.
   * @returns 되살린 플레이어. 읽을 수 없으면 null.
   */
  static fromSave(data: PlayerSave): Player | null {
    if (!Number.isInteger(data.x) || !Number.isInteger(data.y)) return null;
    if (!Array.isArray(data.tools) || data.tools.length === 0) return null;

    const player = new Player(data.x, data.y);

    for (const saved of data.tools) {
      if (typeof saved.kind !== 'string') continue;
      if (!Number.isInteger(saved.tier)) continue;
      player.upgradeTool(saved.kind, saved.tier);
    }
    player.selectTool(data.selectedSlot);

    return player;
  }

  /**
   * 지형 변형으로 발밑이 사라졌을 때 위치를 되잡는다.
   *
   * 플레이어는 자기 발밑을 팔 수 없지만, 옆칸을 파거나 쌓으면 이동 가능성이
   * 바뀔 수 있다. 발밑 자체가 없어지는 경우(외부에서 지형을 바꾼 경우)에는
   * 설 수 있는 인접 칸으로 밀어낸다.
   *
   * @param terrain 지형.
   * @returns 위치를 옮겼으면 true.
   */
  settle(terrain: Terrain): boolean {
    if (terrain.columnHeight(this.tile.x, this.tile.y) >= 1) return false;

    for (const direction of [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ]) {
      const candidate = { x: this.tile.x + direction.dx, y: this.tile.y + direction.dy };
      if (terrain.contains(candidate.x, candidate.y) && terrain.columnHeight(candidate.x, candidate.y) >= 1) {
        this.tile = candidate;
        this.movement = null;
        return true;
      }
    }

    return false;
  }

  /**
   * 화면에 그릴 위치를 구한다. 이동 중이면 출발·도착 칸 사이를 보간한다.
   *
   * 한 칸 이동이 180ms(60fps에서 약 11스텝)라 스텝 단위 보간만으로 충분히
   * 부드럽다. 스텝 사이를 더 쪼개는 alpha 보간은 쓰지 않는다.
   *
   * @param terrain 지형(발 높이를 읽는다).
   * @returns 렌더용 위치.
   */
  pose(terrain: Terrain): PlayerPose {
    const swing = this.swingRemainingMs > 0 ? 1 - this.swingRemainingMs / SWING_DURATION_MS : 0;

    if (!this.movement) {
      return {
        x: this.tile.x,
        y: this.tile.y,
        z: Math.max(0, terrain.columnHeight(this.tile.x, this.tile.y) - 1),
        swing,
        facing: this.facing,
        stride: 0,
      };
    }

    const { from, to, elapsedMs } = this.movement;
    const stride = Math.min(1, elapsedMs / this.moveDurationMs);
    const progress = easeWalk(stride);

    const fromZ = Math.max(0, terrain.columnHeight(from.x, from.y) - 1);
    const toZ = Math.max(0, terrain.columnHeight(to.x, to.y) - 1);

    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      z: fromZ + (toZ - fromZ) * progress,
      swing,
      facing: this.facing,
      stride,
    };
  }
}
