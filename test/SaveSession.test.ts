import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, type SaveData } from '../src/core/save';
import { BlockType } from '../src/core/blocks';
import { Inventory } from '../src/core/Inventory';
import { Terrain } from '../src/core/Terrain';
import { ToolKind, ToolTier } from '../src/core/tools';
import { SaveSession } from '../src/sim/SaveSession';
import { SaveStore, type StorageBackend } from '../src/sim/SaveStore';

/** 메모리 위에서 도는 저장소 대역. */
class MemoryStorage implements StorageBackend {
  readonly map = new Map<string, string>();
  failWrites = false;

  /**
   * 값을 읽는다.
   *
   * @param key 키.
   */
  getItem(key: string): string | null {
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
}

/** 최소한의 유효한 저장 데이터를 만든다. */
function sampleSave(): SaveData {
  const terrain = new Terrain(2, 2);
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) terrain.fillColumn(x, y, 1, BlockType.DIRT);
  }

  return {
    version: SAVE_VERSION,
    savedAt: 0,
    seed: 1,
    terrain: terrain.toSave(),
    nodes: [],
    player: { x: 0, y: 0, tools: [{ kind: ToolKind.SHOVEL, tier: ToolTier.BASIC }], selectedSlot: 0 },
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

/**
 * 세션과 대역 저장소를 준비한다.
 *
 * @param intervalMs 자동 저장 간격.
 */
function setup(intervalMs = 1000) {
  const backend = new MemoryStorage();
  const store = new SaveStore(backend, 'test');
  const session = new SaveSession(store, { intervalMs });

  let snapshots = 0;
  const snapshot = () => {
    snapshots += 1;
    return sampleSave();
  };

  return { backend, store, session, snapshot, count: () => snapshots };
}

describe('SaveSession 자동 저장', () => {
  it('간격에 못 미치면 저장하지 않는다', () => {
    const { session, snapshot, backend } = setup(1000);

    expect(session.tick(500, snapshot)).toBe(false);
    expect(backend.map.size).toBe(0);
  });

  it('간격을 넘기면 저장한다', () => {
    const { session, snapshot, backend } = setup(1000);

    session.tick(600, snapshot);
    expect(session.tick(600, snapshot)).toBe(true);
    expect(backend.map.has('test')).toBe(true);
  });

  it('저장 후 타이머가 다시 시작한다', () => {
    const { session, snapshot } = setup(1000);
    session.tick(1200, snapshot);

    expect(session.tick(500, snapshot)).toBe(false);
  });

  it('저장할 때만 스냅샷을 만든다 — 매 프레임 전체 상태를 직렬화하면 비싸다', () => {
    const { session, snapshot, count } = setup(1000);

    for (let i = 0; i < 50; i += 1) session.tick(10, snapshot);

    expect(count()).toBe(0);

    session.tick(1000, snapshot);
    expect(count()).toBe(1);
  });

  it('수동 저장도 자동 저장 타이머를 미룬다', () => {
    const { session, snapshot } = setup(1000);
    session.tick(900, snapshot);

    session.save(snapshot);

    expect(session.tick(200, snapshot)).toBe(false);
  });
});

describe('SaveSession 상태', () => {
  it('처음에는 저장한 적이 없다', () => {
    const { session } = setup();

    expect(session.status.lastSavedAt).toBeNull();
    expect(session.status.failure).toBeNull();
    expect(session.status.available).toBe(true);
  });

  it('불러온 저장의 시각을 이어받는다', () => {
    const store = new SaveStore(new MemoryStorage(), 'test');
    const session = new SaveSession(store, { lastSavedAt: 1234 });

    expect(session.status.lastSavedAt).toBe(1234);
  });

  it('저장에 성공하면 시각이 갱신된다', () => {
    const { session, snapshot } = setup();

    session.save(snapshot);

    expect(session.status.lastSavedAt).not.toBeNull();
    expect(session.status.failure).toBeNull();
  });

  it('저장에 실패하면 사유를 남긴다', () => {
    const { session, snapshot, backend } = setup();
    backend.failWrites = true;

    expect(session.save(snapshot).ok).toBe(false);
    expect(session.status.failure).toBe('quota');
  });

  it('실패 뒤 성공하면 사유가 지워진다', () => {
    const { session, snapshot, backend } = setup();
    backend.failWrites = true;
    session.save(snapshot);

    backend.failWrites = false;
    session.save(snapshot);

    expect(session.status.failure).toBeNull();
  });

  it('저장소가 없으면 그렇게 알린다', () => {
    const session = new SaveSession(new SaveStore(null, 'test'));

    expect(session.status.available).toBe(false);
  });
});

describe('SaveSession 멈춤', () => {
  it('멈춘 뒤에는 자동 저장하지 않는다', () => {
    const { session, snapshot, backend } = setup(1000);

    session.suspend();

    expect(session.tick(5000, snapshot)).toBe(false);
    expect(backend.map.size).toBe(0);
  });

  it('멈춘 뒤에는 수동 저장도 하지 않는다', () => {
    const { session, snapshot, backend } = setup();

    session.suspend();

    expect(session.save(snapshot).ok).toBe(false);
    expect(backend.map.size).toBe(0);
  });

  it('멈춘 뒤 지운 저장이 되살아나지 않는다 — 새로 시작이 취소되던 실제 버그', () => {
    const { session, store, snapshot, backend } = setup();
    session.save(snapshot);
    expect(backend.map.has('test')).toBe(true);

    // "새로 시작": 저장을 멈추고 지운 뒤 페이지를 다시 연다.
    session.suspend();
    store.clear();

    // 탭이 닫히며 한 번 더 저장이 시도되는 상황.
    session.save(snapshot);
    session.tick(999_999, snapshot);

    expect(backend.map.has('test')).toBe(false);
  });

  it('멈춘 뒤에도 상태 조회는 동작한다', () => {
    const { session, snapshot } = setup();
    session.save(snapshot);
    const before = session.status.lastSavedAt;

    session.suspend();

    expect(session.active).toBe(false);
    expect(session.status.lastSavedAt).toBe(before);
  });
});
