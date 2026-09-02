import type { SaveData } from '../core/save';
import type { SaveOutcome, SaveStore } from './SaveStore';

/** 세션이 밖으로 알리는 저장 상태. */
export interface SaveStatus {
  /** 저장소를 쓸 수 있는지. */
  available: boolean;
  /** 마지막으로 저장한 시각(epoch ms). 아직이면 null. */
  lastSavedAt: number | null;
  /** 마지막 저장 실패 사유. */
  failure: 'quota' | 'unavailable' | null;
}

/** 기본 자동 저장 간격(게임 시간, ms). */
export const DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * 언제 저장할지를 결정하는 정책.
 *
 * 자동 저장 타이머와 "지금은 저장하면 안 되는 상태"를 함께 관리한다. 후자가 이 클래스를
 * 따로 둔 이유다 — **"새로 시작"과 "되돌리기"는 저장을 지우거나 무시하고 페이지를 다시
 * 여는데, 그때 탭이 닫히며 저장이 한 번 더 일어나면 방금 한 일이 즉시 취소된다.**
 * 실제로 브라우저에서 그 증상이 나와서 정책을 값으로 뽑아 테스트로 고정했다.
 */
export class SaveSession {
  private readonly store: SaveStore;
  private readonly intervalMs: number;

  /** 마지막 자동 저장 이후 흐른 게임 시간(ms). */
  private sinceAutosaveMs = 0;
  /** 마지막으로 저장한 시각(epoch ms). */
  private savedAt: number | null = null;
  /** 마지막 저장 실패 사유. */
  private lastFailure: 'quota' | 'unavailable' | null = null;
  /** 저장을 멈춘 상태인지. 페이지를 다시 여는 중에 켠다. */
  private suspended = false;

  /**
   * @param store 저장소.
   * @param options 자동 저장 간격과 시작 시점의 저장 시각.
   */
  constructor(store: SaveStore, options: { intervalMs?: number; lastSavedAt?: number | null } = {}) {
    this.store = store;
    this.intervalMs = options.intervalMs ?? DEFAULT_AUTOSAVE_INTERVAL_MS;
    this.savedAt = options.lastSavedAt ?? null;
  }

  /** 지금 저장할 수 있는 상태인지. */
  get active(): boolean {
    return !this.suspended;
  }

  /** 밖으로 알릴 저장 상태. */
  get status(): SaveStatus {
    return {
      available: this.store.available,
      lastSavedAt: this.savedAt,
      failure: this.lastFailure,
    };
  }

  /**
   * 저장을 멈춘다. 되돌릴 수 없다 — 페이지를 다시 여는 직전에만 부른다.
   *
   * 이 호출 뒤에는 자동 저장도, 탭을 닫을 때의 저장도 일어나지 않는다.
   */
  suspend(): void {
    this.suspended = true;
  }

  /**
   * 시간을 흘려보내고, 자동 저장할 때가 됐으면 저장한다.
   *
   * @param stepMs 흐른 게임 시간(ms).
   * @param snapshot 저장 데이터를 만드는 함수. 저장할 때만 호출한다.
   * @returns 이번 호출에서 저장했으면 true.
   */
  tick(stepMs: number, snapshot: () => SaveData): boolean {
    if (this.suspended) return false;

    this.sinceAutosaveMs += stepMs;
    if (this.sinceAutosaveMs < this.intervalMs) return false;

    this.sinceAutosaveMs = 0;
    this.save(snapshot);

    return true;
  }

  /**
   * 지금 저장한다.
   *
   * @param snapshot 저장 데이터를 만드는 함수.
   * @returns 저장 결과. 멈춘 상태면 저장하지 않는다.
   */
  save(snapshot: () => SaveData): SaveOutcome {
    if (this.suspended) return { ok: false, reason: 'unavailable' };

    const result = this.store.save(snapshot());

    if (result.ok) {
      this.savedAt = Date.now();
      this.lastFailure = null;
    } else {
      this.lastFailure = result.reason;
    }

    // 수동 저장도 자동 저장 타이머를 미룬다. 방금 저장한 것을 곧바로 또 저장할 이유가 없다.
    this.sinceAutosaveMs = 0;

    return result;
  }
}
