import type { Inventory } from '../core/Inventory';
import { itemColor, itemLabel } from '../core/items';
import { toolLabel, type Tool } from '../core/tools';

/** 하단 바에 표시할 상태. */
export interface BarState {
  /** 플레이어 인벤토리. */
  inventory: Inventory;
  /** 마을 창고. */
  storage: Inventory;
  /** 지금 창고에 손이 닿는지. */
  nearStorage: boolean;
  /** 선택된 도구. */
  tool: Tool;
  /** 선택된 도구 슬롯 번호. */
  toolSlot: number;
  /** 보유 도구 수. */
  toolCount: number;
}

/**
 * 화면 하단의 인벤토리 바.
 *
 * 캔버스에 그리지 않고 DOM으로 만든다 — 텍스트 렌더링과 레이아웃을 브라우저에
 * 맡기는 편이 정확하고, 게임 화면과 UI가 서로 간섭하지 않는다.
 *
 * 매 프레임 DOM을 다시 만들지 않는다. `Inventory.revision`이 바뀌었을 때만
 * 슬롯을 갱신하고, 도구·창고 근접 표시처럼 값이 작은 것만 매번 확인한다.
 */
export class InventoryBar {
  private readonly root: HTMLElement;
  private readonly slotElements: HTMLElement[] = [];
  private readonly toolElement: HTMLElement;
  private readonly storageElement: HTMLElement;

  /** 마지막으로 그린 인벤토리 변경 번호. */
  private lastInventoryRevision = -1;
  /** 마지막으로 그린 창고 변경 번호. */
  private lastStorageRevision = -1;
  /** 마지막으로 그린 창고 근접 여부. */
  private lastNearStorage: boolean | null = null;
  /** 마지막으로 그린 도구 설명. */
  private lastToolText = '';

  /**
   * @param root 하단 바 컨테이너.
   * @param slotCount 만들어 둘 슬롯 수.
   */
  constructor(root: HTMLElement, slotCount: number) {
    this.root = root;

    const slotRow = document.createElement('div');
    slotRow.className = 'bar__slots';
    for (let i = 0; i < slotCount; i += 1) {
      const slot = document.createElement('div');
      slot.className = 'bar__slot';
      slotRow.appendChild(slot);
      this.slotElements.push(slot);
    }

    this.toolElement = document.createElement('div');
    this.toolElement.className = 'bar__tool';

    this.storageElement = document.createElement('div');
    this.storageElement.className = 'bar__storage';

    this.root.appendChild(this.toolElement);
    this.root.appendChild(slotRow);
    this.root.appendChild(this.storageElement);
  }

  /**
   * 바를 갱신한다. 매 프레임 호출해도 실제 DOM 변경은 필요할 때만 일어난다.
   *
   * @param state 표시할 상태.
   */
  update(state: BarState): void {
    if (state.inventory.revision !== this.lastInventoryRevision) {
      this.lastInventoryRevision = state.inventory.revision;
      this.renderSlots(state.inventory);
    }

    const toolText = `${toolLabel(state.tool)} (${state.toolSlot + 1}/${state.toolCount})`;
    if (toolText !== this.lastToolText) {
      this.lastToolText = toolText;
      this.toolElement.textContent = toolText;
    }

    if (
      state.storage.revision !== this.lastStorageRevision ||
      state.nearStorage !== this.lastNearStorage
    ) {
      this.lastStorageRevision = state.storage.revision;
      this.lastNearStorage = state.nearStorage;
      this.renderStorage(state.storage, state.nearStorage);
    }
  }

  /**
   * 슬롯들을 다시 그린다.
   *
   * @param inventory 플레이어 인벤토리.
   */
  private renderSlots(inventory: Inventory): void {
    for (let i = 0; i < this.slotElements.length; i += 1) {
      const element = this.slotElements[i]!;
      const slot = inventory.slotAt(i);

      if (!slot) {
        element.textContent = '';
        element.style.background = '';
        element.title = '';
        element.classList.remove('bar__slot--filled');
        continue;
      }

      element.textContent = String(slot.count);
      element.style.background = itemColor(slot.item);
      element.title = `${itemLabel(slot.item)} ${slot.count}`;
      element.classList.add('bar__slot--filled');
    }
  }

  /**
   * 창고 요약을 다시 그린다.
   *
   * @param storage 창고.
   * @param near 손이 닿는지 여부.
   */
  private renderStorage(storage: Inventory, near: boolean): void {
    const parts: string[] = [];
    for (const item of storage.heldTypes) {
      parts.push(`${itemLabel(item)} ${storage.count(item)}`);
    }

    const contents = parts.length > 0 ? parts.join(' · ') : '비어 있음';
    this.storageElement.textContent = near ? `창고: ${contents} — E 예치` : `창고: ${contents}`;
    this.storageElement.classList.toggle('bar__storage--near', near);
  }
}
