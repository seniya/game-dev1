import { BlockType } from './blocks';

/**
 * 아이템 종류.
 *
 * 기획서 8절의 MVP 자원 3종(목재/돌/철광석)에 지형 재료인 흙을 더한 것이다.
 * 블록과 별개의 개념으로 둔 이유는 목재처럼 지형에 존재하지 않는 자원이 있고,
 * 반대로 빈칸처럼 아이템이 될 수 없는 블록이 있기 때문이다.
 */
export const ItemType = {
  /** 목재. 벌목으로 얻는다. */
  WOOD: 'wood',
  /** 돌. 채굴로 얻는다. */
  STONE: 'stone',
  /** 철광석. 중급 이상 곡괭이로 얻는다. */
  IRON_ORE: 'ironOre',
  /** 수정. 동굴에서 고급 곡괭이로만 얻는다(기획서 5.2의 "희귀광물"). */
  CRYSTAL: 'crystal',
  /** 흙. 지형을 되메우고 평탄화하는 재료다. */
  DIRT: 'dirt',
} as const;

/** 아이템 종류 값. */
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

/** UI에 표시할 순서. 자원을 먼저, 지형 재료를 뒤에 둔다. */
export const ITEM_ORDER: readonly ItemType[] = [
  ItemType.WOOD,
  ItemType.STONE,
  ItemType.IRON_ORE,
  ItemType.CRYSTAL,
  ItemType.DIRT,
];

/** 아이템별 표시 이름. */
const ITEM_LABEL: Readonly<Record<ItemType, string>> = {
  [ItemType.WOOD]: '목재',
  [ItemType.STONE]: '돌',
  [ItemType.IRON_ORE]: '철광석',
  [ItemType.CRYSTAL]: '수정',
  [ItemType.DIRT]: '흙',
};

/** 인벤토리 바에서 아이템을 구분하는 색. */
const ITEM_COLOR: Readonly<Record<ItemType, string>> = {
  [ItemType.WOOD]: '#a4713c',
  [ItemType.STONE]: '#8b8f96',
  [ItemType.IRON_ORE]: '#c98f5a',
  [ItemType.CRYSTAL]: '#9a86e0',
  [ItemType.DIRT]: '#6b4b2f',
};

/**
 * 아이템 이름을 돌려준다.
 *
 * @param type 아이템 종류.
 * @returns 표시 이름.
 */
export function itemLabel(type: ItemType): string {
  return ITEM_LABEL[type];
}

/**
 * 아이템 색을 돌려준다.
 *
 * @param type 아이템 종류.
 * @returns CSS 색 문자열.
 */
export function itemColor(type: ItemType): string {
  return ITEM_COLOR[type];
}

/** 블록 → 아이템 대응. 빈칸은 아이템이 되지 않는다. */
const BLOCK_TO_ITEM: Readonly<Record<BlockType, ItemType | null>> = {
  [BlockType.EMPTY]: null,
  [BlockType.DIRT]: ItemType.DIRT,
  [BlockType.STONE]: ItemType.STONE,
  [BlockType.IRON_ORE]: ItemType.IRON_ORE,
};

/** 아이템 → 블록 대응. 지형에 놓을 수 없는 아이템은 null이다. */
const ITEM_TO_BLOCK: Readonly<Record<ItemType, BlockType | null>> = {
  [ItemType.WOOD]: null,
  [ItemType.STONE]: BlockType.STONE,
  [ItemType.IRON_ORE]: null,
  [ItemType.CRYSTAL]: null,
  [ItemType.DIRT]: BlockType.DIRT,
};

/**
 * 파낸 블록이 어떤 아이템이 되는지 알려준다.
 *
 * @param block 블록 타입.
 * @returns 대응하는 아이템. 없으면 null.
 */
export function blockToItem(block: BlockType): ItemType | null {
  return BLOCK_TO_ITEM[block];
}

/**
 * 아이템을 지형 블록으로 놓을 수 있는지 알려준다.
 *
 * 철광석은 자원이므로 지형 재료가 되지 않는다(기획서 5.1은 "흙/돌 블록"만 명시).
 *
 * @param item 아이템 종류.
 * @returns 대응하는 블록. 놓을 수 없으면 null.
 */
export function itemToBlock(item: ItemType): BlockType | null {
  return ITEM_TO_BLOCK[item];
}
