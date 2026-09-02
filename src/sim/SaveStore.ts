import { isSaveData, type SaveData } from '../core/save';

/** 저장을 담아 두는 곳. 브라우저에서는 localStorage다. */
export interface StorageBackend {
  /**
   * 값을 읽는다.
   *
   * @param key 키.
   */
  getItem(key: string): string | null;
  /**
   * 값을 쓴다. 용량이 부족하면 예외를 던질 수 있다.
   *
   * @param key 키.
   * @param value 값.
   */
  setItem(key: string, value: string): void;
  /**
   * 값을 지운다.
   *
   * @param key 키.
   */
  removeItem(key: string): void;
}

/** 저장 결과. */
export type SaveOutcome =
  | { ok: true }
  /** 저장소가 없다(비공개 모드 등). */
  | { ok: false; reason: 'unavailable' }
  /** 용량이 부족하다. */
  | { ok: false; reason: 'quota' };

/** 불러오기 결과. */
export type LoadOutcome =
  | { ok: true; data: SaveData }
  /** 저장이 없다. */
  | { ok: false; reason: 'empty' }
  /** 저장이 손상됐거나 형식이 다르다. */
  | { ok: false; reason: 'corrupt' };

/** 기본 저장 키. */
export const DEFAULT_SAVE_KEY = 'townbuilder.save.v1';

/**
 * 저장을 읽고 쓰는 어댑터.
 *
 * 저장소가 없는 환경(비공개 모드, 테스트, 서버)에서도 게임이 죽지 않아야 하므로
 * 모든 실패를 값으로 돌려준다. **손상된 저장은 지우지 않는다** — 사용자의 마을이 담긴
 * 유일한 사본일 수 있고, 형식 문제라면 나중에 되살릴 여지가 있다.
 */
export class SaveStore {
  private readonly backend: StorageBackend | null;
  private readonly key: string;

  /**
   * @param backend 저장소. 생략하면 브라우저 localStorage를 쓴다.
   * @param key 저장 키.
   */
  constructor(backend?: StorageBackend | null, key = DEFAULT_SAVE_KEY) {
    this.backend = backend === undefined ? readBrowserStorage() : backend;
    this.key = key;
  }

  /** 저장소를 쓸 수 있는지 여부. */
  get available(): boolean {
    return this.backend !== null;
  }

  /** 저장이 있는지 여부. 손상 여부는 보지 않는다. */
  get hasSave(): boolean {
    if (!this.backend) return false;

    try {
      return this.backend.getItem(this.key) !== null;
    } catch {
      return false;
    }
  }

  /**
   * 저장한다.
   *
   * @param data 저장 데이터.
   * @returns 저장 결과.
   */
  save(data: SaveData): SaveOutcome {
    if (!this.backend) return { ok: false, reason: 'unavailable' };

    try {
      this.backend.setItem(this.key, JSON.stringify(data));
      return { ok: true };
    } catch {
      // localStorage는 용량 초과와 접근 거부를 모두 예외로 알린다. 구분할 방법이
      // 표준화돼 있지 않으므로 사용자에게는 같은 안내를 준다.
      return { ok: false, reason: 'quota' };
    }
  }

  /**
   * 불러온다.
   *
   * @returns 불러오기 결과.
   */
  load(): LoadOutcome {
    if (!this.backend) return { ok: false, reason: 'empty' };

    let raw: string | null = null;
    try {
      raw = this.backend.getItem(this.key);
    } catch {
      return { ok: false, reason: 'empty' };
    }

    if (raw === null) return { ok: false, reason: 'empty' };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'corrupt' };
    }

    if (!isSaveData(parsed)) return { ok: false, reason: 'corrupt' };

    return { ok: true, data: parsed };
  }

  /** 저장을 지운다. "새로 시작"에서만 호출한다. */
  clear(): void {
    if (!this.backend) return;

    try {
      this.backend.removeItem(this.key);
    } catch {
      // 지우지 못해도 새 게임은 시작할 수 있다.
    }
  }
}

/**
 * 브라우저 localStorage를 가져온다.
 *
 * 비공개 모드나 저장소 차단 설정에서는 접근 자체가 예외를 던지므로 여기서 걸러 둔다.
 *
 * @returns 저장소. 쓸 수 없으면 null.
 */
function readBrowserStorage(): StorageBackend | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;

    // 실제로 쓸 수 있는지 확인한다. 읽기만 되고 쓰기가 막힌 설정이 있다.
    const probe = '__townbuilder_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);

    return storage;
  } catch {
    return null;
  }
}
