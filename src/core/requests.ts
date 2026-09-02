import { BlueprintId } from './blueprints';
import { ItemType, itemLabel } from './items';
import { blueprintById } from './blueprints';

/**
 * 요청 종류.
 *
 * 앞의 둘은 기획서 5.4의 MVP 유형이고, 뒤의 둘은 **후반의 할 일**을 위해 더한 것이다
 * (로드맵 04 Phase 4). 마을이 커지면 자재 납품은 시시해지고 지을 시설도 다 서 버려,
 * 후반에는 요청이 같은 모양으로 반복됐다.
 *
 * 새 유형도 기획서가 요구하는 "단순 요청"의 범위를 지킨다 — **조건 하나로 판정되고,
 * 채워지면 스스로 닫힌다.**
 */
export const RequestKind = {
  /** 자재 납품형 — "목재 5개를 주세요". */
  DELIVER: 'deliver',
  /** 시설 건축형 — "우물이 필요해요". */
  FACILITY: 'facility',
  /** 정착형 — "주민이 열 명은 됐으면 해요". */
  SETTLE: 'settle',
  /** 일자리형 — "일하는 사람이 셋은 있었으면 해요". */
  WORKFORCE: 'workforce',
} as const;

/** 요청 종류 값. */
export type RequestKind = (typeof RequestKind)[keyof typeof RequestKind];

/** 자재 납품 요청. */
export interface DeliverRequest {
  readonly kind: typeof RequestKind.DELIVER;
  /** 요청 번호. */
  readonly id: number;
  /** 요청한 주민 번호. */
  readonly npcId: number;
  /** 요청 아이템. */
  readonly item: ItemType;
  /** 요청 개수. */
  readonly amount: number;
}

/** 시설 건축 요청. */
export interface FacilityRequest {
  readonly kind: typeof RequestKind.FACILITY;
  /** 요청 번호. */
  readonly id: number;
  /** 요청한 주민 번호. */
  readonly npcId: number;
  /** 필요한 건물. */
  readonly blueprintId: BlueprintId;
}

/**
 * 수를 채우면 스스로 닫히는 요청.
 *
 * 정착형과 일자리형이 같은 모양이라 한 타입으로 둔다 — 무엇을 세는지만 다르다.
 */
export interface CountRequest {
  readonly kind: typeof RequestKind.SETTLE | typeof RequestKind.WORKFORCE;
  /** 요청 번호. */
  readonly id: number;
  /** 요청한 주민 번호. */
  readonly npcId: number;
  /** 채워야 하는 수. */
  readonly target: number;
}

/** 요청 하나. */
export type VillageRequest = DeliverRequest | FacilityRequest | CountRequest;

/** 요청 완료 시 주는 마을 경험치. 시설 요청이 더 큰일이라 더 많이 준다. */
export const REQUEST_REWARD: Readonly<Record<RequestKind, number>> = {
  [RequestKind.DELIVER]: 2,
  [RequestKind.FACILITY]: 5,
  // 달성형은 여러 번의 채집·건축이 쌓여야 닫히므로 시설 요청만큼 준다.
  [RequestKind.SETTLE]: 5,
  [RequestKind.WORKFORCE]: 4,
};

/** 납품 요청으로 나올 수 있는 아이템과 개수 범위. */
export const DELIVER_TABLE: ReadonlyArray<{ item: ItemType; min: number; max: number }> = [
  { item: ItemType.WOOD, min: 3, max: 8 },
  { item: ItemType.STONE, min: 3, max: 6 },
  { item: ItemType.IRON_ORE, min: 1, max: 3 },
];

/** 시설 요청으로 나올 수 있는 건물. 주민이 살 집은 요청 대상이 아니다. */
export const FACILITY_TABLE: readonly BlueprintId[] = [
  BlueprintId.WELL,
  BlueprintId.WORKBENCH,
  BlueprintId.WAREHOUSE,
];

/**
 * 요청을 한 줄 문구로 만든다.
 *
 * 기획서 5.4·7절이 대사창을 배제하므로 UI 텍스트로만 쓰는 짧은 문구다.
 *
 * @param request 요청.
 * @returns 표시 문구.
 */
export function requestLabel(request: VillageRequest): string {
  if (request.kind === RequestKind.DELIVER) {
    return `${itemLabel(request.item)} ${request.amount}`;
  }
  if (request.kind !== RequestKind.FACILITY) {
    return request.kind === RequestKind.SETTLE ? `주민 ${request.target}` : `일꾼 ${request.target}`;
  }

  return blueprintById(request.blueprintId).label;
}

/**
 * 요청의 상세 안내 문구를 만든다. 토스트에 쓴다.
 *
 * @param request 요청.
 * @returns 안내 문구.
 */
export function requestMessage(request: VillageRequest): string {
  if (request.kind === RequestKind.DELIVER) {
    return `주민 요청: ${itemLabel(request.item)} ${request.amount}개`;
  }
  if (request.kind !== RequestKind.FACILITY) {
    return request.kind === RequestKind.SETTLE
      ? `주민 요청: 마을 주민 ${request.target}명`
      : `주민 요청: 일터에서 일하는 주민 ${request.target}명`;
  }

  return `주민 요청: ${blueprintById(request.blueprintId).label} 건축`;
}

/**
 * 달성형 요청이 채워졌는지 본다.
 *
 * @param request 요청.
 * @param counts 지금의 주민 수와 일하는 주민 수.
 * @returns 채워졌으면 true.
 */
export function isCountMet(
  request: CountRequest,
  counts: { residents: number; employed: number },
): boolean {
  const have = request.kind === RequestKind.SETTLE ? counts.residents : counts.employed;

  return have >= request.target;
}

/**
 * 달성형 요청의 목표 수를 정한다.
 *
 * 지금보다 조금 더 많은 수를 부른다 — 이미 채운 수를 요청하면 나오자마자 닫히고,
 * 너무 멀면 후반 내내 열려 있기만 한다.
 *
 * @param have 지금 수.
 * @param step 얼마나 더 요구할지.
 * @returns 목표 수.
 */
export function countTarget(have: number, step: number): number {
  return Math.max(1, Math.floor(have) + Math.max(1, Math.floor(step)));
}
