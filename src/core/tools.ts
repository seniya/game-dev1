import { BlockType } from './blocks';

/**
 * 도구 종류와 등급.
 *
 * 기획서 5.2는 도구를 초급/중급/고급으로 나누고, 상위 자원은 상위 도구를 요구한다.
 * 등급은 채집 속도 배수와 채집 가능 여부를 함께 결정한다.
 */

/** 도구 종류. */
export const ToolKind = {
  /** 도끼. 나무를 벤다. */
  AXE: 'axe',
  /** 곡괭이. 돌과 광석을 캔다. */
  PICKAXE: 'pickaxe',
  /** 삽. 흙을 파고 지형을 정리한다. */
  SHOVEL: 'shovel',
} as const;

/** 도구 종류 값. */
export type ToolKind = (typeof ToolKind)[keyof typeof ToolKind];

/** 도구 등급. 숫자가 클수록 상위 등급이다. */
export const ToolTier = {
  /** 초급. */
  BASIC: 1,
  /** 중급. */
  MID: 2,
  /** 고급. */
  HIGH: 3,
} as const;

/** 도구 등급 값. */
export type ToolTier = (typeof ToolTier)[keyof typeof ToolTier];

/** 도구 하나. */
export interface Tool {
  /** 종류. */
  readonly kind: ToolKind;
  /** 등급. */
  readonly tier: ToolTier;
}

/** 도구 종류별 표시 이름. */
const TOOL_LABEL: Readonly<Record<ToolKind, string>> = {
  [ToolKind.AXE]: '도끼',
  [ToolKind.PICKAXE]: '곡괭이',
  [ToolKind.SHOVEL]: '삽',
};

/** 등급별 표시 이름. */
const TIER_LABEL: Readonly<Record<ToolTier, string>> = {
  [ToolTier.BASIC]: '초급',
  [ToolTier.MID]: '중급',
  [ToolTier.HIGH]: '고급',
};

/**
 * 도구 이름을 만든다.
 *
 * @param tool 도구.
 * @returns "중급 곡괭이" 형태의 문자열.
 */
export function toolLabel(tool: Tool): string {
  return `${TIER_LABEL[tool.tier]} ${TOOL_LABEL[tool.kind]}`;
}

/**
 * 등급에 따른 채집 속도 배수.
 * 초급 1배, 중급 1.6배, 고급 2.4배로 상위 도구를 쓸 이유를 만든다.
 *
 * @param tier 도구 등급.
 * @returns 속도 배수.
 */
export function tierSpeedMultiplier(tier: ToolTier): number {
  return 1 + (tier - 1) * 0.7;
}

/** 블록 종류별로 필요한 도구 종류와 최소 등급. */
const BLOCK_REQUIREMENT: Readonly<Record<BlockType, { kind: ToolKind; minTier: ToolTier } | null>> = {
  [BlockType.EMPTY]: null,
  [BlockType.DIRT]: { kind: ToolKind.SHOVEL, minTier: ToolTier.BASIC },
  [BlockType.STONE]: { kind: ToolKind.PICKAXE, minTier: ToolTier.BASIC },
  // 기획서 5.2: 철광석 이상은 중급 도구 이상을 요구한다.
  [BlockType.IRON_ORE]: { kind: ToolKind.PICKAXE, minTier: ToolTier.MID },
};

/**
 * 이 도구로 해당 블록을 팔 수 있는지 확인한다.
 *
 * @param tool 사용할 도구.
 * @param block 대상 블록 타입.
 * @returns 팔 수 있으면 true.
 */
export function canDigBlock(tool: Tool, block: BlockType): boolean {
  const requirement = BLOCK_REQUIREMENT[block];
  if (!requirement) return false;

  return tool.kind === requirement.kind && tool.tier >= requirement.minTier;
}

/**
 * 블록을 파려면 어떤 도구가 필요한지 알려준다. UI 안내 문구에 쓴다.
 *
 * @param block 대상 블록 타입.
 * @returns 필요한 도구 설명. 팔 수 없는 블록이면 null.
 */
export function digRequirementLabel(block: BlockType): string | null {
  const requirement = BLOCK_REQUIREMENT[block];
  if (!requirement) return null;

  return `${TIER_LABEL[requirement.minTier]} 이상 ${TOOL_LABEL[requirement.kind]}`;
}
