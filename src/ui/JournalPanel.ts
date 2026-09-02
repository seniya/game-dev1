/**
 * 플레이 기록을 보여주는 패널.
 *
 * "기록 복사"는 클립보드를 쓰지만, 브라우저가 권한을 주지 않으면 아무것도 얻지 못한다.
 * 그러면 기록이 있으나 없는 것과 같다 — 그래서 **화면에도 띄운다.** 복사가 되든 안 되든
 * 눈으로 읽고 직접 골라 복사할 수 있어야 한다.
 *
 * 기획서 7절이 대사창을 배제하므로 모달이 아니라 화면 한쪽에 붙는 상자다. 열려 있는
 * 동안에도 게임은 계속 돌아간다.
 */
export class JournalPanel {
  private readonly root: HTMLElement;

  /** 기록 글을 담는 곳. */
  private readonly body: HTMLElement;

  /** 열려 있는지. */
  private open = false;

  /**
   * @param root 표시 컨테이너.
   */
  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = 'journal';

    const title = document.createElement('div');
    title.className = 'journal__title';
    title.textContent = '플레이 기록 (눌러서 닫기)';

    this.body = document.createElement('pre');
    this.body.className = 'journal__body';

    this.root.appendChild(title);
    this.root.appendChild(this.body);
    this.root.addEventListener('click', () => this.close());
    this.apply();
  }

  /** 열려 있는지 여부. */
  get visible(): boolean {
    return this.open;
  }

  /**
   * 기록을 띄운다.
   *
   * @param text 보여줄 글.
   */
  show(text: string): void {
    this.body.textContent = text;
    this.open = true;
    this.apply();
  }

  /** 닫는다. */
  close(): void {
    if (!this.open) return;

    this.open = false;
    this.apply();
  }

  /** 표시 상태를 DOM에 반영한다. */
  private apply(): void {
    this.root.classList.toggle('journal--open', this.open);
  }
}
