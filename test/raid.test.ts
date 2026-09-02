import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { BlueprintId } from '../src/core/blueprints';
import { DAY_LENGTH_MS } from '../src/core/daycycle';
import { ItemType } from '../src/core/items';
import {
  DAMAGE_LIMIT,
  MONSTER_HEALTH,
  RAID_INTERVAL_DAYS,
  RAID_MIN_LEVEL,
  isRaidNight,
  raidSize,
} from '../src/core/monsters';
import { Terrain } from '../src/core/Terrain';
import { Game } from '../src/sim/Game';
import { ResourceField } from '../src/sim/ResourceField';

/** 시뮬레이션 한 스텝(ms). */
const STEP_MS = 1000 / 60;

/**
 * 평평한 지형으로 게임을 만든다. 자재는 넉넉히 채운다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function makeGame(size = 13): Game {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 3, BlockType.DIRT);
  }

  const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
  game.setWorldSeed(99);
  game.setVillageLevel(RAID_MIN_LEVEL);
  game.storage.add(ItemType.WOOD, 90);
  game.storage.add(ItemType.STONE, 90);
  game.storage.add(ItemType.IRON_ORE, 20);

  return game;
}

/**
 * 게임 시간을 흘린다.
 *
 * @param game 대상 게임.
 * @param totalMs 흘릴 시간(ms).
 */
function advance(game: Game, totalMs: number): void {
  for (let elapsed = 0; elapsed < totalMs; elapsed += STEP_MS) game.update(STEP_MS);
}

/**
 * 침입이 오는 밤까지 시간을 흘린다.
 *
 * @param game 대상 게임.
 */
function advanceToRaid(game: Game): void {
  for (let guard = 0; guard < 12 && !game.raid.active; guard += 1) {
    advance(game, DAY_LENGTH_MS * 0.25);
  }
  if (!game.raid.active) throw new Error('침입이 오지 않았다');
}

describe('침입 규칙', () => {
  it('낮은 레벨에는 오지 않는다 — 방어할 것도 지을 것도 없다', () => {
    expect(raidSize(RAID_MIN_LEVEL - 1)).toBe(0);
    expect(isRaidNight(RAID_INTERVAL_DAYS, RAID_MIN_LEVEL - 1)).toBe(false);
  });

  it('레벨이 오르면 마릿수가 늘지만 상한이 있다', () => {
    expect(raidSize(RAID_MIN_LEVEL)).toBe(1);
    expect(raidSize(RAID_MIN_LEVEL + 4)).toBeGreaterThan(raidSize(RAID_MIN_LEVEL));
    expect(raidSize(100)).toBe(raidSize(1000));
  });

  it('매일 오지 않는다 — 밤이 곧 벌칙이 되면 안 된다', () => {
    const nights = [];
    for (let day = 1; day <= 6; day += 1) nights.push(isRaidNight(day, RAID_MIN_LEVEL));

    expect(nights.filter(Boolean).length).toBeLessThan(nights.length);
  });

  it('날짜만 보고 정한다 — 준비할 수 없는 방어는 사고다', () => {
    expect(isRaidNight(RAID_INTERVAL_DAYS * 2, RAID_MIN_LEVEL)).toBe(
      isRaidNight(RAID_INTERVAL_DAYS * 2, RAID_MIN_LEVEL),
    );
  });
});

