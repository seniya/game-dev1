/**
 * 낮과 밤.
 *
 * 기획서 8절은 낮밤 사이클을 MVP 제외 항목으로 뒀다. 로드맵 03이 이것을 넣는 이유는
 * 분위기 때문이 아니라 **뒤따르는 두 Phase의 전제**이기 때문이다 — 기획서 5.4의 NPC는
 * "정해진 시간대에 배회"하고, 9절의 몬스터 침입은 밤에 오는 것이 자연스럽다.
 *
 * 시각은 **누적 시뮬레이션 시간에서 파생된다.** 따로 저장하지 않는다 — 마을 레벨에서
 * 파생되는 배수형 보너스를 저장하지 않는 것과 같은 이유다(ADR 0011). 되살릴 때 누적
 * 시간만 알면 같은 시각이 나오고, 저장 형식을 바꾸지 않아도 된다.
 */

/**
 * 하루 길이(게임 시간, ms).
 *
 * 자동 플레이 봇이 마을 레벨 10에 닿는 데 약 5분이 걸리고, 봇 5분은 사람 기준 40~60분에
 * 해당한다(ADR 0011). 하루를 4분으로 두면 첫 세션에 열 번 남짓 해가 뜨고 진다 —
 * 사이클이 있다는 것이 분명히 전달되면서도, 한 번의 채집 나들이가 밤에 잘리지 않는 길이다.
 */
export const DAY_LENGTH_MS = 4 * 60_000;

/**
 * 게임 시작 시각(하루 안에서의 위치, 0~1).
 *
 * 아침(약 07:40)에 시작한다. 새벽이 막 끝난 자리다 — 처음 켠 사람이 어두운 화면을 보면
 * 무엇을 해야 할지 찾기 어렵고, 그렇다고 정오에 시작하면 첫 밤이 너무 빨리 온다.
 */
export const START_OF_DAY = 0.32;

/** 하루의 구간. */
export const DayPhase = {
  /** 새벽. 밝아지는 중이다. */
  DAWN: 'dawn',
  /** 낮. */
  DAY: 'day',
  /** 해질녘. 어두워지는 중이다. */
  DUSK: 'dusk',
  /** 밤. */
  NIGHT: 'night',
} as const;

/** 하루 구간 값. */
export type DayPhase = (typeof DayPhase)[keyof typeof DayPhase];

/** 구간별 표시 이름. */
const PHASE_LABEL: Readonly<Record<DayPhase, string>> = {
  [DayPhase.DAWN]: '새벽',
  [DayPhase.DAY]: '낮',
  [DayPhase.DUSK]: '해질녘',
  [DayPhase.NIGHT]: '밤',
};

/**
 * 구간 경계(하루 안에서의 위치, 0~1).
 *
 * 낮이 가장 길다. 밤은 짧게 둔다 — 밤에는 시야가 좁아 채집이 불편하므로, 길면 기다리는
 * 시간이 된다. 새벽과 해질녘은 짧은 전환 구간이다.
 */
const DAWN_START = 0.2;
const DAY_START = 0.3;
const DUSK_START = 0.72;
const NIGHT_START = 0.82;

/**
 * 하루 안에서의 위치를 구한다.
 *
 * @param elapsedMs 누적 시뮬레이션 시간(ms).
 * @param dayLengthMs 하루 길이(ms).
 * @returns 0~1 사이의 위치. 0이 자정 직후다.
 */
export function timeOfDay(elapsedMs: number, dayLengthMs: number = DAY_LENGTH_MS): number {
  if (!Number.isFinite(elapsedMs) || dayLengthMs <= 0) return START_OF_DAY;

  const raw = (elapsedMs / dayLengthMs + START_OF_DAY) % 1;

  return raw < 0 ? raw + 1 : raw;
}

/**
 * 며칠째인지 구한다. 표시에만 쓴다.
 *
 * @param elapsedMs 누적 시뮬레이션 시간(ms).
 * @param dayLengthMs 하루 길이(ms).
 * @returns 1부터 시작하는 날짜.
 */
export function dayNumber(elapsedMs: number, dayLengthMs: number = DAY_LENGTH_MS): number {
  if (!Number.isFinite(elapsedMs) || dayLengthMs <= 0) return 1;

  return Math.floor(Math.max(0, elapsedMs) / dayLengthMs + START_OF_DAY) + 1;
}

/**
 * 그 시각의 구간을 구한다.
 *
 * @param time 하루 안에서의 위치(0~1).
 * @returns 구간.
 */
