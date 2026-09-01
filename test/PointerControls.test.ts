import { describe, expect, it } from 'vitest';
import { gridToWorld } from '../src/core/coordinates';
import { Camera } from '../src/render/Camera';
import { PointerControls } from '../src/ui/PointerControls';

/** 캔버스 좌상단이 화면 (0, 0)에 있다고 가정한 뷰포트 크기. */
const VIEWPORT = { width: 800, height: 600 };

/**
 * 이벤트 리스너를 붙였다 뗄 수 있는 최소 캔버스 대역.
 *
 * 실제 DOM 없이 포인터 조작을 재현하기 위한 것이다. 등록된 리스너를 직접
 * 호출하는 방식이라 이벤트 전파 규칙까지 흉내내지는 않는다.
 */
class FakeCanvas {
  /** 이벤트 타입별 등록된 리스너. */
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  /** 커서 스타일. PointerControls가 드래그 중 grabbing으로 바꾼다. */
  readonly style = { cursor: '' };

  /** 캡처된 포인터 id 집합. */
  private readonly captured = new Set<number>();

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

  /** 캔버스가 뷰포트 좌상단에 정확히 놓였다고 본다. */
  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }

  /**
   * 포인터 캡처를 잡는다.
   *
   * @param pointerId 포인터 id.
   */
  setPointerCapture(pointerId: number): void {
    this.captured.add(pointerId);
  }

  /**
   * 포인터 캡처 여부를 확인한다.
   *
   * @param pointerId 포인터 id.
   */
  hasPointerCapture(pointerId: number): boolean {
    return this.captured.has(pointerId);
  }

  /**
   * 포인터 캡처를 놓는다.
   *
   * @param pointerId 포인터 id.
   */
  releasePointerCapture(pointerId: number): void {
    this.captured.delete(pointerId);
  }

  /** 특정 타입에 등록된 리스너 수. detach 검증에 쓴다. */
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /**
   * 등록된 리스너를 직접 호출해 이벤트를 흘려보낸다.
   *
   * @param type 이벤트 타입.
   * @param event 리스너에 넘길 이벤트 객체.
   */
  emit(type: string, event: Record<string, unknown> = {}): void {
    const withDefaults = { type, preventDefault: () => {}, ...event };
    for (const handler of this.listeners.get(type) ?? []) handler(withDefaults);
  }
}

/**
 * 캔버스 대역과 컨트롤러를 준비한다. 카메라는 맵 원점을 화면 중앙에 둔다.
 */
function setup() {
  const canvas = new FakeCanvas();
  const camera = new Camera();
  camera.setViewport(VIEWPORT.width, VIEWPORT.height);

  const controls = new PointerControls(canvas as unknown as HTMLCanvasElement, camera);
  controls.attach();

  return { canvas, camera, controls };
}

/** 화면 중앙 좌표. */
const CENTER = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };

describe('PointerControls 피킹', () => {
  it('처음에는 올라간 타일이 없다', () => {
    const { controls } = setup();

    expect(controls.hovered).toBeNull();
  });

  it('화면 중앙에 커서를 두면 카메라가 보는 타일이 잡힌다', () => {
    const { canvas, camera, controls } = setup();
    const world = gridToWorld(9, 4, 0);
    camera.lookAt(world.x, world.y);

    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(controls.hovered).toEqual({ x: 9, y: 4 });
  });

  it('커서를 오른쪽-아래로 옮기면 x가 커지는 타일이 잡힌다', () => {
    const { canvas, controls } = setup();

    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x + 32, clientY: CENTER.y + 16 });

    expect(controls.hovered).toEqual({ x: 1, y: 0 });
  });

  it('커서를 왼쪽-아래로 옮기면 y가 커지는 타일이 잡힌다', () => {
    const { canvas, controls } = setup();

    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x - 32, clientY: CENTER.y + 16 });

    expect(controls.hovered).toEqual({ x: 0, y: 1 });
  });

  it('커서가 캔버스를 떠나면 하이라이트가 꺼진다', () => {
    const { canvas, controls } = setup();

    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });
    expect(controls.hovered).not.toBeNull();

    canvas.emit('pointerleave', {});
    expect(controls.hovered).toBeNull();
  });

  it('드래그 중에는 캔버스를 벗어나도 하이라이트를 유지한다', () => {
    const { canvas, controls } = setup();

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerleave', {});

    expect(controls.hovered).not.toBeNull();
  });
});

