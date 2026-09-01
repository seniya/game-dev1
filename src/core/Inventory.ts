import { ITEM_ORDER, type ItemType } from './items';

/** 슬롯 하나의 내용. 비어 있으면 null이다. */
export interface InventorySlot {
  /** 담긴 아이템. */
  item: ItemType;
  /** 개수. 1 이상 stackLimit 이하. */
  count: number;
}

/** 인벤토리 설정. */
export interface InventoryOptions {
  /** 슬롯 수. */
  slotCount?: number;
  /** 한 슬롯에 쌓을 수 있는 최대 개수. */
  stackLimit?: number;
}

/** 플레이어 인벤토리 기본 슬롯 수. 하단 바 한 줄에 들어가는 수다. */
export const DEFAULT_SLOT_COUNT = 8;

/** 플레이어 인벤토리 기본 스택 상한. */
export const DEFAULT_STACK_LIMIT = 20;

/**
 * 슬롯과 스택 규칙을 갖는 저장소.
 *
 * 플레이어 인벤토리와 마을 창고가 같은 클래스를 쓰고 슬롯 수·스택 상한만
 * 다르게 잡는다. 규칙이 갈라질 이유가 없고, 둘 사이 이동(`moveTo`)을 한
 * 클래스 안에서 다루는 편이 안전하다.
 *
 * 스택 규칙: 넣을 때 **이미 같은 아이템이 담긴 슬롯을 먼저 채우고**, 남으면
 * 빈 슬롯을 쓴다. 그래야 같은 아이템이 여러 슬롯에 흩어지지 않는다.
 */
export class Inventory {
  /** 슬롯 배열. 길이는 항상 slotCount다. */
  private readonly slots: Array<InventorySlot | null>;
  /** 한 슬롯의 최대 개수. */
  readonly stackLimit: number;

  /**
   * 내용이 바뀔 때마다 오르는 번호.
   *
   * UI가 매 프레임 DOM을 다시 만들지 않도록, 이 값이 바뀌었을 때만 갱신한다.
   */
  private changeCount = 0;

  /**
   * @param options 슬롯 수와 스택 상한.
   */
  constructor(options: InventoryOptions = {}) {
    const slotCount = options.slotCount ?? DEFAULT_SLOT_COUNT;
    const stackLimit = options.stackLimit ?? DEFAULT_STACK_LIMIT;

    if (!Number.isInteger(slotCount) || slotCount < 1) {
      throw new RangeError(`slotCount는 1 이상의 정수여야 한다: ${slotCount}`);
    }
    if (!Number.isInteger(stackLimit) || stackLimit < 1) {
      throw new RangeError(`stackLimit는 1 이상의 정수여야 한다: ${stackLimit}`);
    }

    this.slots = new Array<InventorySlot | null>(slotCount).fill(null);
    this.stackLimit = stackLimit;
  }

  /** 슬롯 수. */
  get slotCount(): number {
    return this.slots.length;
  }

  /** 내용 변경 번호. 바뀌면 UI를 다시 그린다. */
  get revision(): number {
    return this.changeCount;
  }

  /** 사용 중인 슬롯 수. */
  get usedSlots(): number {
    return this.slots.reduce((sum, slot) => sum + (slot ? 1 : 0), 0);
  }

  /** 빈 슬롯이 없는지 여부. 부분 스택이 남아 있으면 가득 찬 것으로 보지 않는다. */
  get isFull(): boolean {
    return this.slots.every((slot) => slot !== null && slot.count >= this.stackLimit);
  }

  /** 담긴 아이템 총 개수. */
  get total(): number {
    return this.slots.reduce((sum, slot) => sum + (slot?.count ?? 0), 0);
  }

