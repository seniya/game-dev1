import { describe, expect, it } from 'vitest';
import { BlockStash } from '../src/core/BlockStash';
import { BlockType } from '../src/core/blocks';
import { DebugOverlay } from '../src/ui/DebugOverlay';

/** textContent만 갖는 최소 엘리먼트 대역. */
function makeElement(): { textContent: string | null } {
  return { textContent: null };
}

/** 오버레이와 대역 엘리먼트를 함께 만든다. */
function setup() {
  const fps = makeElement();
  const info = makeElement();
  const stashText = makeElement();
  const overlay = new DebugOverlay(
    fps as unknown as HTMLElement,
    info as unknown as HTMLElement,
    stashText as unknown as HTMLElement,
  );

  return { fps, info, stashText, overlay, stash: new BlockStash() };
}

/** 테스트에서 반복 쓰는 기본 디버그 정보. */
const baseInfo = {
  hovered: { x: 3, y: 7 },
  hoveredHeight: 2,
  hoveredSurface: BlockType.DIRT,
  drawnColumns: 512,
  drawnWalls: 40,
  zoom: 1,
};

describe('DebugOverlay', () => {
  it('갱신 간격에 못 미치면 텍스트를 건드리지 않는다', () => {
    const { fps, info, overlay, stash } = setup();

    // 60fps로 5프레임 = 약 83ms. 250ms 미만이므로 아직 갱신되지 않는다.
    for (let i = 0; i < 5; i += 1) overlay.update(1000 / 60, baseInfo, stash);

    expect(fps.textContent).toBeNull();
    expect(info.textContent).toBeNull();
  });

  it('갱신 간격을 넘기면 FPS와 지형 정보를 쓴다', () => {
    const { fps, info, overlay, stash } = setup();

    for (let i = 0; i < 20; i += 1) overlay.update(1000 / 60, baseInfo, stash);

    expect(fps.textContent).toBe('60 fps');
    expect(info.textContent).toBe('타일 (3, 7) 흙 높이 2 · 윗면 512 측면 40 · 줌 1.00x');
  });

  it('커서가 지형 밖이면 좌표를 비워 표시한다', () => {
    const { info, overlay, stash } = setup();

    for (let i = 0; i < 20; i += 1) {
      overlay.update(1000 / 60, { ...baseInfo, hovered: null, hoveredHeight: 0 }, stash);
    }

    expect(info.textContent).toContain('타일 (--, --)');
  });

  it('표면 블록 이름을 함께 표시한다', () => {
    const { info, overlay, stash } = setup();

    for (let i = 0; i < 20; i += 1) {
      overlay.update(1000 / 60, { ...baseInfo, hoveredSurface: BlockType.IRON_ORE }, stash);
    }

    expect(info.textContent).toContain('철광석');
  });

  it('보유 블록이 없으면 없다고 표시한다', () => {
    const { stashText, overlay, stash } = setup();

    overlay.update(300, baseInfo, stash);

    expect(stashText.textContent).toBe('보유 없음');
  });

  it('보유 블록을 종류별로 표시한다', () => {
    const { stashText, overlay, stash } = setup();
    stash.add(BlockType.DIRT, 3);
    stash.add(BlockType.STONE, 1);

    overlay.update(300, baseInfo, stash);

    expect(stashText.textContent).toBe('보유 흙 3 · 돌 1');
  });

  it('확대율을 소수 둘째 자리까지 표시한다', () => {
    const { info, overlay, stash } = setup();

    overlay.update(300, { ...baseInfo, zoom: 1.234 }, stash);

    expect(info.textContent).toContain('줌 1.23x');
  });

  it('프레임률이 낮으면 한 프레임만으로도 갱신된다', () => {
    const { fps, overlay, stash } = setup();

    overlay.update(300, baseInfo, stash);

    expect(fps.textContent).toBe('3 fps');
  });
});
