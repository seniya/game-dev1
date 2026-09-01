import { describe, expect, it } from 'vitest';
import { KeyboardControls } from '../src/ui/KeyboardControls';

/** 키 이벤트를 직접 흘려보낼 수 있는 최소 이벤트 대상 대역. */
class FakeTarget {
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
  keyDown(code: string): boolean {
    let prevented = false;
    this.emit('keydown', { code, preventDefault: () => { prevented = true; } });
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

/** 대역 대상에 붙인 컨트롤러를 준비한다. */
function setup() {
  const target = new FakeTarget();
  const controls = new KeyboardControls(target as unknown as EventTarget);
  controls.attach();
  return { target, controls };
}

describe('KeyboardControls 이동', () => {
  it('아무 키도 안 눌리면 이동 의도가 없다', () => {
    const { controls } = setup();

    expect(controls.moveIntent).toBeNull();
  });

  it('WASD와 방향키를 모두 받는다', () => {
    const { target, controls } = setup();

    target.keyDown('KeyD');
    expect(controls.moveIntent).toEqual({ dx: 1, dy: 0 });
    target.keyUp('KeyD');

    target.keyDown('ArrowUp');
    expect(controls.moveIntent).toEqual({ dx: 0, dy: -1 });
  });

  it('키를 떼면 이동 의도가 사라진다', () => {
    const { target, controls } = setup();

    target.keyDown('KeyS');
    target.keyUp('KeyS');

    expect(controls.moveIntent).toBeNull();
  });

  it('두 방향이 눌려 있으면 나중에 누른 쪽을 쓴다', () => {
    const { target, controls } = setup();

    target.keyDown('KeyD');
    target.keyDown('KeyS');
    expect(controls.moveIntent).toEqual({ dx: 0, dy: 1 });

    // 나중에 누른 키를 떼면 먼저 누른 방향으로 돌아간다.
    target.keyUp('KeyS');
    expect(controls.moveIntent).toEqual({ dx: 1, dy: 0 });
  });

  it('OS 키 반복으로 오는 중복 keydown은 상태를 흐트러뜨리지 않는다', () => {
    const { target, controls } = setup();

    target.keyDown('KeyD');
    target.keyDown('KeyD');
    target.keyDown('KeyD');
    target.keyUp('KeyD');

    expect(controls.moveIntent).toBeNull();
  });

  it('이동·도구·상호작용 키는 브라우저 기본 동작을 막는다', () => {
    const { target } = setup();

    expect(target.keyDown('ArrowDown')).toBe(true);
    expect(target.keyDown('Space')).toBe(true);
    expect(target.keyDown('Digit1')).toBe(true);
    expect(target.keyDown('KeyQ')).toBe(false);
  });
});

describe('KeyboardControls 도구와 상호작용', () => {
  it('숫자 키로 도구 슬롯을 고른다', () => {
    const { target, controls } = setup();
    const picked: number[] = [];
    controls.setSlotHandler((index) => picked.push(index));

    target.keyDown('Digit1');
    target.keyUp('Digit1');
    target.keyDown('Digit3');

    expect(picked).toEqual([0, 2]);
  });

  it('상호작용 키는 누른 순간 한 번만 콜백을 부른다', () => {
    const { target, controls } = setup();
    let calls = 0;
    controls.setActionHandler(() => {
      calls += 1;
    });

    target.keyDown('Space');
    target.keyDown('Space'); // 키 반복
    expect(calls).toBe(1);
    expect(controls.actionHeld).toBe(true);

    target.keyUp('Space');
    expect(controls.actionHeld).toBe(false);

    target.keyDown('Space');
    expect(calls).toBe(2);
  });
});

describe('KeyboardControls 생명주기', () => {
  it('포커스를 잃으면 눌린 키 상태를 모두 지운다', () => {
    const { target, controls } = setup();

    target.keyDown('KeyD');
    target.keyDown('Space');
    target.blur();

    expect(controls.moveIntent).toBeNull();
    expect(controls.actionHeld).toBe(false);
  });

  it('detach하면 리스너를 모두 떼고 상태를 지운다', () => {
    const { target, controls } = setup();
    target.keyDown('KeyD');

    controls.detach();

    expect(target.listenerCount('keydown')).toBe(0);
    expect(target.listenerCount('keyup')).toBe(0);
    expect(controls.moveIntent).toBeNull();
  });
});
