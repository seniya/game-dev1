/**
 * 시뮬레이션 상태.
 *
 * Phase 0에서는 루프가 정말로 고정 간격으로 도는지 확인할 수 있는 최소 필드만
 * 둔다. 이후 Phase에서 지형·플레이어·인벤토리·마을 레벨이 이 아래로 들어온다.
 */
export class GameState {
  /** 지금까지 실행된 시뮬레이션 스텝 수. */
  tick = 0;
  /** 시뮬레이션 기준 누적 시간(ms). 실제 경과 시간이 아니라 스텝의 합이다. */
  elapsedMs = 0;

  /**
   * 시뮬레이션을 한 스텝 진행한다.
   *
   * @param stepMs 이 스텝이 나타내는 시간(ms).
   */
  step(stepMs: number): void {
    this.tick += 1;
    this.elapsedMs += stepMs;
  }
}
