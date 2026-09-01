/** 이동 방향. 그리드 델타로 표현한다. */
export interface MoveIntent {
  dx: number;
  dy: number;
}

/**
 * 키 → 이동 델타 표. WASD와 방향키를 모두 받는다.
 *
 * 아이소메트릭 화면에서 W는 "화면 위쪽"이 자연스러우므로 그리드 -y가 아니라
 * 화면 기준으로 매핑한다. 그리드 x는 화면 오른쪽-아래, y는 왼쪽-아래이므로
 * 화면 위쪽 = (-x, -y), 오른쪽 = (+x, -y) 조합이 되지만, 4방향 이동만 지원하는
 * 이상 정확한 대각 매핑은 불가능하다. 여기서는 **그리드 축에 직접** 매핑해
 * 조작과 결과가 1:1로 대응하게 한다 — 어느 키가 어느 축인지 화면 안내로 알린다.
 */
const KEY_MOVES: Readonly<Record<string, MoveIntent>> = {
  KeyD: { dx: 1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  KeyA: { dx: -1, dy: 0 },
  ArrowLeft: { dx: -1, dy: 0 },
  KeyS: { dx: 0, dy: 1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyW: { dx: 0, dy: -1 },
  ArrowUp: { dx: 0, dy: -1 },
};

/** 도구 슬롯 선택 키. */
const KEY_SLOTS: Readonly<Record<string, number>> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
};

/** 상호작용(휘두르기) 키. */
const ACTION_KEY = 'Space';

/**
 * 키보드 입력 상태를 모으는 컨트롤러.
 *
 * 이벤트를 게임 로직에 곧바로 흘리지 않고 "지금 눌려 있는 키" 상태로 모은다.
 * 게임 루프가 고정 timestep으로 도는데 키 이벤트는 OS 반복 속도로 오기 때문에,
 * 이벤트마다 이동을 시도하면 이동 속도가 기기 설정에 좌우된다.
 */
export class KeyboardControls {
  /** 지금 눌려 있는 키 코드. */
  private readonly pressed = new Set<string>();

  /** 이동 키가 눌린 순서. 마지막에 누른 방향을 우선한다. */
  private readonly moveOrder: string[] = [];

  /** 도구 슬롯 선택 콜백. */
  private onSelectSlot: ((index: number) => void) | null = null;

  /** 상호작용 키를 누른 순간의 콜백. */
  private onAction: (() => void) | null = null;

  /** 이벤트 대상. 보통 window다. */
  private readonly target: EventTarget;

  /**
   * @param target 키 이벤트를 받을 대상. 기본값은 window.
   */
  constructor(target: EventTarget = window) {
    this.target = target;
  }

  /**
   * 도구 슬롯 선택 콜백을 등록한다.
   *
   * @param handler 슬롯 번호를 받는 콜백.
   */
  setSlotHandler(handler: (index: number) => void): void {
    this.onSelectSlot = handler;
  }

  /**
   * 상호작용 콜백을 등록한다. 키를 누른 순간 한 번만 호출된다.
   *
   * @param handler 콜백.
   */
  setActionHandler(handler: () => void): void {
    this.onAction = handler;
  }

  /** 이벤트 리스너를 붙인다. */
  attach(): void {
    this.target.addEventListener('keydown', this.handleKeyDown);
    this.target.addEventListener('keyup', this.handleKeyUp);
    this.target.addEventListener('blur', this.handleBlur);
  }

  /** 붙였던 리스너를 뗀다. */
  detach(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.target.removeEventListener('blur', this.handleBlur);
    this.reset();
  }

  /**
   * 지금 눌려 있는 이동 방향을 돌려준다. 여러 방향이 눌려 있으면
   * 가장 나중에 누른 것을 쓴다 — 방향 전환이 즉시 반응하게 하려는 것이다.
   *
   * @returns 이동 델타. 눌린 이동 키가 없으면 null.
   */
  get moveIntent(): MoveIntent | null {
    for (let i = this.moveOrder.length - 1; i >= 0; i -= 1) {
      const move = KEY_MOVES[this.moveOrder[i]!];
      if (move) return move;
    }

    return null;
  }

  /** 상호작용 키가 눌려 있는지 여부. 꾹 눌러 연속 채집할 때 쓴다. */
  get actionHeld(): boolean {
    return this.pressed.has(ACTION_KEY);
  }

  /** 눌린 키 상태를 모두 지운다. 창 포커스를 잃었을 때 호출한다. */
  reset(): void {
    this.pressed.clear();
    this.moveOrder.length = 0;
  }

  /**
   * 키를 눌렀을 때.
   *
   * @param event 키 이벤트.
   */
  private handleKeyDown = (event: Event): void => {
    const keyEvent = event as KeyboardEvent;
    const code = keyEvent.code;

    // 스페이스로 페이지가 스크롤되거나 방향키로 화면이 밀리는 것을 막는다.
    if (code in KEY_MOVES || code in KEY_SLOTS || code === ACTION_KEY) {
      keyEvent.preventDefault?.();
    }

    // OS 키 반복으로 오는 중복 keydown은 상태만 유지하고 콜백은 부르지 않는다.
    if (this.pressed.has(code)) return;
    this.pressed.add(code);

    if (code in KEY_MOVES) this.moveOrder.push(code);

    const slot = KEY_SLOTS[code];
    if (slot !== undefined) this.onSelectSlot?.(slot);

    if (code === ACTION_KEY) this.onAction?.();
  };

  /**
   * 키를 뗐을 때.
   *
   * @param event 키 이벤트.
   */
  private handleKeyUp = (event: Event): void => {
    const code = (event as KeyboardEvent).code;
    this.pressed.delete(code);

    const index = this.moveOrder.indexOf(code);
    if (index >= 0) this.moveOrder.splice(index, 1);
  };

  /** 창 포커스를 잃으면 키가 눌린 채로 남는 것을 막는다. */
  private handleBlur = (): void => {
    this.reset();
  };
}
