/** 화면에 떠 있는 알림 하나. */
interface Toast {
  /** 표시 엘리먼트. */
  element: HTMLElement;
  /** 남은 표시 시간(ms). */
  remainingMs: number;
}

/** 알림이 화면에 머무는 시간(ms). */
const TOAST_LIFETIME_MS = 3200;

/** 동시에 띄울 수 있는 최대 개수. 넘치면 가장 오래된 것을 지운다. */
const MAX_TOASTS = 4;

/**
 * 짧은 알림 표시기.
 *
 * 기획서 7절이 "모든 안내는 짧은 토스트 알림과 아이콘으로 처리"를 요구하고
 * 대사창을 명시적으로 배제하므로, 이 클래스가 게임의 유일한 서술 창구다.
 *
 * 시간은 게임 루프의 고정 timestep으로 흐른다. CSS 애니메이션에 맡기지 않는 이유는
 * 게임이 멈췄을 때 알림만 계속 사라지는 상황을 피하려는 것이다.
 */
export class Toasts {
  private readonly root: HTMLElement;
  private readonly items: Toast[] = [];

  /**
   * @param root 알림을 담을 컨테이너.
   */
  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** 지금 떠 있는 알림 수. */
  get count(): number {
    return this.items.length;
  }

  /**
   * 알림을 띄운다.
   *
   * @param message 표시할 문구.
   * @param tone 강조 색. 기본은 중립.
   */
  show(message: string, tone: 'neutral' | 'good' | 'bad' = 'neutral'): void {
    const element = document.createElement('div');
    element.className = `toast toast--${tone}`;
    element.textContent = message;
    this.root.appendChild(element);

    this.items.push({ element, remainingMs: TOAST_LIFETIME_MS });

    while (this.items.length > MAX_TOASTS) {
      const oldest = this.items.shift();
      oldest?.element.remove();
    }
  }

  /**
   * 남은 시간을 줄이고 만료된 알림을 지운다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  update(stepMs: number): void {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const toast = this.items[i]!;
      toast.remainingMs -= stepMs;

      if (toast.remainingMs <= 0) {
        toast.element.remove();
        this.items.splice(i, 1);
        continue;
      }

      // 마지막 0.6초 동안 서서히 사라진다.
      if (toast.remainingMs < 600) {
        toast.element.style.opacity = String(toast.remainingMs / 600);
      }
    }
  }
}
