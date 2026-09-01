/**
 * 고정 timestep 루프의 순수 계산부.
 *
 * 렌더는 프레임마다 자유롭게 돌지만 시뮬레이션은 항상 같은 간격(stepMs)으로
 * 진행해야 한다. 그래야 프레임률이 흔들려도 채집 속도·건축 게이지·NPC 이동
 * 같은 수치가 기기에 따라 달라지지 않는다. 이 모듈은 rAF나 performance.now에
 * 의존하지 않는 순수 함수만 담아 단위 테스트가 가능하도록 분리했다.
 */

/** 시뮬레이션 1스텝의 기본 길이(ms). 초당 60스텝. */
export const DEFAULT_STEP_MS = 1000 / 60;

/**
 * 한 프레임에서 허용하는 최대 스텝 수.
 * 탭이 백그라운드로 갔다 돌아오면 frameTime이 수 초로 튀는데, 그만큼 스텝을
 * 몰아서 실행하면 다시 지연이 커지는 악순환(spiral of death)에 빠진다.
 * 상한을 두고 초과분은 버린다 — 시간이 조금 건너뛰는 편이 멈추는 것보다 낫다.
 */
export const DEFAULT_MAX_STEPS_PER_FRAME = 5;

/** planSteps가 돌려주는 이번 프레임의 실행 계획. */
export interface StepPlan {
  /** 이번 프레임에 실행할 시뮬레이션 스텝 수. */
  steps: number;
  /** 다음 프레임으로 넘길 잔여 시간(ms). 항상 0 이상 stepMs 미만. */
  accumulator: number;
  /** 스텝 사이 보간 계수(0~1). 렌더가 위치를 부드럽게 이을 때 쓴다. */
  alpha: number;
  /** 상한 때문에 버린 시간(ms). 0보다 크면 프레임이 밀렸다는 뜻이다. */
  droppedMs: number;
}

/**
 * 누적 시간에 이번 프레임의 경과 시간을 더해, 실행할 스텝 수와 잔여 시간을 계산한다.
 *
 * @param accumulator 지난 프레임에서 넘어온 잔여 시간(ms). 음수는 0으로 본다.
 * @param frameTimeMs 이번 프레임의 경과 시간(ms). 음수·NaN은 0으로 본다.
 * @param stepMs 시뮬레이션 1스텝 길이(ms). 0 이하면 예외를 던진다.
 * @param maxSteps 한 프레임 최대 스텝 수.
 * @returns 이번 프레임의 실행 계획.
 */
export function planSteps(
  accumulator: number,
  frameTimeMs: number,
  stepMs: number = DEFAULT_STEP_MS,
  maxSteps: number = DEFAULT_MAX_STEPS_PER_FRAME,
): StepPlan {
  if (!Number.isFinite(stepMs) || stepMs <= 0) {
    throw new RangeError(`stepMs는 0보다 큰 유한수여야 한다: ${stepMs}`);
  }

  const carried = Number.isFinite(accumulator) && accumulator > 0 ? accumulator : 0;
  const frame = Number.isFinite(frameTimeMs) && frameTimeMs > 0 ? frameTimeMs : 0;

  let pending = carried + frame;
  const wanted = Math.floor(pending / stepMs);
  const cap = Math.max(0, Math.floor(maxSteps));
  const steps = Math.min(wanted, cap);

  pending -= steps * stepMs;

  // 상한에 걸렸다면 남은 누적치를 한 스텝 미만으로 잘라내 다음 프레임에 빚을 넘기지 않는다.
  let droppedMs = 0;
  if (wanted > steps) {
    const keep = pending % stepMs;
    droppedMs = pending - keep;
    pending = keep;
  }

  return {
    steps,
    accumulator: pending,
    alpha: pending / stepMs,
    droppedMs,
  };
}
