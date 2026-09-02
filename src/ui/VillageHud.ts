/** 상단 마을 레벨 표시에 필요한 값. */
export interface VillageHudState {
  /** 현재 마을 레벨. */
  level: number;
  /** 1차 목표 레벨. */
  goalLevel: number;
  /** 현재 점수. */
  score: number;
  /** 다음 레벨에 필요한 점수. 최대 레벨이면 null. */
  nextScore: number | null;
  /** 현재 레벨 구간의 진행도(0~1). */
  progress: number;
  /** 주민 수. */
  residents: number;
  /** 완공 건물 수. */
  buildings: number;
  /** 지금 할 일 한 줄. */
  objective: string;
  /** 며칠째인지. */
  day: number;
  /** 시계 문구("07:30"). */
  clock: string;
  /** 시간대 이름("낮"). */
  phase: string;
}

/**
 * 상단 마을 레벨 게이지.
 *
 * 기획서 6절이 "엔딩 없이 지속 성장형 구조, 다만 명확한 1차 목표를 UI에 상시
 * 노출"을 요구하므로, 레벨·진행 게이지·목표를 한 줄에 함께 보여준다.
 *
 * 게이지 폭은 매 프레임 바뀔 수 있으므로 스타일만 갱신하고, 텍스트는 값이
 * 실제로 달라졌을 때만 손댄다.
 */
export class VillageHud {
  private readonly root: HTMLElement;
  private readonly labelElement: HTMLElement;
  private readonly fillElement: HTMLElement;
  private readonly goalElement: HTMLElement;
  private readonly objectiveElement: HTMLElement;
  private readonly clockElement: HTMLElement;

  /** 마지막으로 그린 텍스트. 같으면 DOM을 건드리지 않는다. */
  private lastLabel = '';
  private lastGoal = '';
  private lastObjective = '';
  private lastClock = '';
  /** 마지막으로 그린 게이지 폭(백분율 정수). */
  private lastFillPercent = -1;

  /**
   * @param root 표시 컨테이너.
   */
  constructor(root: HTMLElement) {
    this.root = root;

    this.labelElement = document.createElement('div');
    this.labelElement.className = 'village__label';

    const track = document.createElement('div');
    track.className = 'village__track';
    this.fillElement = document.createElement('div');
    this.fillElement.className = 'village__fill';
    track.appendChild(this.fillElement);

    this.goalElement = document.createElement('div');
    this.goalElement.className = 'village__goal';

    // 지금 할 일을 목표 위에 둔다. 튜토리얼 창을 쓸 수 없으므로(기획서 7절)
    // 이 한 줄이 "다음에 무엇을 하면 되는가"를 알리는 유일한 자리다.
    this.objectiveElement = document.createElement('div');
    this.objectiveElement.className = 'village__objective';

    // 시각은 대사창 없이 알려야 하는 값이라(기획서 7절) 레벨 줄 옆에 한 조각으로 둔다.
    this.clockElement = document.createElement('div');
    this.clockElement.className = 'village__clock';

    this.root.appendChild(this.clockElement);
    this.root.appendChild(this.labelElement);
    this.root.appendChild(track);
    this.root.appendChild(this.objectiveElement);
    this.root.appendChild(this.goalElement);
  }

  /**
   * 표시를 갱신한다.
   *
   * @param state 표시할 값.
   */
  update(state: VillageHudState): void {
    const label =
      `마을 레벨 ${state.level} · 주민 ${state.residents} · 건물 ${state.buildings}` +
      (state.nextScore === null
        ? ' · 최대 레벨'
        : ` · ${state.score}/${state.nextScore}`);

    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.labelElement.textContent = label;
    }

    const percent = Math.round(Math.max(0, Math.min(1, state.progress)) * 100);
    if (percent !== this.lastFillPercent) {
      this.lastFillPercent = percent;
      this.fillElement.style.width = `${percent}%`;
    }

    const clock = `${state.day}일차 ${state.clock} · ${state.phase}`;
    if (clock !== this.lastClock) {
      this.lastClock = clock;
      this.clockElement.textContent = clock;
    }

    if (state.objective !== this.lastObjective) {
      this.lastObjective = state.objective;
      this.objectiveElement.textContent = `지금: ${state.objective}`;
    }

    const goal =
      state.level >= state.goalLevel
        ? '1차 목표 달성'
        : `1차 목표: 마을 레벨 ${state.goalLevel}`;

    if (goal !== this.lastGoal) {
      this.lastGoal = goal;
      this.goalElement.textContent = goal;
    }
  }
}
