import { SOUND_RECIPES, type SoundId, type SoundRecipe } from './sounds';

/** 볼륨 단계. 슬라이더 대신 단계를 돌려 쓰는 편이 조작이 단순하다. */
export const VOLUME_STEPS: readonly number[] = [0, 0.3, 0.6, 1];

/** 배경음이 쓰는 5음 음계(A 마이너 펜타토닉). */
const AMBIENT_SCALE: readonly number[] = [220, 261.63, 293.66, 349.23, 392];

/** 배경음 한 음의 길이(ms). */
const AMBIENT_NOTE_MS = 2600;

/**
 * 소리를 합성해 재생한다.
 *
 * 음원 파일을 쓰지 않는 이유는 `docs/adr/0010-사운드-합성.md`에 있다. 짧은 타격음과
 * 알림음은 노이즈와 오실레이터만으로 충분히 만들 수 있고, 파일 조달이라는 외부 의존이
 * 사라진다.
 *
 * **브라우저는 사용자 입력이 있기 전에는 오디오를 켜 주지 않는다.** 그래서 `AudioContext`를
 * 생성자에서 만들지 않고 첫 입력에서 만든다. 그전의 재생 요청은 조용히 무시한다 —
 * 소리가 안 나는 것보다 예외로 게임이 죽는 것이 나쁘다.
 */
export class AudioPlayer {
  /** 오디오 컨텍스트. 첫 입력 전에는 null. */
  private context: AudioContext | null = null;
  /** 전체 볼륨을 거는 노드. */
  private master: GainNode | null = null;
  /** 배경음 볼륨 노드. */
  private ambientGain: GainNode | null = null;
  /** 노이즈용 버퍼. 한 번 만들어 재사용한다. */
  private noiseBuffer: AudioBuffer | null = null;

  /** 볼륨 단계 번호. */
  private volumeIndex = 2;
  /** 배경음을 켤지 여부. */
  private ambientEnabled = true;
  /** 다음 배경음 음까지 남은 시간(ms). */
  private ambientTimerMs = 0;
  /** 배경음 음 고르기에 쓰는 순번. */
  private ambientStep = 0;

  /** 지금 볼륨(0~1). */
  get volume(): number {
    return VOLUME_STEPS[this.volumeIndex] ?? 0;
  }

  /** 볼륨 단계 번호. */
  get volumeStep(): number {
    return this.volumeIndex;
  }

  /** 소리가 꺼져 있는지. */
  get muted(): boolean {
    return this.volume <= 0;
  }

  /** 오디오가 실제로 켜졌는지. 첫 입력 전에는 false. */
  get ready(): boolean {
    return this.context !== null;
  }

  /**
   * 볼륨 단계를 설정한다.
   *
   * @param index 단계 번호. 범위를 벗어나면 잘라 쓴다.
   */
  setVolumeStep(index: number): void {
    if (!Number.isInteger(index)) return;

    this.volumeIndex = Math.max(0, Math.min(VOLUME_STEPS.length - 1, index));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** 볼륨 단계를 다음으로 돌린다. 마지막이면 처음으로 돌아간다. */
  cycleVolume(): void {
    this.setVolumeStep((this.volumeIndex + 1) % VOLUME_STEPS.length);
  }

  /**
   * 오디오를 켠다. 사용자 입력 처리 중에 불러야 브라우저가 허용한다.
   *
   * 여러 번 불러도 안전하다.
   */
  unlock(): void {
    if (this.context) {
      // 탭을 옮겼다 오면 정지 상태로 남아 있을 수 있다.
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }

    const Ctor: typeof AudioContext | undefined =
      globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      this.context = new Ctor();
    } catch {
      this.context = null;
      return;
    }

    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);

    this.ambientGain = this.context.createGain();
    // 배경음은 효과음보다 훨씬 작아야 조작음이 묻히지 않는다.
    this.ambientGain.gain.value = 0.12;
    this.ambientGain.connect(this.master);

    this.noiseBuffer = this.makeNoiseBuffer();

