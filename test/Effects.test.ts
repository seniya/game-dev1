import { describe, expect, it } from 'vitest';
import { gridToWorld } from '../src/core/coordinates';
import { Camera } from '../src/render/Camera';
import { Effects } from '../src/render/Effects';

/** 그리기 호출을 기록하는 최소 컨텍스트 대역. */
class RecordingContext {
  readonly rects: Array<{ x: number; y: number; alpha: number; color: string }> = [];
  readonly texts: Array<{ text: string; x: number; y: number; alpha: number; color: string }> = [];

  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalAlpha = 1;
  font = '';
  textAlign = 'left';

  /**
   * 사각형을 채운다.
   *
   * @param x 좌상단 x.
   * @param y 좌상단 y.
   */
  fillRect(x: number, y: number): void {
    this.rects.push({ x, y, alpha: this.globalAlpha, color: this.fillStyle });
  }

  /**
   * 글자를 채운다.
   *
   * @param text 글자.
   * @param x x.
   * @param y y.
   */
  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y, alpha: this.globalAlpha, color: this.fillStyle });
  }

  /** 글자 외곽선. 기록하지 않는다. */
  strokeText(): void {}
}

/** 뷰포트가 설정된 카메라를 만든다. */
function makeCamera(): Camera {
  const camera = new Camera();
  camera.setViewport(800, 600);
  camera.lookAt(0, 0);
  return camera;
}

describe('Effects 파편', () => {
  it('처음에는 아무것도 없다', () => {
    expect(new Effects().count).toBe(0);
  });

  it('지정한 개수만큼 파편을 만든다', () => {
    const effects = new Effects();

    effects.burst(1, 1, 0, '#fff', 5);

    expect(effects.count).toBe(5);
  });

  it('수명이 다하면 사라진다', () => {
    const effects = new Effects();
    effects.burst(1, 1, 0, '#fff', 4);

    effects.update(300);
    expect(effects.count).toBe(4);

    effects.update(400);
    expect(effects.count).toBe(0);
  });

  it('파편은 시간이 지나며 움직인다', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();
    effects.burst(0, 0, 0, '#fff', 2);

    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);
    const start = ctx.rects.map((rect) => `${rect.x},${rect.y}`);

    ctx.rects.length = 0;
    effects.update(200);
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);

    expect(ctx.rects.map((rect) => `${rect.x},${rect.y}`)).not.toEqual(start);
  });

  it('시간이 지날수록 옅어진다', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();
    effects.burst(0, 0, 0, '#fff', 1);

    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);
    const first = ctx.rects[0]!.alpha;

    ctx.rects.length = 0;
    effects.update(300);
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);

    expect(ctx.rects[0]!.alpha).toBeLessThan(first);
  });

  it('파편은 그리드 좌표에 매여 있다 — 카메라를 움직이면 함께 움직인다', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();
    effects.burst(3, 3, 0, '#fff', 1);

    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);
    const before = ctx.rects[0]!.x;

    ctx.rects.length = 0;
    camera.panByScreen(100, 0);
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);

    expect(ctx.rects[0]!.x).toBeCloseTo(before + 100, 6);
  });
});

describe('Effects 떠오르는 글자', () => {
  it('글자를 띄우고 시간이 지나면 지운다', () => {
    const effects = new Effects();

    effects.float(1, 1, 0, '+3 목재', '#a4713c');
    expect(effects.count).toBe(1);

    effects.update(1200);
    expect(effects.count).toBe(0);
  });

  it('글자가 위로 떠오른다', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();
    effects.float(0, 0, 0, '+1 돌', '#fff');

    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);
    const first = ctx.texts[0]!.y;

    ctx.texts.length = 0;
    effects.update(500);
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);

    expect(ctx.texts[0]!.y).toBeLessThan(first);
  });

  it('처음에는 또렷하고 끝에서만 옅어진다 — 처음부터 흐리면 읽기 어렵다', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();
    effects.float(0, 0, 0, '+1 돌', '#fff');

    effects.update(400);
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);
    expect(ctx.texts[0]!.alpha).toBe(1);

    ctx.texts.length = 0;
    effects.update(500);
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);
    expect(ctx.texts[0]!.alpha).toBeLessThan(1);
  });

  it('내용과 색이 그대로 전달된다', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();

    effects.float(2, 2, 1, '+5 목재', '#a4713c');
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);

    expect(ctx.texts[0]!.text).toBe('+5 목재');
    expect(ctx.texts[0]!.color).toBe('#a4713c');
  });

  it('높이가 반영된다 — 언덕 위 채집은 더 위에 뜬다', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();

    effects.float(0, 0, 0, 'a', '#fff');
    effects.float(0, 0, 3, 'b', '#fff');
    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);

    const low = ctx.texts.find((text) => text.text === 'a')!;
    const high = ctx.texts.find((text) => text.text === 'b')!;
    expect(high.y).toBeLessThan(low.y);
    // 실제 좌표 변환과 어긋나지 않는지 함께 본다.
    expect(gridToWorld(0, 0, 3).y).toBeLessThan(gridToWorld(0, 0, 0).y);
  });
});

describe('Effects 정리', () => {
  it('clear로 모두 지운다', () => {
    const effects = new Effects();
    effects.burst(1, 1, 0, '#fff', 4);
    effects.float(1, 1, 0, '+1', '#fff');

    effects.clear();

    expect(effects.count).toBe(0);
  });

  it('그린 뒤 전역 상태를 되돌린다 — 다음 그리기가 영향을 받지 않게', () => {
    const effects = new Effects();
    const camera = makeCamera();
    const ctx = new RecordingContext();
    effects.burst(0, 0, 0, '#fff', 2);
    effects.float(0, 0, 0, '+1', '#fff');

    effects.draw(ctx as unknown as CanvasRenderingContext2D, camera);

    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.textAlign).toBe('left');
  });
});
