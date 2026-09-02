import { Milestone, summarize, type JournalData } from '../core/journal';
import type { JournalSave } from '../core/save';
import type { ActionFailure } from './Game';

/**
 * 플레이 기록을 모으는 곳.
 *
 * 규칙(`Game`)이 사건을 넣고, UI가 요약을 꺼내 간다. 알림을 `drainNotices`로 주고받는
 * 구조와 같은 결이다 — 규칙은 무엇을 남길지 알지만 그것을 어떻게 보여줄지는 모른다.
 *
 * **처음 한 번만 적는다.** "첫 채집"은 첫 채집일 때만 의미가 있고, 매번 덮어쓰면
 * 마지막 채집 시각이 된다.
 */
export class Journal {
  /** 이정표별 처음 도달한 시각(ms). */
  private readonly milestones = new Map<Milestone, number>();

  /** 레벨별 처음 도달한 시각(ms). */
  private readonly levels = new Map<number, number>();

  /** 거절 사유별 횟수. */
  private readonly denials = new Map<ActionFailure, number>();

  /** 플레이한 시간(ms). */
  private playedMs = 0;

  /**
   * 이정표를 적는다. 이미 적힌 것은 덮지 않는다.
   *
   * @param milestone 이정표.
   * @param atMs 지금 시각(게임 시간, ms).
   */
  mark(milestone: Milestone, atMs: number): void {
    if (this.milestones.has(milestone)) return;

    this.milestones.set(milestone, Math.max(0, atMs));
  }

  /**
   * 레벨 도달을 적는다.
   *
   * @param level 도달한 레벨.
   * @param atMs 지금 시각(게임 시간, ms).
   */
  markLevel(level: number, atMs: number): void {
    if (this.levels.has(level)) return;

    this.levels.set(level, Math.max(0, atMs));
  }

  /**
   * 거절당한 행동을 센다.
   *
   * 무엇을 시도했다가 막혔는지가 "어디서 멈췄는가"를 가장 잘 말해 준다 — 자재가 없어서
   * 스무 번 거절됐다면 안내가 부족한 것이고, 자리가 아니어서 스무 번이면 표시가 부족한 것이다.
   *
   * @param reason 거절 사유.
   */
  deny(reason: ActionFailure): void {
    // 연타 중에 흔히 나오는 '바쁘다'는 막힘이 아니다.
    if (reason === 'busy') return;

    this.denials.set(reason, (this.denials.get(reason) ?? 0) + 1);
  }

  /**
   * 흐른 시간을 더한다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  advance(stepMs: number): void {
    this.playedMs += stepMs;
  }

  /** 지금까지의 기록. */
  get data(): JournalData {
    return {
      milestones: Object.fromEntries(this.milestones) as JournalData['milestones'],
      levels: Object.fromEntries(this.levels) as JournalData['levels'],
      denials: Object.fromEntries(this.denials) as JournalData['denials'],
      playedMs: this.playedMs,
    };
  }

  /** 사람이 읽을 수 있는 요약. 저장 메뉴의 "기록 복사"가 이것을 준다. */
  get summary(): string {
    return summarize(this.data);
  }

  /**
   * 저장용 표현으로 바꾼다.
   *
   * @returns 저장 데이터.
   */
  toSave(): JournalSave {
    return {
      milestones: Object.fromEntries(this.milestones),
      levels: Object.fromEntries([...this.levels].map(([level, at]) => [String(level), at])),
      denials: Object.fromEntries(this.denials),
      playedMs: this.playedMs,
    };
  }

  /**
   * 저장에서 되살린다. 이상한 값은 버린다.
   *
   * @param saved 저장 데이터.
   */
  restore(saved: JournalSave | undefined): void {
    this.milestones.clear();
    this.levels.clear();
    this.denials.clear();
    this.playedMs = 0;
    if (!saved) return;

    for (const [key, at] of Object.entries(saved.milestones ?? {})) {
      if (!Number.isFinite(at)) continue;
      this.milestones.set(key as Milestone, Math.max(0, at));
    }
    for (const [key, at] of Object.entries(saved.levels ?? {})) {
      const level = Number(key);
      if (!Number.isInteger(level) || !Number.isFinite(at)) continue;
      this.levels.set(level, Math.max(0, at));
    }
    for (const [key, count] of Object.entries(saved.denials ?? {})) {
      if (!Number.isFinite(count)) continue;
      this.denials.set(key as ActionFailure, Math.max(0, Math.floor(count)));
    }

    this.playedMs = Number.isFinite(saved.playedMs) ? Math.max(0, saved.playedMs) : 0;
  }
}
