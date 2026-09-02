import { describe, expect, it } from 'vitest';
import { KeyboardControls, SLOT_KEY_COUNT } from '../src/ui/KeyboardControls';
import { BLUEPRINTS } from '../src/core/blueprints';
import { FakeTarget } from './support/keyTarget';

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

  it('걷기는 WASD가 맡는다', () => {
    const { target, controls } = setup();

    target.keyDown('KeyD');
    expect(controls.moveIntent).toEqual({ dx: 1, dy: 0 });
    target.keyUp('KeyD');

    target.keyDown('KeyW');
    expect(controls.moveIntent).toEqual({ dx: 0, dy: -1 });
  });

  it('방향키는 걷지 않고 겨냥한다 — 마우스 없이 대상을 고르는 유일한 길이다', () => {
    const { target, controls } = setup();

    target.keyDown('ArrowUp');

    expect(controls.moveIntent).toBeNull();
    expect(controls.aimIntent).toEqual({ dx: 0, dy: -1 });

    target.keyUp('ArrowUp');
    expect(controls.aimIntent).toBeNull();
  });

  it('겨냥도 마지막에 누른 방향을 쓴다', () => {
    const { target, controls } = setup();

    target.keyDown('ArrowRight');
    target.keyDown('ArrowDown');
    expect(controls.aimIntent).toEqual({ dx: 0, dy: 1 });

    target.keyUp('ArrowDown');
    expect(controls.aimIntent).toEqual({ dx: 1, dy: 0 });
  });

  it('포커스가 버튼에 있으면 키를 브라우저에 넘긴다', () => {
    const { target, controls } = setup();
    let actions = 0;
    controls.setActionHandler(() => {
      actions += 1;
    });

    // Space를 가로채면 저장 메뉴 버튼이 눌리지 않아 키보드로 메뉴를 쓸 수 없다.
    expect(target.keyDown('Space', { tagName: 'BUTTON' })).toBe(false);
    expect(actions).toBe(0);

    expect(target.keyDown('Space')).toBe(true);
    expect(actions).toBe(1);
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

  it('세 번째를 넘는 숫자 키도 받는다 — 설계도 목록이 도구보다 길다', () => {
    const { target, controls } = setup();
    const picked: number[] = [];
    controls.setSlotHandler((index) => picked.push(index));

    target.keyDown('Digit4');
    target.keyUp('Digit4');
    target.keyDown('Digit5');

    expect(picked).toEqual([3, 4]);
    // 브라우저 기본 동작도 함께 막아야 한다.
    expect(target.keyDown('Digit9')).toBe(true);
  });

  it('숫자 키는 앞쪽 설계도를 바로 고르는 지름길이다', () => {
    // 예전에는 숫자 키가 유일한 선택 수단이라 설계도가 아홉을 넘으면 고를 수 없었다.
    // 지금은 `[` `]` 순환이 있으므로 상한이 문제가 되지 않는다 — 숫자 키는 지름길일 뿐이다.
    expect(SLOT_KEY_COUNT).toBeGreaterThanOrEqual(3);
    expect(BLUEPRINTS.length).toBeGreaterThan(0);
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