describe('PointerControls 팬', () => {
  it('드래그하면 카메라가 따라 움직인다', () => {
    const { canvas, camera, controls } = setup();
    const before = camera.center;

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: 400, clientY: 300 });
    expect(controls.dragging).toBe(true);
    canvas.emit('pointermove', { pointerId: 1, clientX: 460, clientY: 340 });
    canvas.emit('pointerup', { pointerId: 1, clientX: 460, clientY: 340 });

    expect(controls.dragging).toBe(false);
    expect(camera.center.x).toBeCloseTo(before.x - 60, 6);
    expect(camera.center.y).toBeCloseTo(before.y - 40, 6);
  });

  it('버튼을 누르지 않은 이동은 카메라를 움직이지 않는다', () => {
    const { canvas, camera } = setup();
    const before = camera.center;

    canvas.emit('pointermove', { pointerId: 1, clientX: 100, clientY: 100 });
    canvas.emit('pointermove', { pointerId: 1, clientX: 500, clientY: 500 });

    expect(camera.center).toEqual(before);
  });

  it('주 버튼이 아닌 입력은 팬으로 받지 않는다', () => {
    const { canvas, camera, controls } = setup();
    const before = camera.center;

    canvas.emit('pointerdown', { pointerId: 1, button: 2, clientX: 400, clientY: 300 });
    expect(controls.dragging).toBe(false);

    canvas.emit('pointermove', { pointerId: 1, clientX: 500, clientY: 400 });
    expect(camera.center).toEqual(before);
  });

  it('드래그 중 커서 스타일을 grabbing으로 바꾸고 끝나면 되돌린다', () => {
    const { canvas } = setup();

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: 400, clientY: 300 });
    expect(canvas.style.cursor).toBe('grabbing');

    canvas.emit('pointerup', { pointerId: 1, clientX: 400, clientY: 300 });
    expect(canvas.style.cursor).toBe('');
  });

  it('드래그 중 포인터 캡처를 잡고 끝나면 놓는다', () => {
    const { canvas } = setup();

    canvas.emit('pointerdown', { pointerId: 7, button: 0, clientX: 400, clientY: 300 });
    expect(canvas.hasPointerCapture(7)).toBe(true);

    canvas.emit('pointerup', { pointerId: 7, clientX: 400, clientY: 300 });
    expect(canvas.hasPointerCapture(7)).toBe(false);
  });

  it('다른 포인터의 up 이벤트로는 드래그가 끝나지 않는다', () => {
    const { canvas, controls } = setup();

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: 400, clientY: 300 });
    canvas.emit('pointerup', { pointerId: 2, clientX: 400, clientY: 300 });

    expect(controls.dragging).toBe(true);
  });
});

describe('PointerControls 줌', () => {
  it('휠을 위로 굴리면 확대된다', () => {
    const { canvas, camera } = setup();

    canvas.emit('wheel', { clientX: 400, clientY: 300, deltaY: -100 });

    expect(camera.zoom).toBeGreaterThan(1);
  });

  it('휠을 아래로 굴리면 축소된다', () => {
    const { canvas, camera } = setup();

    canvas.emit('wheel', { clientX: 400, clientY: 300, deltaY: 100 });

    expect(camera.zoom).toBeLessThan(1);
  });

  it('줌해도 커서 아래 타일은 그대로다', () => {
    const { canvas, camera, controls } = setup();
    const cursor = { x: 520, y: 250 };

    canvas.emit('pointermove', { pointerId: 1, clientX: cursor.x, clientY: cursor.y });
    const before = controls.hovered;

    canvas.emit('wheel', { clientX: cursor.x, clientY: cursor.y, deltaY: -100 });

    expect(camera.zoom).toBeGreaterThan(1);
    expect(controls.hovered).toEqual(before);
  });

  it('휠 이벤트는 브라우저 기본 동작을 막는다', () => {
    const { canvas } = setup();
    let prevented = false;

    canvas.emit('wheel', {
      clientX: 400,
      clientY: 300,
      deltaY: -100,
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(prevented).toBe(true);
  });
});

describe('PointerControls 클릭', () => {
  it('거의 움직이지 않은 조작은 타일 클릭으로 본다', () => {
    const { canvas, controls } = setup();
    const clicked: Array<{ x: number; y: number }> = [];
    controls.setTileClickHandler((tile) => clicked.push(tile));

    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x + 1, clientY: CENTER.y + 1 });

    expect(clicked).toEqual([{ x: 0, y: 0 }]);
  });

  it('팬으로 판정될 만큼 움직였으면 클릭으로 보지 않는다', () => {
    const { canvas, controls } = setup();
    let clicks = 0;
    controls.setTileClickHandler(() => {
      clicks += 1;
    });

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x + 40, clientY: CENTER.y });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x + 40, clientY: CENTER.y });

    expect(clicks).toBe(0);
  });

  it('pointercancel은 클릭으로 보지 않는다', () => {
    const { canvas, controls } = setup();
    let clicks = 0;
    controls.setTileClickHandler(() => {
      clicks += 1;
    });

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointercancel', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(clicks).toBe(0);
  });
});

describe('PointerControls 생명주기', () => {
  it('detach하면 등록한 리스너를 모두 뗀다', () => {
    const { canvas, controls } = setup();
    const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'wheel', 'contextmenu'];

    for (const type of types) expect(canvas.listenerCount(type)).toBeGreaterThan(0);

    controls.detach();

    for (const type of types) expect(canvas.listenerCount(type)).toBe(0);
  });

  it('detach 후에는 이벤트가 카메라에 영향을 주지 않는다', () => {
    const { canvas, camera, controls } = setup();
    controls.detach();
    const before = camera.center;

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: 400, clientY: 300 });
    canvas.emit('pointermove', { pointerId: 1, clientX: 500, clientY: 400 });

    expect(camera.center).toEqual(before);
  });
});