  /**
   * 슬롯 내용을 읽는다. UI가 순서대로 그릴 때 쓴다.
   *
   * @param index 슬롯 번호.
   * @returns 슬롯 내용. 비어 있거나 범위를 벗어나면 null.
   */
  slotAt(index: number): InventorySlot | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.slots.length) return null;

    const slot = this.slots[index]!;

    return slot ? { item: slot.item, count: slot.count } : null;
  }

  /**
   * 특정 아이템의 총 보유 수를 센다.
   *
   * @param item 아이템 종류.
   * @returns 보유 개수.
   */
  count(item: ItemType): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot?.item === item) total += slot.count;
    }
    return total;
  }

  /**
   * 더 넣을 수 있는 여유를 센다.
   *
   * @param item 아이템 종류.
   * @returns 지금 더 받을 수 있는 개수.
   */
  freeSpaceFor(item: ItemType): number {
    let space = 0;
    for (const slot of this.slots) {
      if (slot === null) space += this.stackLimit;
      else if (slot.item === item) space += this.stackLimit - slot.count;
    }
    return space;
  }

  /**
   * 아이템을 넣는다. 들어가지 못한 개수를 돌려준다 — 호출부가 "전부 들어갔는지"를
   * 판단할 수 있어야 채집을 거절할지 결정할 수 있다.
   *
   * @param item 아이템 종류.
   * @param amount 넣을 개수. 1 이상의 정수.
   * @returns 자리가 없어 넣지 못한 개수. 전부 들어갔으면 0.
   */
  add(item: ItemType, amount = 1): number {
    if (!Number.isInteger(amount) || amount < 1) return 0;

    let left = amount;

    // 같은 아이템이 담긴 슬롯을 먼저 채운다.
    for (const slot of this.slots) {
      if (left === 0) break;
      if (slot === null || slot.item !== item) continue;

      const room = this.stackLimit - slot.count;
      if (room <= 0) continue;

      const moved = Math.min(room, left);
      slot.count += moved;
      left -= moved;
    }

    // 남으면 빈 슬롯을 쓴다.
    for (let i = 0; i < this.slots.length && left > 0; i += 1) {
      if (this.slots[i] !== null) continue;

      const moved = Math.min(this.stackLimit, left);
      this.slots[i] = { item, count: moved };
      left -= moved;
    }

    if (left !== amount) this.changeCount += 1;

    return left;
  }

  /**
   * 아이템을 꺼낸다. 보유량이 부족하면 아무것도 꺼내지 않는다.
   *
   * @param item 아이템 종류.
   * @param amount 꺼낼 개수. 1 이상의 정수.
   * @returns 꺼냈으면 true.
   */
  remove(item: ItemType, amount = 1): boolean {
    if (!Number.isInteger(amount) || amount < 1) return false;
    if (this.count(item) < amount) return false;

    let left = amount;

    // 개수가 적은 슬롯부터 비워 빈 슬롯이 빨리 생기게 한다.
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i -= 1) {
      const slot = this.slots[i];
      if (slot === null || slot.item !== item) continue;

      const taken = Math.min(slot.count, left);
      slot.count -= taken;
      left -= taken;
      if (slot.count === 0) this.slots[i] = null;
    }

    this.changeCount += 1;

    return true;
  }

  /**
   * 다른 저장소로 아이템을 옮긴다. 받는 쪽 자리가 부족하면 **들어간 만큼만** 옮긴다.
   *
   * @param target 받는 저장소.
   * @param item 아이템 종류.
   * @param amount 옮길 개수. 생략하면 보유 전량.
   * @returns 실제로 옮긴 개수.
   */
  moveTo(target: Inventory, item: ItemType, amount?: number): number {
    const held = this.count(item);
    const want = Math.min(amount ?? held, held);
    if (want < 1) return 0;

    const accepted = want - target.add(item, want);
    if (accepted > 0) this.remove(item, accepted);

    return accepted;
  }

  /**
   * 담긴 모든 아이템을 다른 저장소로 옮긴다.
   *
   * @param target 받는 저장소.
   * @param exclude 옮기지 않을 아이템 목록.
   * @returns 종류별로 옮긴 개수.
   */
  moveAllTo(target: Inventory, exclude: readonly ItemType[] = []): Map<ItemType, number> {
    const moved = new Map<ItemType, number>();

    for (const item of ITEM_ORDER) {
      if (exclude.includes(item)) continue;

      const count = this.moveTo(target, item);
      if (count > 0) moved.set(item, count);
    }

    return moved;
  }

  /** 담긴 아이템 종류 목록. 슬롯 순서를 따르며 중복은 제거한다. */
  get heldTypes(): ItemType[] {
    const seen: ItemType[] = [];
    for (const slot of this.slots) {
      if (slot && !seen.includes(slot.item)) seen.push(slot.item);
    }
    return seen;
  }
}
