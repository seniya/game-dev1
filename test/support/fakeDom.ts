/**
 * 최소 엘리먼트 대역. 필요한 속성만 흉내낸다.
 *
 * UI 컴포넌트들이 DOM을 직접 만들기 때문에 필요하다. 테스트는 node 환경에서 돌기 때문에
 * (`vite.config.ts`) 진짜 DOM이 없다 — 클릭도 `emit('click')`으로 흉내낸다.
 */
export class FakeElement {
  textContent: string | null = null;
  hidden = false;
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

  /** 자식을 모두 지운다. */
  replaceChildren(): void {
    this.children.length = 0;
  }

  /**
   * 자식 중 클래스가 붙은 것을 모은다. 테스트에서 특정 줄을 찾을 때 쓴다.
   *
   * @param name 찾을 클래스 이름.
   * @returns 찾은 엘리먼트들.
   */
  findAll(name: string): FakeElement[] {
    const found: FakeElement[] = [];
    const visit = (element: FakeElement): void => {
      // 컴포넌트들은 className으로 한 번에 넣기도 하고 classList로 더하기도 한다. 둘 다 본다.
      const inClassName = element.className.split(/\s+/).includes(name);
      if (inClassName || element.classList.contains(name)) found.push(element);
      for (const child of element.children) visit(child);
    };
    visit(this);

    return found;
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
export function installFakeDocument(): void {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => new FakeElement(),
  };
}

