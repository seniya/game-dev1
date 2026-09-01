import { BlueprintId } from './blueprints';
import { ItemType, itemLabel } from './items';
import { blueprintById } from './blueprints';

/** 요청 종류. 기획서 5.4의 MVP 요청 유형이다. */
export const RequestKind = {
  /** 자재 납품형 — "목재 5개를 주세요". */
  DELIVER: 'deliver',
  /** 시설 건축형 — "우물이 필요해요". */
  FACILITY: 'facility',
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

/** 요청 하나. */
export type VillageRequest = DeliverRequest | FacilityRequest;

/** 요청 완료 시 주는 마을 경험치. 시설 요청이 더 큰일이라 더 많이 준다. */
export const REQUEST_REWARD: Readonly<Record<RequestKind, number>> = {
  [RequestKind.DELIVER]: 2,
  [RequestKind.FACILITY]: 5,
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

  return `주민 요청: ${blueprintById(request.blueprintId).label} 건축`;
}
