import { ALL_CONTROLS } from '../core/guidance';

/**
 * 조작 도움말.
 *
 * 조작 안내 한 줄은 상황에 맞는 서너 개만 보여준다(로드맵 04 Phase 3). 나머지 키는
 * 사라지는 것이 아니라 여기 모인다 — **감춘 기능은 없는 기능이 된다.**
 *
 * 기획서 7절이 대사창을 배제하므로 모달 창이 아니라 화면 한쪽에 붙는 목록이다.
 * 열려 있는 동안에도 게임은 계속 돌아간다.
 */
export class HelpPanel {
  private readonly root: HTMLElement;

  /** 열려 있는지. */
  private open = false;

  /**
   * @param root 표시 컨테이너.
   */
  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = 'help';
    this.render();
    this.apply();
  }

  /** 열려 있는지 여부. */
  get visible(): boolean {
    return this.open;
  }

  /** 열고 닫는다. */
  toggle(): void {
    this.open = !this.open;
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
    this.root.classList.toggle('help--open', this.open);
  }

  /** 목록을 한 번 그린다. 내용이 바뀌지 않으므로 매 프레임 손대지 않는다. */
  private render(): void {
    this.root.replaceChildren();

    const title = document.createElement('div');
    title.className = 'help__title';
    title.textContent = '조작 (H로 닫기)';
    this.root.appendChild(title);

    for (const control of ALL_CONTROLS) {
      const row = document.createElement('div');
      row.className = 'help__row';

      const keys = document.createElement('span');
      keys.className = 'help__keys';
      keys.textContent = control.keys;

      const what = document.createElement('span');
      what.className = 'help__what';
      what.textContent = control.what;

      row.appendChild(keys);
      row.appendChild(what);
      this.root.appendChild(row);
    }
  }
}
