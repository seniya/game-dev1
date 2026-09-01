import { describe, expect, it } from 'vitest';
import { DEFAULT_SLOT_COUNT, DEFAULT_STACK_LIMIT, Inventory } from '../src/core/Inventory';
import { ItemType } from '../src/core/items';

describe('Inventory 기본', () => {
  it('빈 상태로 시작한다', () => {
    const inventory = new Inventory();

    expect(inventory.slotCount).toBe(DEFAULT_SLOT_COUNT);
    expect(inventory.stackLimit).toBe(DEFAULT_STACK_LIMIT);
    expect(inventory.total).toBe(0);
    expect(inventory.usedSlots).toBe(0);
    expect(inventory.isFull).toBe(false);
    expect(inventory.slotAt(0)).toBeNull();
  });

  it('슬롯 수와 스택 상한을 지정할 수 있다', () => {
    const inventory = new Inventory({ slotCount: 3, stackLimit: 5 });

    expect(inventory.slotCount).toBe(3);
    expect(inventory.stackLimit).toBe(5);
  });

  it('잘못된 설정은 예외를 던진다', () => {
    expect(() => new Inventory({ slotCount: 0 })).toThrow(RangeError);
    expect(() => new Inventory({ stackLimit: 0 })).toThrow(RangeError);
    expect(() => new Inventory({ slotCount: 1.5 })).toThrow(RangeError);
  });

  it('범위를 벗어난 슬롯 조회는 null이다', () => {
    const inventory = new Inventory({ slotCount: 2 });

    expect(inventory.slotAt(-1)).toBeNull();
    expect(inventory.slotAt(2)).toBeNull();
    expect(inventory.slotAt(1.5)).toBeNull();
  });

  it('슬롯 조회는 복사본을 준다 — 밖에서 내용을 바꿀 수 없다', () => {
    const inventory = new Inventory();
    inventory.add(ItemType.WOOD, 3);

    const slot = inventory.slotAt(0)!;
    slot.count = 999;

    expect(inventory.count(ItemType.WOOD)).toBe(3);
  });
});

describe('Inventory 스택 규칙', () => {
  it('같은 아이템은 한 슬롯에 쌓인다', () => {
    const inventory = new Inventory({ slotCount: 4, stackLimit: 10 });
    inventory.add(ItemType.WOOD, 3);
    inventory.add(ItemType.WOOD, 4);

    expect(inventory.usedSlots).toBe(1);
    expect(inventory.count(ItemType.WOOD)).toBe(7);
  });

  it('스택 상한을 넘으면 다음 슬롯으로 넘어간다', () => {
    const inventory = new Inventory({ slotCount: 4, stackLimit: 10 });
    inventory.add(ItemType.STONE, 25);

    expect(inventory.usedSlots).toBe(3);
    expect(inventory.slotAt(0)).toEqual({ item: ItemType.STONE, count: 10 });
    expect(inventory.slotAt(2)).toEqual({ item: ItemType.STONE, count: 5 });
  });

  it('부분 스택을 빈 슬롯보다 먼저 채운다 — 같은 아이템이 흩어지지 않게', () => {
    const inventory = new Inventory({ slotCount: 4, stackLimit: 10 });
    inventory.add(ItemType.WOOD, 8);
    inventory.add(ItemType.STONE, 2);
    inventory.add(ItemType.WOOD, 2);

    expect(inventory.slotAt(0)).toEqual({ item: ItemType.WOOD, count: 10 });
    expect(inventory.slotAt(1)).toEqual({ item: ItemType.STONE, count: 2 });
    expect(inventory.usedSlots).toBe(2);
  });

  it('다른 아이템은 서로 다른 슬롯을 쓴다', () => {
    const inventory = new Inventory({ slotCount: 4, stackLimit: 10 });
    inventory.add(ItemType.WOOD, 1);
    inventory.add(ItemType.STONE, 1);
    inventory.add(ItemType.IRON_ORE, 1);

    expect(inventory.usedSlots).toBe(3);
    expect(inventory.heldTypes).toEqual([ItemType.WOOD, ItemType.STONE, ItemType.IRON_ORE]);
  });

  it('잘못된 개수는 무시한다', () => {
    const inventory = new Inventory();

    expect(inventory.add(ItemType.WOOD, 0)).toBe(0);
    expect(inventory.add(ItemType.WOOD, -1)).toBe(0);
    expect(inventory.add(ItemType.WOOD, 1.5)).toBe(0);
    expect(inventory.total).toBe(0);
  });
});

describe('Inventory 용량 초과', () => {
  it('자리가 부족하면 들어가지 못한 개수를 돌려준다', () => {
    const inventory = new Inventory({ slotCount: 2, stackLimit: 5 });

    expect(inventory.add(ItemType.WOOD, 12)).toBe(2);
    expect(inventory.count(ItemType.WOOD)).toBe(10);
  });

  it('여유 공간을 미리 알려준다', () => {
    const inventory = new Inventory({ slotCount: 2, stackLimit: 5 });

    expect(inventory.freeSpaceFor(ItemType.WOOD)).toBe(10);

    inventory.add(ItemType.WOOD, 3);
    expect(inventory.freeSpaceFor(ItemType.WOOD)).toBe(7);
    // 다른 아이템은 남은 빈 슬롯만 쓸 수 있다.
    expect(inventory.freeSpaceFor(ItemType.STONE)).toBe(5);
  });

  it('모든 슬롯이 상한까지 차면 가득 찬 것으로 본다', () => {
    const inventory = new Inventory({ slotCount: 2, stackLimit: 3 });
    inventory.add(ItemType.WOOD, 3);
    expect(inventory.isFull).toBe(false);

    inventory.add(ItemType.STONE, 3);
    expect(inventory.isFull).toBe(true);
  });

  it('부분 스택이 남아 있으면 가득 찬 것이 아니다', () => {
    const inventory = new Inventory({ slotCount: 1, stackLimit: 5 });
    inventory.add(ItemType.WOOD, 4);

    expect(inventory.isFull).toBe(false);
    expect(inventory.freeSpaceFor(ItemType.WOOD)).toBe(1);
    expect(inventory.freeSpaceFor(ItemType.STONE)).toBe(0);
  });
});

