import { describe, expect, it } from 'vitest';
import { ItemStash } from '../src/core/ItemStash';
import { ItemType } from '../src/core/items';

describe('ItemStash', () => {
  it('처음에는 비어 있다', () => {
    const stash = new ItemStash();

    expect(stash.count(ItemType.WOOD)).toBe(0);
    expect(stash.total).toBe(0);
    expect(stash.heldTypes).toEqual([]);
  });

  it('넣은 만큼 쌓인다', () => {
    const stash = new ItemStash();
    stash.add(ItemType.WOOD);
    stash.add(ItemType.WOOD, 4);
    stash.add(ItemType.STONE, 2);

    expect(stash.count(ItemType.WOOD)).toBe(5);
    expect(stash.total).toBe(7);
  });

  it('잘못된 개수는 무시한다', () => {
    const stash = new ItemStash();
    stash.add(ItemType.WOOD, 0);
    stash.add(ItemType.WOOD, -2);
    stash.add(ItemType.WOOD, 1.5);

    expect(stash.total).toBe(0);
  });

  it('부족하면 아무것도 꺼내지 않는다', () => {
    const stash = new ItemStash();
    stash.add(ItemType.STONE, 2);

    expect(stash.take(ItemType.STONE, 5)).toBe(false);
    expect(stash.count(ItemType.STONE)).toBe(2);
  });

  it('0이 된 종류는 보유 목록에서 사라진다', () => {
    const stash = new ItemStash();
    stash.add(ItemType.DIRT, 1);
    stash.take(ItemType.DIRT, 1);

    expect(stash.heldTypes).toEqual([]);
  });
});
