/** 캐릭터가 마지막으로 바라본 4방향. */
export type ActorFacing = 'east' | 'west' | 'south' | 'north';

/** 이동을 시작하기 전 기본으로 바라보는 방향. */
export const DEFAULT_ACTOR_FACING: ActorFacing = 'south';

/**
 * 타일 이동 델타를 캐릭터가 바라볼 방향으로 바꾼다.
 *
 * @param dx x축 이동량.
 * @param dy y축 이동량.
 * @param fallback 이동량이 4방향이 아닐 때 유지할 방향.
 * @returns 캐릭터가 바라볼 방향.
 */
export function facingFromDelta(dx: number, dy: number, fallback: ActorFacing = DEFAULT_ACTOR_FACING): ActorFacing {
  if (dx > 0 && dy === 0) return 'east';
  if (dx < 0 && dy === 0) return 'west';
  if (dy > 0 && dx === 0) return 'south';
  if (dy < 0 && dx === 0) return 'north';

  return fallback;
}

/**
 * 0~1 이동 진행도를 부드러운 가감속 곡선으로 바꾼다.
 *
 * @param progress 선형 진행도.
 * @returns 양 끝에서 속도가 0인 보간 진행도.
 */
export function easeWalk(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));

  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * 스프라이트 캐시에 쓸 보행 진행도를 유한한 프레임으로 묶는다.
 *
 * @param progress 선형 이동 진행도.
 * @param frames 한 걸음 안에서 나눌 구간 수.
 * @returns 0~1 사이의 프레임 진행도.
 */
export function quantizeStride(progress: number, frames = 6): number {
  const safeFrames = Math.max(1, Math.floor(frames));
  const clamped = Math.max(0, Math.min(1, progress));

  return Math.round(clamped * safeFrames) / safeFrames;
}
