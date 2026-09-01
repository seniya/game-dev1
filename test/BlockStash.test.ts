import { describe, expect, it } from 'vitest';
import { BlockStash } from '../src/core/BlockStash';
import { BlockType } from '../src/core/blocks';

describe('BlockStash', () => {
  it('처음에는 비어 있다', () => {
    const stash = new BlockStash();

    expect(stash.count(BlockType.DIRT)).toBe(0);
    expect(stash.total).toBe(0);
    expect(stash.heldTypes).toEqual([]);
  });

  it('넣은 만큼 쌓인다', () => {
    const stash = new BlockStash();
    stash.add(BlockType.DIRT);
    stash.add(BlockType.DIRT, 4);
    stash.add(BlockType.STONE, 2);

    expect(stash.count(BlockType.DIRT)).toBe(5);
    expect(stash.count(BlockType.STONE)).toBe(2);
    expect(stash.total).toBe(7);
  });

  it('EMPTY와 잘못된 개수는 무시한다', () => {
    const stash = new BlockStash();
    stash.add(BlockType.EMPTY, 3);
    stash.add(BlockType.DIRT, 0);
    stash.add(BlockType.DIRT, -2);
    stash.add(BlockType.DIRT, 1.5);

    expect(stash.total).toBe(0);
  });

  it('보유량만큼만 꺼낼 수 있다', () => {
    const stash = new BlockStash();
    stash.add(BlockType.STONE, 3);

    expect(stash.take(BlockType.STONE, 2)).toBe(true);
    expect(stash.count(BlockType.STONE)).toBe(1);
  });

  it('부족하면 아무것도 꺼내지 않는다 — 부분 인출은 허용하지 않는다', () => {
    const stash = new BlockStash();
    stash.add(BlockType.STONE, 2);

    expect(stash.take(BlockType.STONE, 5)).toBe(false);
    expect(stash.count(BlockType.STONE)).toBe(2);
  });

  it('없는 타입을 꺼내려 하면 실패한다', () => {
    const stash = new BlockStash();

    expect(stash.take(BlockType.IRON_ORE)).toBe(false);
  });

  it('0이 된 타입은 보유 목록에서 사라진다', () => {
    const stash = new BlockStash();
    stash.add(BlockType.DIRT, 1);
    stash.take(BlockType.DIRT, 1);

    expect(stash.heldTypes).toEqual([]);
    expect(stash.count(BlockType.DIRT)).toBe(0);
  });

  it('잘못된 인출 개수는 거부한다', () => {
    const stash = new BlockStash();
    stash.add(BlockType.DIRT, 3);

    expect(stash.take(BlockType.DIRT, 0)).toBe(false);
    expect(stash.take(BlockType.DIRT, -1)).toBe(false);
    expect(stash.take(BlockType.DIRT, 1.5)).toBe(false);
    expect(stash.count(BlockType.DIRT)).toBe(3);
  });
});
