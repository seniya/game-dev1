import { beforeEach, describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/Inventory';
import { ItemType, itemColor } from '../src/core/items';
import { ToolKind, ToolTier } from '../src/core/tools';
import { InventoryBar } from '../src/ui/InventoryBar';

/** 최소 엘리먼트 대역. 필요한 속성만 흉내낸다. */
class FakeElement {
  textContent: string | null = null;
  title = '';
  className = '';
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, Array<() => void>>();

  /**
   * 리스너를 등록한다.
   *
   * @param type 이벤트 타입.
   * @param handler 리스너.
   */
  addEventListener(type: string, handler: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  /**
   * 등록된 리스너를 직접 호출한다.
   *
   * @param type 이벤트 타입.
   */
  emit(type: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler();
  }

  /**
   * 자식을 붙인다.
   *
   * @param child 붙일 엘리먼트.
   */
  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  /** classList 흉내. */
  readonly classList = {
    add: (name: string) => {
      this.classes.add(name);
    },
    remove: (name: string) => {
      this.classes.delete(name);
    },
    toggle: (name: string, force?: boolean) => {
      if (force === undefined) {
        if (this.classes.has(name)) this.classes.delete(name);
        else this.classes.add(name);
      } else if (force) this.classes.add(name);
      else this.classes.delete(name);
    },
    contains: (name: string) => this.classes.has(name),
  };
}

/**
 * document.createElement를 대역으로 바꾼다.
 * InventoryBar가 슬롯 DOM을 직접 만들기 때문에 필요하다.
 */
function installFakeDocument(): void {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => new FakeElement(),
  };
}

/**
 * 바와 상태를 준비한다.
 *
 * @param slotCount 슬롯 수.
 */
function setup(slotCount = 4) {
  const root = new FakeElement();
  const bar = new InventoryBar(root as unknown as HTMLElement, slotCount);
  const inventory = new Inventory({ slotCount, stackLimit: 10 });
  const storage = new Inventory({ slotCount: 8, stackLimit: 99 });

  /**
   * 기본 상태로 바를 갱신한다.
   *
   * @param overrides 바꿀 값.
   */
  const update = (overrides: Partial<Parameters<typeof bar.update>[0]> = {}) => {
    bar.update({
      inventory,
      storage,
      nearStorage: false,
      tool: { kind: ToolKind.SHOVEL, tier: ToolTier.BASIC },
      toolSlot: 0,
      toolCount: 3,
      buildMode: false,
      ...overrides,
    });
  };

  const modeElement = root.children[0]!;
  const toolElement = root.children[1]!;
  const slotRow = root.children[2]!;
  const storageElement = root.children[3]!;

  return { root, bar, inventory, storage, update, modeElement, toolElement, slotRow, storageElement };
}

describe('InventoryBar', () => {
  beforeEach(() => {
    installFakeDocument();
  });

  it('슬롯을 지정한 수만큼 만든다', () => {
    const { slotRow } = setup(6);

    expect(slotRow.children).toHaveLength(6);
  });

  it('빈 슬롯은 비워 두고, 채워진 슬롯은 개수와 색을 보여준다', () => {
    const { inventory, update, slotRow } = setup(4);
    inventory.add(ItemType.WOOD, 3);

    update();

    expect(slotRow.children[0]!.textContent).toBe('3');
    expect(slotRow.children[0]!.style.background).toBe(itemColor(ItemType.WOOD));
    expect(slotRow.children[0]!.title).toBe('목재 3');
    expect(slotRow.children[1]!.textContent).toBe('');
  });

  it('아이템이 비워지면 슬롯도 비운다', () => {
    const { inventory, update, slotRow } = setup(4);
    inventory.add(ItemType.WOOD, 3);
    update();

    inventory.remove(ItemType.WOOD, 3);
    update();

    expect(slotRow.children[0]!.textContent).toBe('');
    expect(slotRow.children[0]!.classList.contains('bar__slot--filled')).toBe(false);
  });

  it('내용이 그대로면 슬롯 DOM을 다시 만들지 않는다', () => {
    const { inventory, update, slotRow } = setup(4);
    inventory.add(ItemType.WOOD, 2);
    update();

    // 갱신 후 밖에서 텍스트를 바꿔 두고 다시 갱신해도 덮어쓰지 않아야 한다.
    slotRow.children[0]!.textContent = '표식';
    update();

    expect(slotRow.children[0]!.textContent).toBe('표식');
  });

  it('선택된 도구를 슬롯 번호와 함께 보여준다', () => {
    const { update, toolElement } = setup();

    update({ tool: { kind: ToolKind.PICKAXE, tier: ToolTier.MID }, toolSlot: 1 });

    expect(toolElement.textContent).toBe('중급 곡괭이 (2/3)');
  });

  it('창고 내용을 보여주고, 비었으면 그렇게 알린다', () => {
    const { storage, update, storageElement } = setup();

    update();
    expect(storageElement.textContent).toBe('창고: 비어 있음');

    storage.add(ItemType.WOOD, 12);
    update();
    expect(storageElement.textContent).toBe('창고: 목재 12');
  });

  it('모드 버튼이 현재 모드를 보여준다', () => {
    const { modeElement, update } = setup();

    update();
    expect(modeElement.textContent).toBe('채집 (B)');

    update({ buildMode: true });
    expect(modeElement.textContent).toBe('건축 (B)');
    expect(modeElement.classList.contains('bar__mode--build')).toBe(true);
  });

  it('창고에 손이 닿으면 예치 안내를 덧붙이고 강조한다', () => {
    const { update, storageElement } = setup();

    update({ nearStorage: true });

    expect(storageElement.textContent).toContain('E 예치');
    expect(storageElement.classList.contains('bar__storage--near')).toBe(true);
  });

  it('멀어지면 강조를 거둔다', () => {
    const { update, storageElement } = setup();
    update({ nearStorage: true });

    update({ nearStorage: false });

    expect(storageElement.classList.contains('bar__storage--near')).toBe(false);
  });
});

describe('InventoryBar 모드 버튼', () => {
  beforeEach(() => {
    installFakeDocument();
  });

  it('버튼을 누르면 등록한 콜백이 불린다', () => {
    const { bar, modeElement } = setup();
    let calls = 0;
    bar.setModeHandler(() => {
      calls += 1;
    });

    modeElement.emit('click');

    expect(calls).toBe(1);
  });

  it('콜백을 등록하지 않아도 클릭이 터지지 않는다', () => {
    const { modeElement } = setup();

    expect(() => modeElement.emit('click')).not.toThrow();
  });
});
