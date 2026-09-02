import type { TilePos } from './movement';
import type { Terrain } from './Terrain';

/**
 * 커서를 플레이어에게서 얼마나 멀리 둘 수 있는지(축별 최대 거리, 타일).
 *
 * 채집·파기는 규칙이 인접만 허용하므로(`canInteract`) 이 범위가 필요 없지만,
 * **건축은 사거리 제한이 없다** — 마우스로는 화면 어디에나 놓을 수 있었다.
 * 키보드로도 부지를 고를 수 있어야 하므로 몇 칸은 벗어날 수 있게 한다.
 * 범위를 무한으로 두지 않는 이유는 카메라가 플레이어를 따라가기 때문이다.
 * 커서가 화면 밖으로 나가면 무엇을 겨냥하는지 보이지 않는다.
 */
export const CURSOR_RANGE = 6;

/** 플레이어 기준 커서 위치. */
export interface CursorOffset {
  /** 그리드 x 방향 거리. */
  dx: number;
  /** 그리드 y 방향 거리. */
  dy: number;
}

/**
 * 시작 오프셋. 플레이어 앞 한 칸(+x)이다.
 *
 * 커서를 절대 좌표가 아니라 **플레이어 기준 오프셋**으로 두는 이유는, 걸어가면
 * 커서가 함께 따라와야 하기 때문이다. 절대 좌표로 두면 한 걸음마다 커서를 다시
 * 맞춰야 하고, 그러면 "걸어가서 앞의 나무를 팬다"는 기본 흐름이 무너진다.
 */
export const FORWARD_OFFSET: Readonly<CursorOffset> = { dx: 1, dy: 0 };

/**
 * 값을 범위 안으로 자른다.
 *
 * @param value 자를 값.
 * @param limit 절대값 상한.
 * @returns 범위 안의 값.
 */
function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * 커서를 한 칸 옮긴다. 범위를 벗어나면 경계에 머문다.
 *
 * @param offset 지금 오프셋.
 * @param dx 옮길 x 방향.
 * @param dy 옮길 y 방향.
 * @param range 축별 최대 거리.
 * @returns 새 오프셋.
 */
export function stepOffset(
  offset: CursorOffset,
  dx: number,
  dy: number,
  range: number = CURSOR_RANGE,
): CursorOffset {
  return {
    dx: clamp(offset.dx + dx, range),
    dy: clamp(offset.dy + dy, range),
  };
}

/**
 * 걸어간 방향을 오프셋으로 바꾼다. 그 방향 인접 한 칸이다.
 *
 * @param dx 걸은 x 방향.
 * @param dy 걸은 y 방향.
 * @returns 오프셋. 방향이 없으면 null.
 */
export function facingOffset(dx: number, dy: number): CursorOffset | null {
  if (dx === 0 && dy === 0) return null;

  return { dx: Math.sign(dx), dy: Math.sign(dy) };
}

/**
 * 오프셋을 실제 칸으로 바꾼다. 맵을 벗어나면 맵 안으로 당긴다.
 *
 * 맵 밖을 겨냥하면 null을 주는 방법도 있지만, 그러면 화면에서 커서가 사라져
 * "지금 무엇을 겨냥하고 있는가"를 잃는다. 경계에 붙여 두는 편이 낫다.
 *
 * @param terrain 지형(맵 크기를 얻는다).
 * @param player 플레이어가 선 칸.
 * @param offset 커서 오프셋.
 * @returns 겨냥한 칸.
 */
export function resolveCursor(
  terrain: Terrain,
  player: TilePos,
  offset: CursorOffset,
): TilePos {
  return {
    x: Math.max(0, Math.min(terrain.width - 1, player.x + offset.dx)),
    y: Math.max(0, Math.min(terrain.height - 1, player.y + offset.dy)),
  };
}

/** 지금 대상을 정하는 입력. */
export type CursorSource = 'keyboard' | 'pointer';

