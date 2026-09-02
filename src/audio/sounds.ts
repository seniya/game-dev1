/**
 * 소리 종류.
 *
 * 파일을 쓰지 않고 합성하므로, 각 항목은 "무엇을 알리는 소리인가"만 정하고
 * 실제 파형은 `AudioPlayer`가 만든다.
 */
export const SoundId = {
  /** 흙을 파는 소리. */
  DIG_DIRT: 'digDirt',
  /** 돌을 캐는 소리. */
  DIG_STONE: 'digStone',
  /** 나무를 베는 소리. */
  CHOP: 'chop',
  /** 자원 노드가 부서지는 소리. */
  NODE_BREAK: 'nodeBreak',
  /** 블록을 놓는 소리. */
  PLACE: 'place',
  /** 건축 착공. */
  BUILD_START: 'buildStart',
  /** 건축 완공. */
  BUILD_DONE: 'buildDone',
  /** 건물 철거. */
  DEMOLISH: 'demolish',
  /** 주민 이주. */
  MIGRATION: 'migration',
  /** 마을 레벨업. */
  LEVEL_UP: 'levelUp',
  /** 새 요청 도착. */
  REQUEST_NEW: 'requestNew',
  /** 요청 완료. */
  REQUEST_DONE: 'requestDone',
  /** 창고 예치. */
  DEPOSIT: 'deposit',
  /** 행동이 거절됨. */
  DENY: 'deny',
} as const;

/** 소리 종류 값. */
export type SoundId = (typeof SoundId)[keyof typeof SoundId];

/** 소리 하나를 만드는 방법. */
export interface SoundRecipe {
  /** 음원 종류. 노이즈는 타격음, 톤은 알림음에 쓴다. */
  readonly source: 'noise' | 'tone';
  /** 톤일 때 파형. */
  readonly wave?: OscillatorType;
  /** 주파수 변화. 톤은 이 순서대로 미끄러지고, 여러 개면 음이 이어진다. */
  readonly notes: readonly number[];
  /** 음 하나의 길이(초). */
  readonly noteMs: number;
  /** 소리 전체의 최대 세기(0~1). */
  readonly gain: number;
  /** 저역 통과 필터 주파수(Hz). 0이면 걸지 않는다. */
  readonly lowpass?: number;
  /** 음을 이어 붙일지(true) 겹칠지(false). */
  readonly sequential?: boolean;
  /** 감쇠 곡선의 급함. 클수록 짧고 딱딱하다. */
  readonly decay?: number;
}

/**
 * 소리별 합성 방법.
 *
 * 타격음은 노이즈에 저역 필터를 걸어 재질을 나누고(흙은 낮게, 돌은 높게),
 * 알림음은 짧은 톤을 이어 붙여 만든다. 음정은 5음 음계에서 골라 서로 부딪히지 않게 했다.
 */
export const SOUND_RECIPES: Readonly<Record<SoundId, SoundRecipe>> = {
  [SoundId.DIG_DIRT]: { source: 'noise', notes: [1], noteMs: 120, gain: 0.35, lowpass: 700, decay: 14 },
  [SoundId.DIG_STONE]: { source: 'noise', notes: [1], noteMs: 130, gain: 0.4, lowpass: 2600, decay: 18 },
  [SoundId.CHOP]: { source: 'noise', notes: [1], noteMs: 150, gain: 0.42, lowpass: 1400, decay: 12 },
  [SoundId.NODE_BREAK]: { source: 'noise', notes: [1], noteMs: 320, gain: 0.5, lowpass: 1800, decay: 5 },
  [SoundId.PLACE]: { source: 'noise', notes: [1], noteMs: 100, gain: 0.3, lowpass: 500, decay: 20 },
  [SoundId.BUILD_START]: {
    source: 'tone',
    wave: 'triangle',
    notes: [294, 392],
    noteMs: 110,
    gain: 0.22,
    sequential: true,
  },
  [SoundId.BUILD_DONE]: {
    source: 'tone',
    wave: 'triangle',
    notes: [392, 523, 659],
    noteMs: 130,
    gain: 0.26,
    sequential: true,
  },
  [SoundId.DEMOLISH]: {
    source: 'noise',
    notes: [1],
    noteMs: 280,
    gain: 0.42,
    lowpass: 900,
    decay: 6,
  },
  [SoundId.MIGRATION]: {
    source: 'tone',
    wave: 'sine',
    notes: [523, 659],
    noteMs: 160,
    gain: 0.24,
    sequential: true,
  },
  [SoundId.LEVEL_UP]: {
    source: 'tone',
    wave: 'triangle',
    notes: [392, 523, 659, 784],
    noteMs: 120,
    gain: 0.3,
    sequential: true,
  },
  [SoundId.REQUEST_NEW]: { source: 'tone', wave: 'sine', notes: [880], noteMs: 220, gain: 0.18 },
  [SoundId.REQUEST_DONE]: {
    source: 'tone',
    wave: 'sine',
    notes: [659, 880],
    noteMs: 140,
    gain: 0.24,
    sequential: true,
  },
  [SoundId.DEPOSIT]: { source: 'tone', wave: 'sine', notes: [523], noteMs: 120, gain: 0.18 },
  [SoundId.DENY]: { source: 'tone', wave: 'sawtooth', notes: [160], noteMs: 140, gain: 0.16, lowpass: 900 },
};
