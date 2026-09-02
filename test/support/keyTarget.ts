/**
 * 키 이벤트를 직접 흘려보낼 수 있는 최소 이벤트 대상 대역.
 *
 * `KeyboardControls`와 `InputRouter`가 함께 쓴다 — 둘 다 DOM 없이 키 입력만으로
 * 돌려볼 수 있어야 한다.
 */
export class FakeTarget {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  /**
   * 리스너를 등록한다.
   *
   * @param type 이벤트 타입.
   * @param handler 리스너.
   */
  addEventListener(type: string, handler: (event: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
  }

  /**
   * 리스너를 뗀다.
   *
   * @param type 이벤트 타입.
   * @param handler 리스너.
   */
  removeEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  /** 특정 타입에 등록된 리스너 수. */
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /**
   * 키를 누른다.
   *
   * @param code 키 코드.
   * @returns preventDefault가 호출됐는지 여부.
   */
  keyDown(code: string, eventTarget?: unknown): boolean {
    let prevented = false;
    this.emit('keydown', {
      code,
      target: eventTarget,
      preventDefault: () => {
        prevented = true;
      },
    });
    return prevented;
  }

  /**
   * 키를 뗀다.
   *
   * @param code 키 코드.
   */
  keyUp(code: string): void {
    this.emit('keyup', { code, preventDefault: () => {} });
  }

  /** 창 포커스를 잃는다. */
  blur(): void {
    this.emit('blur', {});
  }

  /**
   * 등록된 리스너를 직접 호출한다.
   *
   * @param type 이벤트 타입.
   * @param event 리스너에 넘길 이벤트 객체.
   */
  private emit(type: string, event: Record<string, unknown>): void {
    for (const handler of this.listeners.get(type) ?? []) handler({ type, ...event });
  }
}