describe('Inventory 꺼내기', () => {
  it('보유량만큼 꺼낼 수 있다', () => {
    const inventory = new Inventory({ slotCount: 4, stackLimit: 10 });
    inventory.add(ItemType.WOOD, 15);

    expect(inventory.remove(ItemType.WOOD, 12)).toBe(true);
    expect(inventory.count(ItemType.WOOD)).toBe(3);
  });

  it('부족하면 아무것도 꺼내지 않는다', () => {
    const inventory = new Inventory();
    inventory.add(ItemType.WOOD, 2);

    expect(inventory.remove(ItemType.WOOD, 3)).toBe(false);
    expect(inventory.count(ItemType.WOOD)).toBe(2);
  });

  it('비워진 슬롯은 다시 쓸 수 있게 된다', () => {
    const inventory = new Inventory({ slotCount: 2, stackLimit: 5 });
    inventory.add(ItemType.WOOD, 5);
    inventory.add(ItemType.STONE, 5);
    expect(inventory.isFull).toBe(true);

    inventory.remove(ItemType.WOOD, 5);

    expect(inventory.usedSlots).toBe(1);
    expect(inventory.add(ItemType.IRON_ORE, 5)).toBe(0);
  });

  it('잘못된 개수는 거부한다', () => {
    const inventory = new Inventory();
    inventory.add(ItemType.WOOD, 5);

    expect(inventory.remove(ItemType.WOOD, 0)).toBe(false);
    expect(inventory.remove(ItemType.WOOD, -1)).toBe(false);
    expect(inventory.count(ItemType.WOOD)).toBe(5);
  });
});

describe('Inventory 이동', () => {
  it('다른 저장소로 옮긴다', () => {
    const from = new Inventory({ slotCount: 4, stackLimit: 10 });
    const to = new Inventory({ slotCount: 4, stackLimit: 10 });
    from.add(ItemType.WOOD, 7);

    expect(from.moveTo(to, ItemType.WOOD, 5)).toBe(5);
    expect(from.count(ItemType.WOOD)).toBe(2);
    expect(to.count(ItemType.WOOD)).toBe(5);
  });

  it('개수를 생략하면 전량을 옮긴다', () => {
    const from = new Inventory();
    const to = new Inventory();
    from.add(ItemType.STONE, 6);

    expect(from.moveTo(to, ItemType.STONE)).toBe(6);
    expect(from.count(ItemType.STONE)).toBe(0);
  });

  it('받는 쪽 자리가 부족하면 들어간 만큼만 옮긴다', () => {
    const from = new Inventory({ slotCount: 4, stackLimit: 10 });
    const to = new Inventory({ slotCount: 1, stackLimit: 3 });
    from.add(ItemType.WOOD, 10);

    expect(from.moveTo(to, ItemType.WOOD)).toBe(3);
    expect(from.count(ItemType.WOOD)).toBe(7);
    expect(to.count(ItemType.WOOD)).toBe(3);
  });

  it('없는 아이템을 옮기면 0이다', () => {
    const from = new Inventory();
    const to = new Inventory();

    expect(from.moveTo(to, ItemType.WOOD)).toBe(0);
  });

  it('전체 이동은 종류별 개수를 돌려준다', () => {
    const from = new Inventory();
    const to = new Inventory({ slotCount: 10, stackLimit: 99 });
    from.add(ItemType.WOOD, 3);
    from.add(ItemType.STONE, 2);

    const moved = from.moveAllTo(to);

    expect(moved.get(ItemType.WOOD)).toBe(3);
    expect(moved.get(ItemType.STONE)).toBe(2);
    expect(from.total).toBe(0);
  });

  it('전체 이동에서 특정 아이템을 제외할 수 있다', () => {
    const from = new Inventory();
    const to = new Inventory({ slotCount: 10, stackLimit: 99 });
    from.add(ItemType.WOOD, 3);
    from.add(ItemType.DIRT, 4);

    from.moveAllTo(to, [ItemType.DIRT]);

    expect(from.count(ItemType.DIRT)).toBe(4);
    expect(to.count(ItemType.DIRT)).toBe(0);
    expect(to.count(ItemType.WOOD)).toBe(3);
  });
});

describe('Inventory 변경 번호', () => {
  it('내용이 바뀌면 오른다', () => {
    const inventory = new Inventory();
    const before = inventory.revision;

    inventory.add(ItemType.WOOD, 1);

    expect(inventory.revision).toBeGreaterThan(before);
  });

  it('아무것도 들어가지 않으면 오르지 않는다 — UI를 헛되게 다시 그리지 않도록', () => {
    const inventory = new Inventory({ slotCount: 1, stackLimit: 1 });
    inventory.add(ItemType.WOOD, 1);
    const before = inventory.revision;

    expect(inventory.add(ItemType.STONE, 1)).toBe(1);
    expect(inventory.revision).toBe(before);
  });

  it('꺼내기에 실패하면 오르지 않는다', () => {
    const inventory = new Inventory();
    const before = inventory.revision;

    inventory.remove(ItemType.WOOD, 1);

    expect(inventory.revision).toBe(before);
  });
});
