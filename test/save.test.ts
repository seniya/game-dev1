import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, decodeBytes, encodeBytes, isSaveData } from '../src/core/save';
import { BlockType } from '../src/core/blocks';
import { ItemType } from '../src/core/items';
import { Terrain } from '../src/core/Terrain';
import { Inventory } from '../src/core/Inventory';
import { ToolKind, ToolTier } from '../src/core/tools';

describe('바이트 인코딩', () => {
  it('빈 배열을 왕복한다', () => {
    const text = encodeBytes(new Uint8Array(0));

    expect(decodeBytes(text, 0)).toEqual(new Uint8Array(0));
  });

  it('길이가 3의 배수가 아닌 배열도 왕복한다', () => {
    for (const length of [1, 2, 3, 4, 5, 7, 16, 100]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 37) % 256;

      const back = decodeBytes(encodeBytes(bytes), length);

      expect(back).not.toBeNull();
      expect(Array.from(back!)).toEqual(Array.from(bytes));
    }
  });

  it('0과 255를 포함한 모든 바이트 값을 보존한다', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) bytes[i] = i;

    const back = decodeBytes(encodeBytes(bytes), 256);

    expect(Array.from(back!)).toEqual(Array.from(bytes));
  });

  it('길이가 다르면 거절한다 — 잘린 저장을 그대로 읽지 않는다', () => {
    const text = encodeBytes(new Uint8Array([1, 2, 3, 4]));

    expect(decodeBytes(text, 5)).toBeNull();
    expect(decodeBytes(text, 3)).toBeNull();
  });

  it('base64가 아닌 문자가 섞이면 거절한다', () => {
    expect(decodeBytes('!!!!', 3)).toBeNull();
    expect(decodeBytes(123 as unknown as string, 3)).toBeNull();
  });

  it('숫자 배열 JSON보다 짧다 — 자동 저장이 반복되므로 크기가 곧 비용이다', () => {
    const bytes = new Uint8Array(6144);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 5;

    const encoded = encodeBytes(bytes).length;
    const asJson = JSON.stringify(Array.from(bytes)).length;

    expect(encoded).toBeLessThan(asJson);
  });
});

describe('isSaveData', () => {
  /** 최소한의 유효한 저장 데이터를 만든다. */
  function validSave() {
    const terrain = new Terrain(4, 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
    }

    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      seed: 1,
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

  it('온전한 저장을 통과시킨다', () => {
    expect(isSaveData(validSave())).toBe(true);
  });

  it('객체가 아니면 거절한다', () => {
    expect(isSaveData(null)).toBe(false);
    expect(isSaveData('저장')).toBe(false);
    expect(isSaveData(42)).toBe(false);
  });

  it('버전이 다르면 거절한다 — 예전 저장을 조용히 잘못 읽지 않는다', () => {
    expect(isSaveData({ ...validSave(), version: SAVE_VERSION + 1 })).toBe(false);
    expect(isSaveData({ ...validSave(), version: undefined })).toBe(false);
  });

  it('필수 필드가 빠지면 거절한다', () => {
    for (const field of ['terrain', 'player', 'inventory', 'storage', 'nodes', 'buildings']) {
      const data = validSave() as Record<string, unknown>;
      delete data[field];
      expect(isSaveData(data)).toBe(false);
    }
  });

  it('지형 크기가 이상하면 거절한다', () => {
    const data = validSave();
    expect(isSaveData({ ...data, terrain: { ...data.terrain, width: 0 } })).toBe(false);
    expect(isSaveData({ ...data, terrain: { ...data.terrain, height: 1.5 } })).toBe(false);
  });

  it('도구가 없는 플레이어는 거절한다', () => {
    const data = validSave();
    expect(isSaveData({ ...data, player: { ...data.player, tools: [] } })).toBe(false);
  });
});

describe('Terrain 저장', () => {
  /**
   * 기복이 있는 지형을 만든다.
   *
   * @param size 정사각 맵의 한 변 길이.
   */
  function makeTerrain(size = 6): Terrain {
    const terrain = new Terrain(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        terrain.fillColumn(x, y, 1 + ((x + y) % 3), BlockType.STONE);
        terrain.setBlock(x, y, terrain.columnHeight(x, y) - 1, BlockType.DIRT);
      }
    }
    return terrain;
  }

  it('왕복하면 모든 칸이 같다', () => {
    const original = makeTerrain(8);
    const restored = Terrain.fromSave(original.toSave());

    expect(restored).not.toBeNull();
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        expect(restored!.columnHeight(x, y)).toBe(original.columnHeight(x, y));
        expect(restored!.surfaceBlock(x, y)).toBe(original.surfaceBlock(x, y));
      }
    }
  });

  it('파고 쌓은 결과가 보존된다', () => {
    const original = makeTerrain(6);
    original.dig(2, 2);
    original.dig(2, 2);
    original.place(4, 4, BlockType.DIRT);

    const restored = Terrain.fromSave(original.toSave())!;

    expect(restored.columnHeight(2, 2)).toBe(original.columnHeight(2, 2));
    expect(restored.columnHeight(4, 4)).toBe(original.columnHeight(4, 4));
  });

  it('배열 길이가 크기와 맞지 않으면 거절한다', () => {
    const data = makeTerrain(6).toSave();

    expect(Terrain.fromSave({ ...data, width: 7 })).toBeNull();
    expect(Terrain.fromSave({ ...data, heights: 'AAAA' })).toBeNull();
  });

  it('열 높이가 상한을 넘으면 거절한다 — 그대로 읽으면 배열 밖을 읽는다', () => {
    const terrain = makeTerrain(4);
    const data = terrain.toSave();
    const broken = encodeBytes(new Uint8Array(16).fill(99));

    expect(Terrain.fromSave({ ...data, heights: broken })).toBeNull();
  });
});