/**
 * 지금 무엇을 겨냥하고 있는지를 들고 있는 커서.
 *
 * 예전에는 행동 대상이 마우스가 올라간 칸(`PointerControls.hovered`) 하나뿐이라,
 * 마우스가 없으면 **대상 자체를 고를 수 없어** 키보드만으로는 아무 행동도 할 수
 * 없었다. 이 클래스가 대상을 입력 장치에서 떼어낸다.
 *
 * 두 입력이 같은 대상을 두고 다투므로 규칙은 하나다 — **마지막에 쓴 입력이 이긴다.**
 * 마우스를 움직이면 마우스가, 겨냥 키를 누르거나 걸으면 키보드가 대상을 정한다.
 * 마우스를 캔버스 밖으로 빼면 키보드 커서로 돌아온다.
 */
export class TargetCursor {
  /** 플레이어 기준 커서 위치. */
  private offset: CursorOffset = { ...FORWARD_OFFSET };

  /** 마우스가 마지막으로 가리킨 칸. */
  private pointerTile: TilePos | null = null;

  /** 지금 대상을 정하는 입력. */
  private active: CursorSource = 'keyboard';

  /** 커서를 옮길 수 있는 최대 거리. */
  private readonly range: number;

  /**
   * @param range 축별 최대 거리. 기본값은 `CURSOR_RANGE`.
   */
  constructor(range: number = CURSOR_RANGE) {
    this.range = range;
  }

  /** 지금 대상을 정하는 입력. */
  get source(): CursorSource {
    return this.active;
  }

  /** 키보드 커서의 오프셋. 표시와 테스트에서 쓴다. */
  get keyboardOffset(): Readonly<CursorOffset> {
    return this.offset;
  }

  /**
   * 겨냥 키로 커서를 옮긴다.
   *
   * @param dx 옮길 x 방향.
   * @param dy 옮길 y 방향.
   */
  aimBy(dx: number, dy: number): void {
    this.offset = stepOffset(this.offset, dx, dy, this.range);
    this.active = 'keyboard';
  }

  /**
   * 걸어간 방향으로 커서를 되잡는다.
   *
   * 걷기는 곧 "저쪽을 향한다"는 뜻이므로 대상도 그쪽으로 따라가는 것이 자연스럽다.
   * 다만 **건축 모드에서는 되잡지 않는다** — 부지를 멀리 찍어 두고 걸어가 각도를
   * 보는 것이 건축의 흐름이고, 한 걸음마다 커서가 발밑으로 끌려오면 그것이 불가능하다.
   *
   * @param dx 걸은 x 방향.
   * @param dy 걸은 y 방향.
   * @param keepAim 커서를 그대로 둘지 여부(건축 모드에서 true).
   */
  faceTowards(dx: number, dy: number, keepAim = false): void {
    this.active = 'keyboard';
    if (keepAim) return;

    const facing = facingOffset(dx, dy);
    if (facing) this.offset = facing;
  }

  /**
   * 마우스가 가리키는 칸을 알린다. 매 프레임 불러도 된다.
   *
   * 같은 칸이 계속 들어오면 마우스가 움직이지 않은 것이므로 대상을 빼앗지 않는다.
   * 그래야 마우스를 책상에 둔 채 키보드로 플레이할 수 있다.
   *
   * @param tile 마우스가 가리키는 칸. 캔버스 밖이면 null.
   */
  setPointer(tile: TilePos | null): void {
    const moved =
      tile !== null &&
      (this.pointerTile === null || this.pointerTile.x !== tile.x || this.pointerTile.y !== tile.y);

    this.pointerTile = tile;

    if (moved) this.active = 'pointer';
    else if (tile === null && this.active === 'pointer') this.active = 'keyboard';
  }

  /**
   * 지금 겨냥한 칸.
   *
   * @param terrain 지형.
   * @param player 플레이어가 선 칸.
   * @returns 대상 칸. 마우스가 맵 밖을 가리키고 있으면 null이 될 수 있다.
   */
  tile(terrain: Terrain, player: TilePos): TilePos | null {
    if (this.active === 'pointer') return this.pointerTile;

    return resolveCursor(terrain, player, this.offset);
  }
}
