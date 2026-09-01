import type { ItemType } from './items';

/**
 * 아이템을 종류별 개수로만 담는 최소 저장소.
 *
 * Phase 5의 인벤토리(슬롯·스택·용량 제한)로 대체될 임시 구조다. 지금 필요한
 * 것은 "얻은 만큼만 쓸 수 있다"는 규칙을 성립시키는 것뿐이므로 개수만 센다.
 */
export class ItemStash {
  /** 아이템별 보유 수. 0인 항목은 담지 않는다. */
  private readonly counts = new Map<ItemType, number>();

  /**
   * 아이템을 넣는다.
   *
   * @param type 아이템 종류.
   * @param amount 넣을 개수. 1 이상의 정수여야 하며 아니면 무시한다.
   */
  add(type: ItemType, amount = 1): void {
    if (!Number.isInteger(amount) || amount < 1) return;
    this.counts.set(type, this.count(type) + amount);
  }

  /**
   * 아이템을 꺼낸다. 보유량이 부족하면 아무것도 꺼내지 않는다 — 부분 인출을
   * 허용하면 호출부가 "몇 개 나왔는지" 매번 확인해야 해서 실수가 늘어난다.
   *
   * @param type 아이템 종류.
   * @param amount 꺼낼 개수. 1 이상의 정수.
   * @returns 꺼냈으면 true.
   */
  take(type: ItemType, amount = 1): boolean {
    if (!Number.isInteger(amount) || amount < 1) return false;

    const held = this.count(type);
    if (held < amount) return false;

    const left = held - amount;
    if (left === 0) this.counts.delete(type);
    else this.counts.set(type, left);

    return true;
  }

  /**
   * 보유 수를 돌려준다.
   *
   * @param type 아이템 종류.
   * @returns 보유 개수. 없으면 0.
   */
  count(type: ItemType): number {
    return this.counts.get(type) ?? 0;
  }

  /** 담긴 아이템 총 개수. */
  get total(): number {
    let sum = 0;
    for (const amount of this.counts.values()) sum += amount;
    return sum;
  }

  /** 보유 중인 아이템 종류 목록. */
  get heldTypes(): ItemType[] {
    return [...this.counts.keys()];
  }
}
