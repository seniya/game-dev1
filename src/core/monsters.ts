/**
 * 몬스터 침입.
 *
 * 기획서 9절은 "몬스터 침입 이벤트(스토리 없이 **방어 미니게임 형태로**)"라고만 적었다.
 * 로드맵 03은 이 Phase의 위험을 "전투를 얼마나 깊게 만들 것인가"로 짚었고, 착수 시점에
 * 깊이를 먼저 정하라고 했다. 정한 깊이는 **얕다**(ADR 0017).
 *
 * - 플레이어는 다치지 않는다. 체력도 죽음도 부활도 없다.
 * - 몬스터는 건물을 **손상**시킨다. 부수지 않는다 — 되돌릴 수 없는 손실은 캐주얼 성격과
 *   어긋난다. 손상된 건물은 기능이 멈추고, 자재를 조금 들여 고친다.
 * - 해가 뜨면 남은 몬스터는 물러간다. 밤 하나가 곧 한 판이다.
 *
 * 이 세 줄이 "미니게임"의 경계다. 여기서 더 깊어지면 체력·피격·적 AI가 통째로 새 시스템이
 * 되고, 그것은 이 게임이 아니다.
 */

/** 몬스터 한 마리의 체력. 도구로 이만큼 때리면 물러간다. */
export const MONSTER_HEALTH = 3;

/** 한 칸 이동에 걸리는 시간(ms). 플레이어(180ms)보다 느리다 — 도망칠 수 있어야 한다. */
export const MONSTER_MOVE_MS = 520;

/** 건물을 한 번 두드리는 간격(ms). */
export const MONSTER_ATTACK_MS = 3_000;

/** 건물이 견디는 손상 횟수. 이만큼 맞으면 더 나빠지지 않는다. */
export const DAMAGE_LIMIT = 3;

/** 침입이 시작되는 마을 레벨. 이 전에는 방어할 것도, 지을 것도 없다. */
export const RAID_MIN_LEVEL = 4;

/** 며칠에 한 번 오는지. 매일 오면 밤이 곧 벌칙이 된다. */
export const RAID_INTERVAL_DAYS = 2;

/** 한 번에 오는 최대 마릿수. */
export const MAX_RAIDERS = 5;

/** 몬스터 하나를 물리칠 때 주는 마을 경험치. */
export const DEFEAT_REWARD = 2;

/**
 * 그 레벨에서 오는 몬스터 마릿수를 구한다.
 *
 * 레벨이 오를수록 늘지만 상한이 있다. 마을이 커지면 방어 시설도 늘어나므로 마릿수만
 * 계속 키우면 후반이 소란스럽기만 하다.
 *
 * @param level 마을 레벨.
 * @returns 마릿수. 침입이 없는 레벨이면 0.
 */
export function raidSize(level: number): number {
  if (!Number.isFinite(level) || level < RAID_MIN_LEVEL) return 0;

  return Math.min(MAX_RAIDERS, 1 + Math.floor((level - RAID_MIN_LEVEL) / 2));
}

/**
 * 그날 밤에 침입이 오는지 판단한다.
 *
 * 날짜만 보고 정한다 — 무작위로 두면 "오늘 올까"를 알 수 없어 준비할 수 없고,
 * 준비할 수 없는 방어는 미니게임이 아니라 사고다.
 *
 * @param day 며칠째인지(1부터).
 * @param level 마을 레벨.
 * @returns 오면 true.
 */
export function isRaidNight(day: number, level: number): boolean {
  if (raidSize(level) === 0) return false;
  if (!Number.isFinite(day) || day < 1) return false;

  return Math.floor(day) % RAID_INTERVAL_DAYS === 0;
}
