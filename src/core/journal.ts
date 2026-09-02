import type { ActionFailure } from '../sim/Game';

/**
 * 플레이 기록.
 *
 * 다른 사람에게 게임을 건네고 "어땠어요?"라고 물으면 "그냥 어렵던데요"가 돌아온다.
 * 무엇을 몇 분에 했고 어디서 멈췄는지는 **게임이 스스로 남겨야** 알 수 있다
 * (로드맵 05 Phase 3).
 *
 * 담는 것은 **시각·사건·횟수**뿐이다. 개인을 식별할 것은 담지 않고, 서버로 보내지도
 * 않는다 — 정적 페이지이고, 남의 플레이를 몰래 수집하지 않는다. 기록은 브라우저 안에만
 * 남으며, 사람이 스스로 복사해 보낼 때만 밖으로 나간다.
 */

/** 남기는 이정표. */
export const Milestone = {
  /** 첫 채집. */
  FIRST_HARVEST: 'firstHarvest',
  /** 첫 예치. */
  FIRST_DEPOSIT: 'firstDeposit',
  /** 첫 착공. */
  FIRST_BUILD: 'firstBuild',
  /** 첫 주민 이주. */
  FIRST_RESIDENT: 'firstResident',
  /** 첫 요청 완료. */
  FIRST_REQUEST: 'firstRequest',
  /** 첫 동굴 진입. */
  FIRST_CAVE: 'firstCave',
  /** 첫 침입. */
  FIRST_RAID: 'firstRaid',
  /** 첫 수리. */
  FIRST_REPAIR: 'firstRepair',
  /** 첫 일터 배정. */
  FIRST_JOB: 'firstJob',
} as const;

/** 이정표 값. */
export type Milestone = (typeof Milestone)[keyof typeof Milestone];

/** 이정표 표시 이름. */
const MILESTONE_LABEL: Readonly<Record<Milestone, string>> = {
  [Milestone.FIRST_HARVEST]: '첫 채집',
  [Milestone.FIRST_DEPOSIT]: '첫 예치',
  [Milestone.FIRST_BUILD]: '첫 착공',
  [Milestone.FIRST_RESIDENT]: '첫 주민',
  [Milestone.FIRST_REQUEST]: '첫 요청 완료',
  [Milestone.FIRST_CAVE]: '첫 동굴',
  [Milestone.FIRST_RAID]: '첫 침입',
  [Milestone.FIRST_REPAIR]: '첫 수리',
  [Milestone.FIRST_JOB]: '첫 일터 배정',
};

/** 이정표를 적는 순서. 겪는 순서대로 둔다. */
export const MILESTONE_ORDER: readonly Milestone[] = [
  Milestone.FIRST_HARVEST,
  Milestone.FIRST_DEPOSIT,
  Milestone.FIRST_BUILD,
  Milestone.FIRST_RESIDENT,
  Milestone.FIRST_REQUEST,
  Milestone.FIRST_JOB,
  Milestone.FIRST_CAVE,
  Milestone.FIRST_RAID,
  Milestone.FIRST_REPAIR,
];

/** 거절 사유 표시 이름. 기록을 읽는 사람이 무슨 막힘인지 알아야 한다. */
const FAILURE_LABEL: Partial<Record<ActionFailure, string>> = {
  notAdjacent: '너무 멀어서',
  noMaterial: '자재가 없어서',
  badPlacement: '놓을 자리가 아니어서',
  inventoryFull: '손이 가득 차서',
  zoneLocked: '구역이 잠겨서',
  wrongTool: '도구가 맞지 않아서',
  noBlueprint: '설계도를 고르지 않아서',
  mapLocked: '아직 들어갈 수 없어서',
  notPortal: '통로가 아니어서',
  notVillage: '마을이 아니어서',
  noWorker: '일할 주민이 없어서',
  noWorkplace: '일터가 아니어서',
  empty: '팔 것이 없어서',
  blocked: '막혀서',
};

/** 기록 한 벌. */
export interface JournalData {
  /** 이정표별 처음 도달한 시각(게임 시간, ms). */
  readonly milestones: Partial<Record<Milestone, number>>;
  /** 레벨별 처음 도달한 시각(게임 시간, ms). 인덱스가 레벨이다. */
  readonly levels: Partial<Record<number, number>>;
  /** 거절 사유별 횟수. */
  readonly denials: Partial<Record<ActionFailure, number>>;
  /** 플레이한 시간(게임 시간, ms). */
  readonly playedMs: number;
}

/**
 * 시각을 분:초로 적는다.
 *
 * @param ms 게임 시간(ms).
 * @returns "12:34" 형태.
 */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * 기록을 사람이 읽을 수 있는 한 덩이 글로 만든다.
 *
 * 이 글을 그대로 보내 달라고 하면 된다 — 물어봐서 얻는 답보다 정확하다.
 *
 * @param data 기록.
 * @returns 여러 줄 문자열.
 */
export function summarize(data: JournalData): string {
  const lines: string[] = [];

  lines.push(`타운빌더 플레이 기록 · 플레이 시간 ${clock(data.playedMs)}`);

  lines.push('');
  lines.push('[이정표]');
  for (const milestone of MILESTONE_ORDER) {
    const at = data.milestones[milestone];
    lines.push(`- ${MILESTONE_LABEL[milestone]}: ${at === undefined ? '없음' : clock(at)}`);
  }

  const levels = Object.keys(data.levels)
    .map(Number)
    .sort((a, b) => a - b);
  if (levels.length > 0) {
    lines.push('');
    lines.push('[마을 레벨]');
    lines.push(levels.map((level) => `${level}=${clock(data.levels[level]!)}`).join(' '));
  }

  const denials = Object.entries(data.denials)
    .filter((entry): entry is [ActionFailure, number] => (entry[1] ?? 0) > 0)
    .sort((a, b) => b[1] - a[1]);
  lines.push('');
  lines.push('[막힌 곳]');
  if (denials.length === 0) lines.push('- 없음');
  else {
    for (const [reason, count] of denials) {
      lines.push(`- ${FAILURE_LABEL[reason] ?? reason}: ${count}번`);
    }
  }

  return lines.join('\n');
}