export function phaseAt(time: number): DayPhase {
  if (time < DAWN_START) return DayPhase.NIGHT;
  if (time < DAY_START) return DayPhase.DAWN;
  if (time < DUSK_START) return DayPhase.DAY;
  if (time < NIGHT_START) return DayPhase.DUSK;

  return DayPhase.NIGHT;
}

/**
 * 구간 이름을 돌려준다.
 *
 * @param phase 구간.
 * @returns 표시 이름.
 */
export function phaseLabel(phase: DayPhase): string {
  return PHASE_LABEL[phase];
}

/**
 * 그 시각이 밤인지 알려준다. 시야와 이후 Phase의 사건 판정에 쓴다.
 *
 * @param time 하루 안에서의 위치(0~1).
 * @returns 밤이면 true.
 */
export function isNight(time: number): boolean {
  return phaseAt(time) === DayPhase.NIGHT;
}

/**
 * 그 시각의 어둠 정도를 구한다(0~1).
 *
 * 구간을 계단처럼 끊지 않고 이어 붙인다 — 해가 툭 꺼지면 사이클이 사건처럼 보이고,
 * 이 게임에서 낮밤은 사건이 아니라 배경이다.
 *
 * @param time 하루 안에서의 위치(0~1).
 * @returns 0(대낮)~1(한밤).
 */
export function nightAmount(time: number): number {
  if (time >= DAY_START && time < DUSK_START) return 0;
  if (time >= NIGHT_START || time < DAWN_START) return 1;

  // 해질녘은 0 → 1, 새벽은 1 → 0으로 이어진다.
  if (time >= DUSK_START) return (time - DUSK_START) / (NIGHT_START - DUSK_START);

  return 1 - (time - DAWN_START) / (DAY_START - DAWN_START);
}

/** 화면에 얹는 색조. */
export interface DayTint {
  /** CSS 색. */
  color: string;
  /** 불투명도(0~1). 0이면 얹지 않는다. */
  alpha: number;
}

/** 한밤의 색조. 푸른 기가 돌아야 달빛처럼 읽힌다. */
const NIGHT_TINT = { r: 18, g: 28, b: 66 } as const;

/** 새벽·해질녘의 색조. 따뜻한 주황이다. */
const TWILIGHT_TINT = { r: 122, g: 62, b: 40 } as const;

/** 한밤에 화면을 덮는 최대 불투명도. */
const MAX_NIGHT_ALPHA = 0.5;

/** 전환 구간에서 노을이 가장 짙어지는 세기. */
const MAX_TWILIGHT_ALPHA = 0.28;

/**
 * 그 시각에 화면에 얹을 색조를 구한다.
 *
 * 밤의 푸른 색조와 전환 구간의 노을을 섞는다. 노을은 전환의 한가운데에서 가장 짙다 —
 * 해가 지평선에 걸린 순간이 가장 붉다.
 *
 * @param time 하루 안에서의 위치(0~1).
 * @returns 색조. 대낮이면 불투명도가 0이다.
 */
export function dayTint(time: number): DayTint {
  const night = nightAmount(time);
  if (night <= 0) return { color: 'rgba(0, 0, 0, 0)', alpha: 0 };

  // 전환의 한가운데(0.5)에서 1이 되는 삼각 곡선.
  const twilight = 1 - Math.abs(night - 0.5) * 2;

  const nightAlpha = night * MAX_NIGHT_ALPHA;
  const twilightAlpha = twilight * MAX_TWILIGHT_ALPHA;
  const alpha = nightAlpha + twilightAlpha;
  if (alpha <= 0) return { color: 'rgba(0, 0, 0, 0)', alpha: 0 };

  // 두 색을 각자의 세기로 섞는다.
  const mix = twilightAlpha / alpha;
  const r = Math.round(NIGHT_TINT.r * (1 - mix) + TWILIGHT_TINT.r * mix);
  const g = Math.round(NIGHT_TINT.g * (1 - mix) + TWILIGHT_TINT.g * mix);
  const b = Math.round(NIGHT_TINT.b * (1 - mix) + TWILIGHT_TINT.b * mix);

  return { color: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`, alpha };
}

/**
 * 시각을 시계 문구로 만든다.
 *
 * 하루를 24시간에 대응시킨다. 실제 길이는 몇 분이지만, 사람이 "지금 몇 시쯤인가"를
 * 읽는 데는 시계가 가장 빠르다.
 *
 * @param time 하루 안에서의 위치(0~1).
 * @returns "07:30" 형태의 문자열.
 */
export function clockLabel(time: number): string {
  const totalMinutes = Math.floor(time * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
