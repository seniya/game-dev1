import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { ITEM_ORDER, ItemType, blockToItem, itemColor, itemLabel, itemToBlock } from '../src/core/items';

describe('아이템', () => {
  it('MVP 자원 3종에 동굴의 수정과 지형 재료 흙을 더해 갖는다', () => {
    expect(ITEM_ORDER).toEqual([
      ItemType.WOOD,
      ItemType.STONE,
      ItemType.IRON_ORE,
      ItemType.CRYSTAL,
      ItemType.DIRT,
    ]);
  });

  it('수정은 지형에 놓을 수 없다 — 자원이지 지형 재료가 아니다', () => {
    expect(itemToBlock(ItemType.CRYSTAL)).toBeNull();
  });

  it('모든 아이템에 이름과 색이 있다', () => {
    for (const item of ITEM_ORDER) {
      expect(itemLabel(item)).toBeTruthy();
      expect(itemColor(item)).toMatch(/^#/);
    }
  });
});

describe('블록 ↔ 아이템 변환', () => {
  it('흙·돌·철광석은 아이템이 된다', () => {
    expect(blockToItem(BlockType.DIRT)).toBe(ItemType.DIRT);
    expect(blockToItem(BlockType.STONE)).toBe(ItemType.STONE);
    expect(blockToItem(BlockType.IRON_ORE)).toBe(ItemType.IRON_ORE);
  });

  it('빈칸은 아이템이 되지 않는다', () => {
    expect(blockToItem(BlockType.EMPTY)).toBeNull();
  });

  it('흙과 돌만 지형에 되놓을 수 있다 — 기획서 5.1', () => {
    expect(itemToBlock(ItemType.DIRT)).toBe(BlockType.DIRT);
    expect(itemToBlock(ItemType.STONE)).toBe(BlockType.STONE);
    expect(itemToBlock(ItemType.IRON_ORE)).toBeNull();
    expect(itemToBlock(ItemType.WOOD)).toBeNull();
  });

  it('블록 → 아이템 → 블록 왕복이 보존된다', () => {
    for (const block of [BlockType.DIRT, BlockType.STONE]) {
      const item = blockToItem(block);
      expect(item).not.toBeNull();
      expect(itemToBlock(item!)).toBe(block);
    }
  });
});
