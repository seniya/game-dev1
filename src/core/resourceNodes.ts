import { ItemType } from './items';
import { ToolKind, ToolTier } from './tools';

/** 자원 노드 종류. */
export const NodeKind = {
  /** 나무. 도끼로 벤다. */
  TREE: 'tree',
  /** 돌 광맥. 초급 곡괭이로도 캔다. */
  STONE_ROCK: 'stoneRock',
  /** 철광석 광맥. 중급 이상 곡괭이를 요구한다. */
  IRON_VEIN: 'ironVein',
  /** 수정 광맥. 동굴에만 있고 고급 곡괭이를 요구한다. */
  CRYSTAL_VEIN: 'crystalVein',
} as const;

/** 자원 노드 종류 값. */
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

/** 노드 한 종류의 정의. */
export interface NodeDefinition {
  /** 표시 이름. */
  readonly label: string;
  /** 필요한 도구 종류. */
  readonly toolKind: ToolKind;
  /** 필요한 최소 도구 등급. */
  readonly minTier: ToolTier;
  /** 내구도. 초급 도구로 이만큼 때리면 부서진다. */
  readonly durability: number;
  /** 부서질 때 나오는 아이템. */
  readonly drop: ItemType;
  /** 드롭 개수. */
  readonly dropAmount: number;
  /** 다시 자라는 데 걸리는 시간(ms). */
  readonly respawnMs: number;
}

/**
 * 노드 종류별 정의.
 *
 * 서열은 "나무가 가장 빨리 회복되고 철광석이 가장 느리다"이다 — 상위 자원이 귀해야
 * 마을 레벨 진행에 의미가 생긴다(기획서 6절).
 *
 * 리스폰 시간은 로드맵 02 Phase 6에서 한 번 줄였다. 자동 플레이로 재 보니 후반에
 * 마을 근처 노드가 고갈돼 봇이 3,600칸 넘게 걸어 다녔다 — 채집이 아니라 이동이
 * 시간의 대부분을 먹는 상태였다. 회복이 빨라지면 같은 자리를 다시 쓸 수 있어
 * 이동이 줄어든다.
 */
export const NODE_DEFINITION: Readonly<Record<NodeKind, NodeDefinition>> = {
  [NodeKind.TREE]: {
    label: '나무',
    toolKind: ToolKind.AXE,
    minTier: ToolTier.BASIC,
    durability: 3,
    drop: ItemType.WOOD,
    dropAmount: 3,
    respawnMs: 16_000,
  },
  [NodeKind.STONE_ROCK]: {
    label: '돌 광맥',
    toolKind: ToolKind.PICKAXE,
    minTier: ToolTier.BASIC,
    durability: 4,
    drop: ItemType.STONE,
    dropAmount: 3,
    respawnMs: 26_000,
  },
  [NodeKind.IRON_VEIN]: {
    label: '철광석 광맥',
    toolKind: ToolKind.PICKAXE,
    minTier: ToolTier.MID,
    durability: 6,
    drop: ItemType.IRON_ORE,
    dropAmount: 2,
    respawnMs: 45_000,
  },
  [NodeKind.CRYSTAL_VEIN]: {
    label: '수정 광맥',
    toolKind: ToolKind.PICKAXE,
    minTier: ToolTier.HIGH,
    durability: 8,
    drop: ItemType.CRYSTAL,
    dropAmount: 2,
    // 가장 귀한 자원이므로 회복도 가장 느리다. 서열(나무 < 돌 < 철광석 < 수정)을 잇는다.
    respawnMs: 70_000,
  },
};

/**
 * 노드 정의를 가져온다.
 *
 * @param kind 노드 종류.
 * @returns 정의.
 */
export function nodeDefinition(kind: NodeKind): NodeDefinition {
  return NODE_DEFINITION[kind];
}
