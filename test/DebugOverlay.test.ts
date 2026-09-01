import { describe, expect, it } from 'vitest';
import { DebugOverlay } from '../src/ui/DebugOverlay';

/** textContent만 갖는 최소 엘리먼트 대역. */
function makeElement(): { textContent: string | null } {
  return { textContent: null };
}

/**
 * 오버레이와 대역 엘리먼트를 함께 만든다.
 */
function setup() {
  const fps = makeElement();
  const info = makeElement();
  const overlay = new DebugOverlay(fps as unknown as HTMLElement, info as unknown as HTMLElement);

  return { fps, info, overlay };
}

/** 테스트에서 반복 쓰는 기본 디버그 정보. */
const baseInfo = { hovered: { x: 3, y: 7 }, drawnTiles: 512, zoom: 1 };

describe('DebugOverlay', () => {
  it('갱신 간격에 못 미치면 텍스트를 건드리지 않는다', () => {
    const { fps, info, overlay } = setup();

    // 60fps로 5프레임 = 약 83ms. 250ms 미만이므로 아직 갱신되지 않는다.
    for (let i = 0; i < 5; i += 1) overlay.update(1000 / 60, baseInfo);

    expect(fps.textContent).toBeNull();
    expect(info.textContent).toBeNull();
  });

  it('갱신 간격을 넘기면 FPS와 타일 정보를 쓴다', () => {
    const { fps, info, overlay } = setup();

    for (let i = 0; i < 20; i += 1) overlay.update(1000 / 60, baseInfo);

    expect(fps.textContent).toBe('60 fps');
    expect(info.textContent).toBe('타일 (3, 7) · 그린 타일 512 · 줌 1.00x');
  });

  it('커서가 캔버스 밖이면 좌표를 비워 표시한다', () => {
    const { info, overlay } = setup();

    for (let i = 0; i < 20; i += 1) {
      overlay.update(1000 / 60, { ...baseInfo, hovered: null });
    }

    expect(info.textContent).toContain('타일 (--, --)');
  });

  it('확대율을 소수 둘째 자리까지 표시한다', () => {
    const { info, overlay } = setup();

    for (let i = 0; i < 20; i += 1) {
      overlay.update(1000 / 60, { ...baseInfo, zoom: 1.234 });
    }

    expect(info.textContent).toContain('줌 1.23x');
  });

  it('프레임률이 낮으면 한 프레임만으로도 갱신된다', () => {
    const { fps, overlay } = setup();

    // 300ms 프레임 한 번 = 약 3fps.
    overlay.update(300, baseInfo);

    expect(fps.textContent).toBe('3 fps');
  });
});
