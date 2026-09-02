import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/core/save';
import { BlockType } from '../src/core/blocks';
import { Inventory } from '../src/core/Inventory';
import { Terrain } from '../src/core/Terrain';
import { ToolKind, ToolTier } from '../src/core/tools';
import { SaveStore, type StorageBackend } from '../src/sim/SaveStore';

/** 메모리 위에서 도는 저장소 대역. */
class MemoryStorage implements StorageBackend {
  private readonly map = new Map<string, string>();

  /** 쓰기를 막을지 여부. 용량 초과를 흉내낼 때 쓴다. */
  failWrites = false;
  /** 읽기에서 예외를 던질지 여부. 접근 차단을 흉내낸다. */
  failReads = false;

  /**
   * 값을 읽는다.
   *
   * @param key 키.
   */
  getItem(key: string): string | null {
    if (this.failReads) throw new Error('접근 거부');
    return this.map.get(key) ?? null;
  }

  /**
   * 값을 쓴다.
   *
   * @param key 키.
   * @param value 값.
   */
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('용량 초과');
    this.map.set(key, value);
  }

  /**
   * 값을 지운다.
   *
   * @param key 키.
   */
  removeItem(key: string): void {
    this.map.delete(key);
  }

  /**
   * 값을 직접 넣는다. 손상된 저장을 만들 때 쓴다.
   *
   * @param key 키.
   * @param value 값.
   */
  poke(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** 최소한의 유효한 저장 데이터를 만든다. */
function sampleSave() {
  const terrain = new Terrain(4, 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
  }

  return {
    version: SAVE_VERSION,
    savedAt: 1_700_000_000_000,
    seed: 7,
    terrain: terrain.toSave(),
    nodes: [],
    player: { x: 1, y: 1, tools: [{ kind: ToolKind.SHOVEL, tier: ToolTier.BASIC }], selectedSlot: 0 },
    inventory: new Inventory().toSave(),
    storage: new Inventory().toSave(),
    buildings: [],
    nextBuildingId: 1,
    npcs: [],
    nextNpcId: 1,
    requests: [],
    nextRequestId: 1,
    completedRequests: 0,
    requestTimerMs: 0,
    level: 1,
    experience: 0,
    elapsedMs: 0,
  };
}

describe('SaveStore', () => {
  it('저장하고 다시 읽는다', () => {
    const backend = new MemoryStorage();
    const store = new SaveStore(backend, 'test');

    expect(store.hasSave).toBe(false);
    expect(store.save(sampleSave())).toEqual({ ok: true });
    expect(store.hasSave).toBe(true);

    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.data.seed).toBe(7);
  });

  it('저장이 없으면 empty를 돌려준다', () => {
    const store = new SaveStore(new MemoryStorage(), 'test');

    expect(store.load()).toEqual({ ok: false, reason: 'empty' });
  });

  it('저장소가 없으면 저장이 실패하지만 예외는 아니다', () => {
    const store = new SaveStore(null, 'test');

    expect(store.available).toBe(false);
    expect(store.save(sampleSave())).toEqual({ ok: false, reason: 'unavailable' });
    expect(store.load()).toEqual({ ok: false, reason: 'empty' });
    expect(() => store.clear()).not.toThrow();
  });

  it('용량이 부족하면 이유를 돌려준다', () => {
    const backend = new MemoryStorage();
    backend.failWrites = true;
    const store = new SaveStore(backend, 'test');

    expect(store.save(sampleSave())).toEqual({ ok: false, reason: 'quota' });
  });

  it('JSON이 깨졌으면 corrupt로 알린다', () => {
    const backend = new MemoryStorage();
    backend.poke('test', '{깨진');
    const store = new SaveStore(backend, 'test');

    expect(store.load()).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('형식이 다르면 corrupt로 알린다', () => {
    const backend = new MemoryStorage();
    backend.poke('test', JSON.stringify({ version: 999 }));
    const store = new SaveStore(backend, 'test');

    expect(store.load()).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('손상된 저장을 읽어도 지우지 않는다 — 유일한 사본일 수 있다', () => {
    const backend = new MemoryStorage();
    backend.poke('test', '{깨진');
    const store = new SaveStore(backend, 'test');

    store.load();

    expect(backend.getItem('test')).toBe('{깨진');
  });

  it('읽기가 예외를 던져도 게임이 죽지 않는다', () => {
    const backend = new MemoryStorage();
    backend.failReads = true;
    const store = new SaveStore(backend, 'test');

    expect(store.hasSave).toBe(false);
    expect(store.load()).toEqual({ ok: false, reason: 'empty' });
  });

  it('지우면 저장이 사라진다', () => {
    const backend = new MemoryStorage();
    const store = new SaveStore(backend, 'test');
    store.save(sampleSave());

    store.clear();

    expect(store.hasSave).toBe(false);
  });

  it('키가 다르면 서로 간섭하지 않는다', () => {
    const backend = new MemoryStorage();
    const a = new SaveStore(backend, 'a');
    const b = new SaveStore(backend, 'b');

    a.save(sampleSave());

    expect(b.hasSave).toBe(false);
  });
});