describe('Inventory 저장', () => {
  it('슬롯 내용이 그대로 왕복한다', () => {
    const inventory = new Inventory({ slotCount: 4, stackLimit: 10 });
    inventory.add(ItemType.WOOD, 7);
    inventory.add(ItemType.STONE, 3);

    const restored = Inventory.fromSave(inventory.toSave())!;

    expect(restored.slotCount).toBe(4);
    expect(restored.stackLimit).toBe(10);
    expect(restored.count(ItemType.WOOD)).toBe(7);
    expect(restored.count(ItemType.STONE)).toBe(3);
    expect(restored.slotAt(0)).toEqual(inventory.slotAt(0));
  });

  it('빈 슬롯 위치가 보존된다', () => {
    const inventory = new Inventory({ slotCount: 4, stackLimit: 10 });
    inventory.add(ItemType.WOOD, 2);
    inventory.add(ItemType.STONE, 2);
    inventory.remove(ItemType.WOOD, 2);

    const restored = Inventory.fromSave(inventory.toSave())!;

    expect(restored.slotAt(0)).toBeNull();
    expect(restored.slotAt(1)).toEqual({ item: ItemType.STONE, count: 2 });
  });

  it('설정이 이상하면 거절한다', () => {
    const data = new Inventory().toSave();

    expect(Inventory.fromSave({ ...data, slotCount: 0 })).toBeNull();
    expect(Inventory.fromSave({ ...data, stackLimit: -1 })).toBeNull();
  });

  it('망가진 슬롯만 버리고 나머지는 살린다', () => {
    const data = new Inventory({ slotCount: 3, stackLimit: 5 }).toSave();
    data.slots[0] = { item: ItemType.WOOD, count: 2 };
    data.slots[1] = { item: ItemType.STONE, count: -3 } as never;
    data.slots[2] = { item: 999 as never, count: 1 };

    const restored = Inventory.fromSave(data)!;

    expect(restored.count(ItemType.WOOD)).toBe(2);
    expect(restored.total).toBe(2);
  });

  it('스택 상한을 넘는 개수는 잘라 담는다', () => {
    const data = new Inventory({ slotCount: 2, stackLimit: 5 }).toSave();
    data.slots[0] = { item: ItemType.WOOD, count: 99 };

    expect(Inventory.fromSave(data)!.count(ItemType.WOOD)).toBe(5);
  });
});
