import { BlueprintId } from './blueprints';
import { ItemType } from './items';

/**
 * 주민 직업.
 *
 * 기획서 9절의 "NPC 직업 배정 → 마을 자동 생산"이다. 다만 이 시스템의 목적은 **마을이
 * 스스로 조금 돌아가는 것**이지 채집을 대신하는 것이 아니다. 자동 생산이 손 채집을
 * 대체하는 순간 이 게임의 핵심 루프(기획서 4절)가 사라진다.
 *
 * 그래서 세 가지 제약을 규칙에 박아 둔다.
 *
 * 1. **생산은 느리다.** 손으로 캐는 것보다 한참 느리게 둔다. 자는 동안 조금 쌓이는 정도다.
 * 2. **자리가 제한된다.** 일터 건물 한 채가 자리 하나를 준다. 주민이 마흔 명이 돼도
 *    (측정에서 레벨 10에 41명이었다) 일터를 짓지 않으면 아무도 일하지 않는다.
 * 3. **상위 자원일수록 느리다.** 수정은 아무도 만들지 못한다 — 동굴은 직접 가야 한다.
 */
export const JobKind = {
  /** 목수. 작업대에서 목재를 낸다. */
  CARPENTER: 'carpenter',
  /** 채석공. 채석장에서 돌을 낸다. */
  QUARRIER: 'quarrier',
  /** 대장장이. 대장간에서 철광석을 낸다. */
  SMITH: 'smith',
} as const;

/** 직업 값. */
export type JobKind = (typeof JobKind)[keyof typeof JobKind];

/** 직업 하나의 정의. */
export interface JobDefinition {
  /** 표시 이름. */
  readonly label: string;
  /** 이 직업이 일하는 건물. */
  readonly workplace: BlueprintId;
  /** 만들어 내는 자원. */
  readonly produces: ItemType;
  /** 한 번에 만드는 개수. */
  readonly amount: number;
  /** 한 번 만드는 데 걸리는 시간(ms). 일하는 시간대에만 흐른다. */
  readonly intervalMs: number;
}

/**
 * 직업별 정의.
 *
 * 생산 속도는 손 채집과 비교해 정한 값이다. 자동 플레이 봇은 5분 동안 노드 376개를
 * 부수는데(자원 1,000개 이상), 목수 한 명은 같은 시간에 목재 스물몇 개를 낸다.
 * **보조지 대체가 아니다**라는 것이 이 숫자의 뜻이다.
 */
export const JOB_DEFINITION: Readonly<Record<JobKind, JobDefinition>> = {
  [JobKind.CARPENTER]: {
    label: '목수',
    workplace: BlueprintId.WORKBENCH,
    produces: ItemType.WOOD,
    amount: 1,
    intervalMs: 14_000,
  },
  [JobKind.QUARRIER]: {
    label: '채석공',
    workplace: BlueprintId.QUARRY,
    produces: ItemType.STONE,
    amount: 1,
    intervalMs: 20_000,
  },
  [JobKind.SMITH]: {
    label: '대장장이',
    workplace: BlueprintId.FORGE,
    produces: ItemType.IRON_ORE,
    amount: 1,
    intervalMs: 34_000,
  },
};

/** 일터 한 채가 주는 자리 수. */
export const SLOTS_PER_WORKPLACE = 1;

/**
 * 그 건물에서 할 수 있는 직업을 찾는다.
 *
 * @param blueprintId 건물의 블루프린트 식별자.
 * @returns 직업. 일터가 아니면 null.
 */
export function jobForWorkplace(blueprintId: BlueprintId): JobKind | null {
  for (const [kind, definition] of Object.entries(JOB_DEFINITION)) {
    if (definition.workplace === blueprintId) return kind as JobKind;
  }

  return null;
}

/**
 * 직업 정의를 가져온다.
 *
 * @param kind 직업.
 * @returns 정의.
 */
export function jobDefinition(kind: JobKind): JobDefinition {
  return JOB_DEFINITION[kind];
}

/**
 * 그 건물이 일터인지 확인한다.
 *
 * @param blueprintId 건물의 블루프린트 식별자.
 * @returns 일터면 true.
 */
export function isWorkplace(blueprintId: BlueprintId): boolean {
  return jobForWorkplace(blueprintId) !== null;
}
