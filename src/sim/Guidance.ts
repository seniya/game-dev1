import {
  HintId,
  controlHint,
  currentObjective,
  hintText,
  pickHint,
  type GuidanceState,
} from '../core/guidance';

/** 힌트를 띄우기 전에 기다리는 시간(ms). */
const HINT_DELAY_MS = 1200;

/**
 * 첫 플레이 안내를 관리한다.
 *
 * 규칙(무엇을 안내할지)은 `src/core/guidance.ts`의 순수 함수에 있고, 여기서는 **무엇을
 * 이미 봤는지**와 **언제 띄울지**만 다룬다.
 *
 * 힌트를 조건이 맞는 즉시 띄우지 않고 잠시 기다리는 이유는, 조건이 맞는 순간이 대개
 * 다른 알림(자원 획득, 완공)과 겹치기 때문이다. 한꺼번에 뜨면 어느 것도 읽히지 않는다.
 */
export class Guidance {
  /** 이미 본 힌트. */
  private readonly seen = new Set<HintId>();
  /**
   * 다음 힌트를 띄우기까지 남은 시간(ms).
   *
   * 처음부터 기다림을 걸어 둔다. 0으로 두면 게임을 켜자마자 조건이 맞는 힌트가
   * 첫 프레임에 튀어나온다.
   */
  private delayMs = HINT_DELAY_MS;
  /** 창고에 한 번이라도 예치했는지. */
  private deposited = false;

  /** 이미 본 힌트 목록. 저장에 쓴다. */
  get seenHints(): string[] {
    return [...this.seen];
  }

  /** 창고에 예치한 적이 있는지. */
  get hasDeposited(): boolean {
    return this.deposited;
  }

  /** 창고에 예치했음을 기록한다. */
  markDeposited(): void {
    this.deposited = true;
  }

  /**
   * 저장에서 진행도를 되살린다.
   *
   * @param seenHints 이미 본 힌트 목록.
   * @param hasDeposited 예치 경험 여부.
   */
  restore(seenHints: readonly string[] | undefined, hasDeposited: boolean | undefined): void {
    this.seen.clear();
    for (const id of seenHints ?? []) {
      if (isHintId(id)) this.seen.add(id);
    }
    this.deposited = hasDeposited ?? false;
  }

  /**
   * 시간을 흘려보내고, 띄울 힌트가 있으면 돌려준다.
   *
   * @param stepMs 흐른 시간(ms).
   * @param state 게임 상태.
   * @returns 띄울 힌트 문구. 없으면 null.
   */
  update(stepMs: number, state: GuidanceState): string | null {
    const next = pickHint(state, this.seen);
    if (!next) {
      this.delayMs = HINT_DELAY_MS;
      return null;
    }

    this.delayMs -= stepMs;
    if (this.delayMs > 0) return null;

    this.delayMs = HINT_DELAY_MS;
    this.seen.add(next);

    return hintText(next);
  }

  /**
   * 지금 할 일 한 줄을 돌려준다.
   *
   * @param state 게임 상태.
   * @returns 표시 문구.
   */
  objective(state: GuidanceState): string {
    return currentObjective(state);
  }

  /**
   * 상황에 맞는 조작 안내를 돌려준다.
   *
   * @param state 게임 상태.
   * @returns 조작 안내 문구.
   */
  controls(state: GuidanceState): string {
    return controlHint(state);
  }
}

/**
 * 문자열이 알려진 힌트 종류인지 확인한다. 저장을 되읽을 때 쓴다.
 *
 * @param value 확인할 값.
 * @returns 알려진 종류면 true.
 */
function isHintId(value: string): value is HintId {
  return (Object.values(HintId) as string[]).includes(value);
}
