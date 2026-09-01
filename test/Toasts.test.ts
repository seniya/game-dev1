import { beforeEach, describe, expect, it } from 'vitest';
import { Toasts } from '../src/ui/Toasts';

/** 최소 엘리먼트 대역. */
class FakeElement {
  textContent: string | null = null;
  className = '';
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  private parent: FakeElement | null = null;

  /**
   * 자식을 붙인다.
   *
   * @param child 붙일 엘리먼트.
   */
  appendChild(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  /** 부모에서 자신을 떼어낸다. */
  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

/** document.createElement를 대역으로 바꾼다. */
function installFakeDocument(): void {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => new FakeElement(),
  };
}

describe('Toasts', () => {
  let root: FakeElement;
  let toasts: Toasts;

  beforeEach(() => {
    installFakeDocument();
    root = new FakeElement();
    toasts = new Toasts(root as unknown as HTMLElement);
  });

  it('처음에는 아무것도 떠 있지 않다', () => {
    expect(toasts.count).toBe(0);
    expect(root.children).toHaveLength(0);
  });

  it('알림을 띄우면 문구가 담긴 엘리먼트가 붙는다', () => {
    toasts.show('새 주민이 이주했습니다');

    expect(toasts.count).toBe(1);
    expect(root.children[0]!.textContent).toBe('새 주민이 이주했습니다');
  });

  it('강조 색을 클래스로 구분한다', () => {
    toasts.show('완료', 'good');
    toasts.show('실패', 'bad');

    expect(root.children[0]!.className).toContain('toast--good');
    expect(root.children[1]!.className).toContain('toast--bad');
  });

  it('시간이 지나면 사라진다', () => {
    toasts.show('알림');

    toasts.update(1000);
    expect(toasts.count).toBe(1);

    toasts.update(5000);
    expect(toasts.count).toBe(0);
    expect(root.children).toHaveLength(0);
  });

  it('사라지기 직전에는 서서히 옅어진다', () => {
    toasts.show('알림');

    toasts.update(2900);

    const opacity = Number(root.children[0]!.style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it('여러 알림이 각자 시간을 갖는다', () => {
    toasts.show('첫째');
    toasts.update(2000);
    toasts.show('둘째');

    toasts.update(1500);

    expect(toasts.count).toBe(1);
    expect(root.children[0]!.textContent).toBe('둘째');
  });

  it('너무 많이 쌓이면 오래된 것을 지운다', () => {
    for (let i = 0; i < 7; i += 1) toasts.show(`알림 ${i}`);

    expect(toasts.count).toBe(4);
    expect(root.children[0]!.textContent).toBe('알림 3');
  });
});
