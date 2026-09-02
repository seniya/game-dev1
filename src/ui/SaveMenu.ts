/** 저장 메뉴가 표시할 상태. */
export interface SaveMenuState {
  /** 저장소를 쓸 수 있는지. */
  available: boolean;
  /** 마지막으로 저장한 시각(epoch ms). 아직 저장한 적이 없으면 null. */
  lastSavedAt: number | null;
  /** 마지막 저장이 실패했다면 그 이유. */
  failure: 'quota' | 'unavailable' | null;
  /** 현재 볼륨 단계 번호. */
  volumeStep: number;
  /** 볼륨 단계 개수. */
  volumeSteps: number;
}

/**
 * "새로 시작"을 한 번 더 눌러 확인받는 시간(ms).
 *
 * 확인 창을 띄우지 않는 이유는 기획서 7절이 대사창을 배제하기 때문이다. 대신 버튼 문구가
 * 바뀌고 잠시 뒤 원래대로 돌아간다 — 실수로 두 번 누를 일이 거의 없다.
 */
const CONFIRM_WINDOW_MS = 3000;

/**
 * 저장·불러오기·새로 시작 메뉴.
 *
 * 자동 저장이 기본이므로 이 메뉴는 "지금 저장", "마지막 저장으로 되돌리기", "새로 시작"
 * 세 가지만 제공한다. 저장 슬롯을 고르는 UI는 두지 않는다 — 슬롯이 하나뿐이다.
 */
export class SaveMenu {
  private readonly root: HTMLElement;
  private readonly statusElement: HTMLElement;
  private readonly saveButton: HTMLElement;
  private readonly loadButton: HTMLElement;
  private readonly resetButton: HTMLElement;
  private readonly volumeButton: HTMLElement;
  private readonly journalButton: HTMLElement;

  /** "새로 시작" 확인 대기 남은 시간(ms). 0이면 대기 중이 아니다. */
  private confirmRemainingMs = 0;

  /** 마지막으로 그린 상태 문구. */
  private lastStatus = '';

  private onSave: (() => void) | null = null;
  private onLoad: (() => void) | null = null;
  private onReset: (() => void) | null = null;
  private onVolume: (() => void) | null = null;
  private onCopyJournal: (() => void) | null = null;

  /** 마지막으로 그린 볼륨 문구. */
  private lastVolumeText = '';

  /**
   * @param root 메뉴 컨테이너.
   */
  constructor(root: HTMLElement) {
    this.root = root;

    this.statusElement = document.createElement('div');
    this.statusElement.className = 'save__status';

    this.saveButton = this.makeButton('저장', () => this.onSave?.());
    this.loadButton = this.makeButton('되돌리기', () => this.onLoad?.());
    this.resetButton = this.makeButton('새로 시작', () => this.handleReset());
    this.volumeButton = this.makeButton('소리', () => this.onVolume?.());
    // 플레이 기록을 한 덩이 글로 복사한다. 남에게 건넨 뒤 "어디서 막혔는지"를 아는
    // 유일한 길이다(로드맵 05 Phase 3).
    this.journalButton = this.makeButton('기록 복사', () => this.onCopyJournal?.());

    const buttons = document.createElement('div');
    buttons.className = 'save__buttons';
    buttons.appendChild(this.volumeButton);
    buttons.appendChild(this.journalButton);
    buttons.appendChild(this.saveButton);
    buttons.appendChild(this.loadButton);
    buttons.appendChild(this.resetButton);

    this.root.appendChild(this.statusElement);
    this.root.appendChild(buttons);
  }

  /**
   * 콜백을 등록한다.
   *
   * @param handlers 저장·되돌리기·새로 시작 콜백.
   */
  setHandlers(handlers: { save: () => void; load: () => void; reset: () => void }): void {
    this.onSave = handlers.save;
    this.onLoad = handlers.load;
    this.onReset = handlers.reset;
  }

  /**
   * 볼륨 버튼 콜백을 등록한다.
   *
   * @param handler 콜백.
   */
  setVolumeHandler(handler: () => void): void {
    this.onVolume = handler;
  }

  /**
   * 기록 복사 콜백을 등록한다.
   *
   * @param handler 콜백.
   */
  setJournalHandler(handler: () => void): void {
    this.onCopyJournal = handler;
  }

  /**
   * 표시를 갱신한다.
   *
   * @param state 표시할 상태.
   * @param stepMs 지난 시간(ms). 확인 대기 시간을 줄이는 데 쓴다.
   */
  update(state: SaveMenuState, stepMs = 0): void {
    if (this.confirmRemainingMs > 0) {
      this.confirmRemainingMs -= stepMs;
      if (this.confirmRemainingMs <= 0) {
        this.confirmRemainingMs = 0;
        this.resetButton.textContent = '새로 시작';
        this.resetButton.classList.remove('save__button--danger');
      }
    }

    const volumeText = describeVolume(state.volumeStep, state.volumeSteps);
    if (volumeText !== this.lastVolumeText) {
      this.lastVolumeText = volumeText;
      this.volumeButton.textContent = volumeText;
      this.volumeButton.classList.toggle('save__button--off', state.volumeStep === 0);
    }

    const status = describeStatus(state);
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.statusElement.textContent = status;
      this.statusElement.classList.toggle('save__status--bad', state.failure !== null);
    }
  }

  /** "새로 시작"을 눌렀을 때. 한 번 더 눌러야 실제로 실행한다. */
  private handleReset(): void {
    if (this.confirmRemainingMs > 0) {
      this.confirmRemainingMs = 0;
      this.resetButton.textContent = '새로 시작';
      this.resetButton.classList.remove('save__button--danger');
      this.onReset?.();
      return;
    }

    this.confirmRemainingMs = CONFIRM_WINDOW_MS;
    this.resetButton.textContent = '한 번 더';
    this.resetButton.classList.add('save__button--danger');
  }

  /**
   * 버튼을 만든다.
   *
   * @param label 버튼 문구.
   * @param handler 클릭 콜백.
   * @returns 만든 엘리먼트.
   */
  private makeButton(label: string, handler: () => void): HTMLElement {
    const button = document.createElement('button');
    button.className = 'save__button';
    button.textContent = label;
    button.addEventListener('click', handler);

    return button;
  }
}

/**
 * 볼륨 단계를 문구로 만든다.
 *
 * 슬라이더 대신 단계를 돌리는 버튼이라, 지금 어느 단계인지 글자로 보여야 한다.
 *
 * @param step 단계 번호.
 * @param steps 단계 개수.
 * @returns 표시 문구.
 */
function describeVolume(step: number, steps: number): string {
  if (step <= 0) return '소리 끔';

  const filled = '●'.repeat(step);
  const empty = '○'.repeat(Math.max(0, steps - 1 - step));

  return `소리 ${filled}${empty}`;
}

/**
 * 저장 상태를 한 줄 문구로 만든다.
 *
 * @param state 상태.
 * @returns 표시 문구.
 */
function describeStatus(state: SaveMenuState): string {
  if (!state.available) return '저장 불가 (브라우저 저장소를 쓸 수 없음)';
  if (state.failure === 'quota') return '저장 실패 — 저장 공간이 부족합니다';
  if (state.failure === 'unavailable') return '저장 불가 (브라우저 저장소를 쓸 수 없음)';
  if (state.lastSavedAt === null) return '아직 저장하지 않음';

  const date = new Date(state.lastSavedAt);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  return `${hh}:${mm} 저장됨`;
}