    // 잠금을 푼 것은 사용자가 무언가를 눌렀다는 뜻이다. 그 조작음과 배경음 첫 음이
    // 겹치지 않도록 조금 뒤에 시작한다.
    this.ambientTimerMs = 1200;
  }

  /**
   * 소리를 낸다. 오디오가 켜지지 않았거나 음소거면 아무것도 하지 않는다.
   *
   * @param id 소리 종류.
   */
  play(id: SoundId): void {
    if (!this.context || !this.master || this.muted) return;

    const recipe = SOUND_RECIPES[id];
    if (!recipe) return;

    try {
      this.render(recipe);
    } catch {
      // 오디오 노드 생성이 실패해도 게임은 계속돼야 한다.
    }
  }

  /**
   * 배경음을 켜고 끈다.
   *
   * @param enabled 켤지 여부.
   */
  setAmbient(enabled: boolean): void {
    this.ambientEnabled = enabled;
  }

  /**
   * 시간을 흘려보내며 배경음 음을 이어 낸다.
   *
   * 고정 루프 파일 대신 5음 음계에서 음을 하나씩 골라 길게 늘인다. 같은 구간이
   * 반복되지 않아 오래 들어도 덜 지겹고, 파일도 필요 없다.
   *
   * @param stepMs 흐른 시간(ms).
   */
  update(stepMs: number): void {
    if (!this.context || !this.ambientGain || this.muted || !this.ambientEnabled) return;

    this.ambientTimerMs -= stepMs;
    if (this.ambientTimerMs > 0) return;

    this.ambientTimerMs = AMBIENT_NOTE_MS;
    this.ambientStep += 1;

    try {
      this.playAmbientNote();
    } catch {
      // 무시한다.
    }
  }

  /** 배경음 한 음을 낸다. */
  private playAmbientNote(): void {
    const context = this.context!;
    const now = context.currentTime;

    // 음계를 순회하되 가끔 건너뛰어 단조로움을 피한다.
    const index = (this.ambientStep * 3) % AMBIENT_SCALE.length;
    const frequency = AMBIENT_SCALE[index]!;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.8);
    gain.gain.linearRampToValueAtTime(0, now + AMBIENT_NOTE_MS / 1000);
    gain.connect(this.ambientGain!);

    // 살짝 어긋난 두 음을 겹쳐 두께를 만든다.
    for (const detune of [-4, 4]) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + AMBIENT_NOTE_MS / 1000 + 0.1);
    }
  }

  /**
   * 합성 방법대로 소리를 만든다.
   *
   * @param recipe 합성 방법.
   */
  private render(recipe: SoundRecipe): void {
    const context = this.context!;
    const now = context.currentTime;
    const noteSeconds = recipe.noteMs / 1000;

    recipe.notes.forEach((note, index) => {
      const start = now + (recipe.sequential ? index * noteSeconds : 0);
      const gain = context.createGain();

      if (recipe.source === 'noise') {
        // 타격음은 급격히 잦아들어야 "탁" 하고 끊긴다.
        const decay = recipe.decay ?? 12;
        gain.gain.setValueAtTime(recipe.gain, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + noteSeconds * (12 / decay));
      } else {
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(recipe.gain, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + noteSeconds);
      }

      let tail: AudioNode = gain;
      if (recipe.lowpass) {
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = recipe.lowpass;
        gain.connect(filter);
        tail = filter;
      }
      tail.connect(this.master!);

      if (recipe.source === 'noise') {
        const source = context.createBufferSource();
        source.buffer = this.noiseBuffer;
        source.connect(gain);
        source.start(start);
        source.stop(start + noteSeconds);
        return;
      }

      const osc = context.createOscillator();
      osc.type = recipe.wave ?? 'sine';
      osc.frequency.value = note;
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + noteSeconds + 0.05);
    });
  }

  /**
   * 노이즈 버퍼를 만든다. 타격음의 재료다.
   *
   * @returns 0.5초짜리 백색 소음 버퍼.
   */
  private makeNoiseBuffer(): AudioBuffer {
    const context = this.context!;
    const length = Math.floor(context.sampleRate * 0.5);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;

    return buffer;
  }
}