describe('밤의 침입', () => {
  it('밤이 되면 몬스터가 온다', () => {
    const game = makeGame();
    expect(game.raid.active).toBe(false);

    advanceToRaid(game);

    expect(game.raid.monsters.length).toBeGreaterThan(0);
    expect(game.isNight).toBe(true);
  });

  it('몰려온 것을 알린다', () => {
    const game = makeGame();
    game.drainNotices();
    advanceToRaid(game);

    const notices = game.drainNotices();

    expect(notices.some((notice) => notice.cue === 'raid')).toBe(true);
  });

  it('해가 뜨면 물러간다 — 밤 하나가 한 판이다', () => {
    const game = makeGame();
    advanceToRaid(game);

    advance(game, DAY_LENGTH_MS * 0.6);

    expect(game.raid.active).toBe(false);
  });

  it('건물을 부수지 않고 손상시킨다', () => {
    const game = makeGame();
    advanceToRaid(game);

    advance(game, DAY_LENGTH_MS * 0.3);

    const storage = game.buildings.buildingById(game.startingStorage.id);
    // 몬스터가 창고까지 닿았다면 손상만 남는다. 건물 자체는 사라지지 않는다.
    expect(storage).toBeDefined();
    expect(storage!.damage).toBeLessThanOrEqual(DAMAGE_LIMIT);
  });

  it('손상된 건물은 기능이 멈춘다', () => {
    const game = makeGame();
    const before = game.buildings.completedCount;

    game.buildings.damageBuilding(game.startingStorage.id);

    expect(game.buildings.completedCount).toBe(before - 1);
    expect(game.buildings.damagedCount).toBe(1);
  });

  it('플레이어는 다치지 않는다 — 체력이라는 값 자체가 없다', () => {
    const game = makeGame();
    advanceToRaid(game);
    const position = game.player.position;

    advance(game, DAY_LENGTH_MS * 0.2);

    // 몬스터가 옆에 와도 플레이어에게 일어나는 일은 없다.
    expect(game.player.position).toEqual(position);
    expect('health' in game.player).toBe(false);
  });
});