describe('PointerControls 터치 탭', () => {
  it('이동 없이 바로 눌러도 대상 타일이 정해진다', () => {
    const { canvas, controls } = setup();

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x + 32, clientY: CENTER.y + 16 });

    expect(controls.hovered).toEqual({ x: 1, y: 0 });
  });

  it('이동 없는 탭도 타일 클릭으로 전달된다', () => {
    const { canvas, controls } = setup();
    const clicked: Array<{ x: number; y: number }> = [];
    controls.setTileClickHandler((tile) => clicked.push(tile));

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(clicked).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('PointerControls 보조 버튼', () => {
  it('오른쪽 버튼 클릭은 secondary로 전달된다', () => {
    const { canvas, controls } = setup();
    const events: Array<{ tile: { x: number; y: number }; button: string }> = [];
    controls.setTileClickHandler((tile, button) => events.push({ tile, button }));

    canvas.emit('pointerdown', { pointerId: 1, button: 2, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(events).toEqual([{ tile: { x: 0, y: 0 }, button: 'secondary' }]);
  });

  it('왼쪽 버튼 클릭은 primary로 전달된다', () => {
    const { canvas, controls } = setup();
    const buttons: string[] = [];
    controls.setTileClickHandler((_tile, button) => buttons.push(button));

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(buttons).toEqual(['primary']);
  });

  it('오른쪽 버튼으로는 팬하지 않는다', () => {
    const { canvas, camera, controls } = setup();
    const before = camera.center;

    canvas.emit('pointerdown', { pointerId: 1, button: 2, clientX: 400, clientY: 300 });
    expect(controls.dragging).toBe(false);
    canvas.emit('pointermove', { pointerId: 1, clientX: 500, clientY: 400 });

    expect(camera.center).toEqual(before);
  });

  it('오른쪽 버튼은 끌었어도 놓은 자리의 클릭으로 본다 — 팬을 하지 않으므로', () => {
    const { canvas, controls } = setup();
    const clicked: Array<{ x: number; y: number }> = [];
    controls.setTileClickHandler((tile) => clicked.push(tile));

    canvas.emit('pointerdown', { pointerId: 1, button: 2, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x + 32, clientY: CENTER.y + 16 });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x + 32, clientY: CENTER.y + 16 });

    expect(clicked).toEqual([{ x: 1, y: 0 }]);
  });

  it('가운데 버튼은 아무 반응도 하지 않는다', () => {
    const { canvas, controls } = setup();
    let clicks = 0;
    controls.setTileClickHandler(() => {
      clicks += 1;
    });

    canvas.emit('pointerdown', { pointerId: 1, button: 1, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(clicks).toBe(0);
    expect(controls.dragging).toBe(false);
  });
});

describe('PointerControls 피커 주입', () => {
  it('주입한 피커의 결과를 그대로 호버 타일로 쓴다', () => {
    const canvas = new FakeCanvas();
    const camera = new Camera();
    camera.setViewport(VIEWPORT.width, VIEWPORT.height);

    const calls: Array<{ x: number; y: number }> = [];
    const controls = new PointerControls(
      canvas as unknown as HTMLCanvasElement,
      camera,
      (worldX, worldY) => {
        calls.push({ x: worldX, y: worldY });
        return { x: 12, y: 34 };
      },
    );
    controls.attach();

    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(controls.hovered).toEqual({ x: 12, y: 34 });
    // 화면 중앙이므로 카메라가 보는 월드 원점이 넘어간다.
    expect(calls).toEqual([{ x: 0, y: 0 }]);
  });

  it('피커가 null을 주면 호버가 없다 — 하늘이나 뚫린 자리를 가리킨 경우', () => {
    const canvas = new FakeCanvas();
    const camera = new Camera();
    camera.setViewport(VIEWPORT.width, VIEWPORT.height);

    const controls = new PointerControls(canvas as unknown as HTMLCanvasElement, camera, () => null);
    controls.attach();

    canvas.emit('pointermove', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(controls.hovered).toBeNull();
  });

  it('호버가 없으면 클릭도 전달되지 않는다', () => {
    const canvas = new FakeCanvas();
    const camera = new Camera();
    camera.setViewport(VIEWPORT.width, VIEWPORT.height);

    const controls = new PointerControls(canvas as unknown as HTMLCanvasElement, camera, () => null);
    controls.attach();

    let clicks = 0;
    controls.setTileClickHandler(() => {
      clicks += 1;
    });

    canvas.emit('pointerdown', { pointerId: 1, button: 0, clientX: CENTER.x, clientY: CENTER.y });
    canvas.emit('pointerup', { pointerId: 1, clientX: CENTER.x, clientY: CENTER.y });

    expect(clicks).toBe(0);
  });
});
