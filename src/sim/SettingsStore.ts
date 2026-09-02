import type { StorageBackend } from './SaveStore';

/** 저장되는 설정. */
export interface Settings {
  /** 볼륨 단계 번호. */
  volumeStep: number;
}

/** 설정 저장 키. 게임 저장과 따로 둔다. */
export const SETTINGS_KEY = 'townbuilder.settings.v1';

/** 기본 설정. */
export const DEFAULT_SETTINGS: Settings = { volumeStep: 2 };

/**
 * 설정을 읽고 쓴다.
 *
 * 게임 저장과 키를 나눈 이유는 둘의 수명이 다르기 때문이다. "새로 시작"으로 마을을 지워도
 * 볼륨은 그대로여야 하고, 저장 형식 버전이 올라도 설정까지 버릴 이유가 없다.
 */
export class SettingsStore {
  private readonly backend: StorageBackend | null;

  /**
   * @param backend 저장소. 생략하면 브라우저 localStorage를 쓴다.
   */
  constructor(backend?: StorageBackend | null) {
    this.backend = backend === undefined ? readBrowserStorage() : backend;
  }

  /**
   * 설정을 읽는다. 없거나 깨졌으면 기본값을 돌려준다.
   *
   * @returns 설정.
   */
  load(): Settings {
    if (!this.backend) return { ...DEFAULT_SETTINGS };

    try {
      const raw = this.backend.getItem(SETTINGS_KEY);
      if (raw === null) return { ...DEFAULT_SETTINGS };

      const parsed = JSON.parse(raw) as Partial<Settings>;
      const volumeStep = Number.isInteger(parsed.volumeStep) ? parsed.volumeStep! : DEFAULT_SETTINGS.volumeStep;

      return { volumeStep };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * 설정을 쓴다. 실패해도 조용히 넘어간다 — 설정 하나 때문에 게임이 멈출 이유가 없다.
   *
   * @param settings 저장할 설정.
   */
  save(settings: Settings): void {
    if (!this.backend) return;

    try {
      this.backend.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // 무시한다.
    }
  }
}

/**
 * 브라우저 localStorage를 가져온다.
 *
 * @returns 저장소. 쓸 수 없으면 null.
 */
function readBrowserStorage(): StorageBackend | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