describe('방어와 수리', () => {
  it('도구로 때리면 물러간다', () => {
    const game = makeGame();
    advanceToRaid(game);

    const monster = game.raid.monsters[0]!;
    game.player.placeAt(monster.x + 1, monster.y);

    for (let hit = 0; hit < MONSTER_HEALTH; hit += 1) {
      const result = game.actAt({ x: monster.x, y: monster.y });
      expect(result.ok).toBe(true);
      advance(game, 400);
    }

    expect(game.raid.monsters.some((raider) => raider.id === monster.id)).toBe(false);
  });

  it('물리치면 마을 경험치를 준다 — 자원을 주면 사냥이 채집보다 나아진다', () => {
    const game = makeGame();
    advanceToRaid(game);

    const monster = game.raid.monsters[0]!;
    game.player.placeAt(monster.x + 1, monster.y);
    const before = game.experience;
    const carried = game.inventory.total;

    for (let hit = 0; hit < MONSTER_HEALTH; hit += 1) {
      game.actAt({ x: monster.x, y: monster.y });
      advance(game, 400);
    }

    expect(game.experience).toBeGreaterThan(before);
    expect(game.inventory.total).toBe(carried);
  });

  it('손상된 건물을 자재로 고친다', () => {
    const game = makeGame();
    const storage = game.startingStorage;
    game.buildings.damageBuilding(storage.id);
    game.player.placeAt(storage.x, storage.y + 2);

    const result = game.repairAt({ x: storage.x, y: storage.y });

    expect(result.ok).toBe(true);
    expect(game.buildings.buildingById(storage.id)?.damage).toBe(0);
  });

  it('자재가 없으면 고칠 수 없다', () => {
    // 자재를 채우지 않은 판을 따로 만든다.
    const terrain = new Terrain(13, 13);
    for (let y = 0; y < 13; y += 1) {
      for (let x = 0; x < 13; x += 1) terrain.fillColumn(x, y, 3, BlockType.DIRT);
    }
    const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
    game.buildings.damageBuilding(game.startingStorage.id);

    const result = game.repairAt({ x: game.startingStorage.x, y: game.startingStorage.y });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('noMaterial');
  });

  it('성한 건물은 고칠 것이 없다', () => {
    const game = makeGame();

    const result = game.repairAt({ x: game.startingStorage.x, y: game.startingStorage.y });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('notDamaged');
  });

  it('Space로 몬스터를 때리고 손상된 건물을 고친다 — 같은 키로 눈앞의 것을 다룬다', () => {
    const game = makeGame();
    const storage = game.startingStorage;
    game.buildings.damageBuilding(storage.id);
    game.player.placeAt(storage.x, storage.y + 2);

    // actAt은 몬스터 → 손상 건물 → 자원 → 지형 순으로 본다.
    const repaired = game.actAt({ x: storage.x, y: storage.y });

    expect(repaired.ok).toBe(true);
    expect(game.buildings.buildingById(storage.id)?.damage).toBe(0);
  });

  it('울타리가 길을 막는다 — 몬스터는 건물 위를 지나지 못한다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.FENCE);
    const built = game.buildAt({ x: 4, y: 4 });
    expect(built.ok).toBe(true);
    advance(game, 4000);

    expect(game.isOccupied({ x: 4, y: 4 })).toBe(true);
  });

  it('울타리는 두들겨 맞으면 무너진다 — 완전 봉쇄가 최적 전략이 되면 안 된다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.FENCE);
    game.buildAt({ x: 4, y: 4 });
    game.selectBlueprint(null);
    advance(game, 4000);

    const fence = [...game.buildings.all].find((b) => b.blueprintId === BlueprintId.FENCE)!;
    for (let hit = 0; hit <= DAMAGE_LIMIT; hit += 1) game.buildings.damageBuilding(fence.id);

    expect(game.buildings.buildingById(fence.id)).toBeUndefined();
  });

  it('다른 건물은 아무리 맞아도 무너지지 않는다 — 되돌릴 수 없는 손실은 없다', () => {
    const game = makeGame();
    const storage = game.startingStorage;

    for (let hit = 0; hit < DAMAGE_LIMIT * 3; hit += 1) game.buildings.damageBuilding(storage.id);

    const survived = game.buildings.buildingById(storage.id);
    expect(survived).toBeDefined();
    expect(survived!.damage).toBe(DAMAGE_LIMIT);
  });

  it('몬스터 앞의 울타리는 결국 무너진다 — 두르기만 하면 되는 방어는 없다', () => {
    const game = makeGame();
    game.setVillageLevel(RAID_MIN_LEVEL);
    game.storage.add(ItemType.WOOD, 40);

    // 마을에서 떨어진 곳에 울타리를 세우고, 몬스터를 그 옆에 둔다.
    game.selectBlueprint(BlueprintId.FENCE);
    const built = game.buildAt({ x: 2, y: 10 });
    expect(built.ok).toBe(true);
    game.selectBlueprint(null);
    advance(game, 4000);

    const fence = [...game.buildings.all].find((b) => b.blueprintId === BlueprintId.FENCE)!;

    advanceToRaid(game);
    const monster = game.raid.monsters[0]!;
    monster.x = fence.x;
    monster.y = fence.y + 1;

    // 두드리는 데 걸리는 시간(3초)의 몇 배를 흘린다.
    advance(game, 20_000);

    const survived = game.buildings.buildingById(fence.id);
    expect(survived === undefined || survived.damage > 0).toBe(true);
  });
});

describe('침입과 저장', () => {
  it('진행 중인 침입이 저장에 남는다', () => {
    const game = makeGame();
    advanceToRaid(game);
    const count = game.raid.monsters.length;

    const restored = Game.fromSave(game.toSave());

    expect(restored?.raid.monsters.length).toBe(count);
  });

  it('건물 손상이 저장에 남는다', () => {
    const game = makeGame();
    game.buildings.damageBuilding(game.startingStorage.id);

    const restored = Game.fromSave(game.toSave());

    expect(restored?.buildings.damagedCount).toBe(1);
  });

  it('몬스터가 없던 시절의 저장도 그대로 읽힌다 — 선택적 필드다', () => {
    const game = makeGame();
    const data = game.toSave();
    delete data.raid;
    for (const building of data.buildings) delete building.damage;

    const restored = Game.fromSave(data);

    expect(restored).not.toBeNull();
    expect(restored?.raid.active).toBe(false);
    expect(restored?.buildings.damagedCount).toBe(0);
  });
});
