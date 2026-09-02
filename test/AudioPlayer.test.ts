import { afterEach, describe, expect, it } from 'vitest';
import { AudioPlayer, VOLUME_STEPS } from '../src/audio/AudioPlayer';
import { SOUND_RECIPES, SoundId } from '../src/audio/sounds';

/** 만들어진 노드를 기록하는 가짜 오디오 컨텍스트. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  sampleRate = 48_000;
  readonly destination = { id: 'destination' };

  /** 만들어진 오실레이터 수. */
  oscillators = 0;
  /** 만들어진 버퍼 소스 수. */
  bufferSources = 0;
  /** 만들어진 게인 노드 수. */
  gains = 0;
  /** 만들어진 필터 수. */
  filters = 0;
  /** resume 호출 여부. */
  resumed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  /** 오실레이터를 만든다. */
  createOscillator() {
    this.oscillators += 1;
    return {
      type: 'sine',
      frequency: { value: 0 },
      detune: { value: 0 },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }

  /** 게인 노드를 만든다. */
  createGain() {
    this.gains += 1;
    return {
      gain: {
        value: 0,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
    };
  }

  /** 필터를 만든다. */
  createBiquadFilter() {
    this.filters += 1;
    return { type: 'lowpass', frequency: { value: 0 }, connect: () => {} };
  }

  /** 버퍼 소스를 만든다. */
  createBufferSource() {
    this.bufferSources += 1;
    return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} };
  }

  /**
   * 버퍼를 만든다.
   *
   * @param _channels 채널 수.
   * @param length 샘플 수.
   */
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }

  /** 정지 상태에서 다시 시작한다. */
  resume() {
    this.resumed = true;
    this.state = 'running';
    return Promise.resolve();
  }
}

/** 가짜 오디오 컨텍스트를 전역에 심는다. */
function installFakeAudio(): void {
  FakeAudioContext.instances = [];
  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
}

/** 오디오가 아예 없는 환경을 만든다. */
function removeAudio(): void {
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
  delete (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
}

describe('AudioPlayer 잠금 해제', () => {
  afterEach(() => {
    removeAudio();
  });

  it('잠금 해제 전에는 준비되지 않은 상태다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();

    expect(audio.ready).toBe(false);
  });

  it('잠금 해제 전 재생 요청은 조용히 무시된다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();

    expect(() => audio.play(SoundId.CHOP)).not.toThrow();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('잠금 해제하면 컨텍스트를 한 번만 만든다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();

    audio.unlock();
    audio.unlock();
    audio.unlock();

    expect(audio.ready).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('정지된 컨텍스트는 다시 시작시킨다 — 탭을 옮겼다 오면 멈춰 있다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();

    const context = FakeAudioContext.instances[0]!;
    context.state = 'suspended';
    audio.unlock();

    expect(context.resumed).toBe(true);
  });

  it('오디오가 없는 환경에서도 죽지 않는다', () => {
    removeAudio();
    const audio = new AudioPlayer();

    expect(() => audio.unlock()).not.toThrow();
    expect(audio.ready).toBe(false);
    expect(() => audio.play(SoundId.LEVEL_UP)).not.toThrow();
    expect(() => audio.update(1000)).not.toThrow();
  });
});

describe('AudioPlayer 볼륨', () => {
  afterEach(() => {
    removeAudio();
  });

  it('단계를 돌려 가며 바뀌고 끝에서 처음으로 돌아온다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.setVolumeStep(0);

    for (let i = 1; i < VOLUME_STEPS.length; i += 1) {
      audio.cycleVolume();
      expect(audio.volumeStep).toBe(i);
    }

    audio.cycleVolume();
    expect(audio.volumeStep).toBe(0);
  });

  it('범위를 벗어난 단계는 잘라 쓴다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();

    audio.setVolumeStep(99);
    expect(audio.volumeStep).toBe(VOLUME_STEPS.length - 1);

    audio.setVolumeStep(-5);
    expect(audio.volumeStep).toBe(0);
  });

  it('음소거면 소리를 만들지 않는다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();
    audio.setVolumeStep(0);

    const context = FakeAudioContext.instances[0]!;
    const before = context.oscillators + context.bufferSources;
    audio.play(SoundId.LEVEL_UP);

    expect(context.oscillators + context.bufferSources).toBe(before);
  });
});

describe('AudioPlayer 재생', () => {
  afterEach(() => {
    removeAudio();
  });

  it('톤 소리는 음 개수만큼 오실레이터를 만든다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const before = context.oscillators;

    audio.play(SoundId.LEVEL_UP);

    expect(context.oscillators - before).toBe(SOUND_RECIPES[SoundId.LEVEL_UP].notes.length);
  });

  it('타격음은 노이즈 소스를 쓴다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const before = context.bufferSources;

    audio.play(SoundId.CHOP);

    expect(context.bufferSources - before).toBe(1);
  });

  it('저역 필터가 있는 소리는 필터를 만든다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;
    const before = context.filters;

    audio.play(SoundId.DIG_DIRT);

    expect(context.filters - before).toBe(1);
  });

  it('모든 소리에 합성 방법이 정의돼 있다', () => {
    for (const id of Object.values(SoundId)) {
      const recipe = SOUND_RECIPES[id];
      expect(recipe).toBeDefined();
      expect(recipe.notes.length).toBeGreaterThan(0);
      expect(recipe.gain).toBeGreaterThan(0);
      expect(recipe.noteMs).toBeGreaterThan(0);
    }
  });
});

describe('AudioPlayer 배경음', () => {
  afterEach(() => {
    removeAudio();
  });

  it('시간이 충분히 지나야 한 음을 낸다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();
    const context = FakeAudioContext.instances[0]!;

    // 잠금 직후에는 조작음과 겹치지 않도록 잠시 기다린다.
    const before = context.oscillators;
    audio.update(100);
    expect(context.oscillators).toBe(before);

    audio.update(5000);
    expect(context.oscillators).toBeGreaterThan(before);
  });

  it('끄면 배경음이 나오지 않는다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();
    audio.setAmbient(false);
    const context = FakeAudioContext.instances[0]!;
    const before = context.oscillators;

    audio.update(10_000);

    expect(context.oscillators).toBe(before);
  });

  it('음소거면 배경음도 나오지 않는다', () => {
    installFakeAudio();
    const audio = new AudioPlayer();
    audio.unlock();
    audio.setVolumeStep(0);
    const context = FakeAudioContext.instances[0]!;
    const before = context.oscillators;

    audio.update(10_000);

    expect(context.oscillators).toBe(before);
  });
});
