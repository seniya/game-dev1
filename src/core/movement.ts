import type { Terrain } from './Terrain';

/**
 * 한 번에 오르내릴 수 있는 최대 높이 차(레이어).
 *
 * 1칸으로 제한한 것은 의도적이다. 무제한이면 지형 높낮이가 이동에 아무 의미를
 * 갖지 못해 기획서 5.1의 "건축 부지 평탄화"가 목적을 잃는다. 1칸 제한이면
 * 파고 쌓는 행위가 곧 이동로를 만드는 일이 된다.
 */
export const MAX_CLIMB = 1;

/** 4방향 이동 델타. 대각선은 지원하지 않는다. */
export const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

/** 그리드 위의 한 칸. */
export interface TilePos {
  x: number;
  y: number;
}

/**
 * 그 칸에 설 수 있는지 확인한다. 맵 안이고 지면이 있어야 한다.
 *
 * @param terrain 지형.
 * @param x 그리드 x.
 * @param y 그리드 y.
 * @returns 설 수 있으면 true.
 */
export function canStand(terrain: Terrain, x: number, y: number): boolean {
  return terrain.contains(x, y) && terrain.columnHeight(x, y) >= 1;
}

/**
 * 두 칸이 4방향으로 인접한지 확인한다. 같은 칸은 인접으로 보지 않는다.
 *
 * @param a 첫 번째 칸.
 * @param b 두 번째 칸.
 * @returns 인접하면 true.
 */
export function isAdjacent(a: TilePos, b: TilePos): boolean {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);

  return dx + dy === 1;
}

/**
 * 한 칸에서 다른 칸으로 걸어갈 수 있는지 확인한다.
 *
 * @param terrain 지형.
 * @param from 출발 칸.
 * @param to 도착 칸.
 * @returns 걸어갈 수 있으면 true.
 */
export function canWalk(terrain: Terrain, from: TilePos, to: TilePos): boolean {
  if (!isAdjacent(from, to)) return false;
  if (!canStand(terrain, to.x, to.y)) return false;
  if (!canStand(terrain, from.x, from.y)) return false;

  const climb = Math.abs(terrain.columnHeight(to.x, to.y) - terrain.columnHeight(from.x, from.y));

  return climb <= MAX_CLIMB;
}

/**
 * 그 칸에서 상호작용(파기·채집)할 수 있는 대상 칸인지 확인한다.
 *
 * 기획서 5.1·5.2에 따라 **인접한 칸만** 대상이 된다. 자기가 선 칸은 대상이
 * 아니다 — 발밑을 파면 플레이어 위치와 지형이 어긋나기 때문이다.
 *
 * @param terrain 지형.
 * @param actor 행동하는 쪽의 칸.
 * @param target 대상 칸.
 * @returns 상호작용 가능하면 true.
 */
export function canInteract(terrain: Terrain, actor: TilePos, target: TilePos): boolean {
  if (!isAdjacent(actor, target)) return false;

  return terrain.contains(target.x, target.y);
}

/**
 * 걸어갈 수 있는 인접 칸을 모은다. NPC 배회(Phase 7)와 테스트에서 쓴다.
 *
 * @param terrain 지형.
 * @param from 기준 칸.
 * @returns 이동 가능한 인접 칸 목록.
 */
export function walkableNeighbors(terrain: Terrain, from: TilePos): TilePos[] {
  const result: TilePos[] = [];

  for (const direction of DIRECTIONS) {
    const to = { x: from.x + direction.dx, y: from.y + direction.dy };
    if (canWalk(terrain, from, to)) result.push(to);
  }

  return result;
}
