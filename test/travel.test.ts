import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { BlueprintId, blueprintById } from '../src/core/blueprints';
import { ItemType } from '../src/core/items';
import { NodeKind, nodeDefinition } from '../src/core/resourceNodes';
import { ToolKind, ToolTier } from '../src/core/tools';
import { toolTierAtLevel } from '../src/core/village';
import { MapId, isMapId, isVillageMap, mapSeed } from '../src/core/maps';
import { isMapUnlocked, mapUnlockLevel } from '../src/core/village';
import { walkableNeighbors } from '../src/core/movement';
import { Terrain } from '../src/core/Terrain';
import { generateTerrain } from '../src/core/terrainGen';
import { Zone, zoneAt } from '../src/core/zones';
import { Game } from '../src/sim/Game';
import { ResourceField } from '../src/sim/ResourceField';

/**
 * 평평한 지상 지형으로 게임을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function makeGame(size = 13): Game {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 3, BlockType.DIRT);
  }

  const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
  game.setWorldSeed(1234);
  // 동굴은 마을 레벨로 열린다. 이동을 다루는 테스트는 열린 상태에서 시작한다.
  game.setVillageLevel(mapUnlockLevel(MapId.CAVE));

  return game;
}

/**
 * 통로 위로 옮겨 서서 반대편 맵으로 간다.
 *
 * @param game 대상 게임.
 */
function goThroughPortal(game: Game): void {
  const portal = game.portal;
  game.player.placeAt(portal.x, portal.y);
  const result = game.travel();
  if (!result.ok) throw new Error('통로를 타지 못했다');
}

describe('맵 종류', () => {
  it('마을은 지상에만 있다', () => {
    expect(isVillageMap(MapId.SURFACE)).toBe(true);
    expect(isVillageMap(MapId.CAVE)).toBe(false);
  });

  it('맵마다 다른 시드를 준다 — 같으면 동굴이 지상과 같은 모양이 된다', () => {
    expect(mapSeed(42, MapId.SURFACE)).not.toBe(mapSeed(42, MapId.CAVE));
  });

  it('세계 시드가 같으면 맵 시드도 같다', () => {
    expect(mapSeed(42, MapId.CAVE)).toBe(mapSeed(42, MapId.CAVE));
  });

  it('알 수 없는 맵 이름은 거절한다', () => {
    expect(isMapId(MapId.CAVE)).toBe(true);
    expect(isMapId('sky')).toBe(false);
  });
});

describe('맵 이동', () => {
  it('처음에는 지상에 있다', () => {
    const game = makeGame();

    expect(game.currentMap).toBe(MapId.SURFACE);
    expect(game.inVillage).toBe(true);
  });

  it('통로 위에 있지 않으면 이동하지 않는다', () => {
    const game = makeGame();
    const result = game.travel();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('notPortal');
  });

  it('레벨이 낮으면 동굴에 들어갈 수 없다', () => {
    const game = makeGame();
    game.setVillageLevel(1);
    game.player.placeAt(game.portal.x, game.portal.y);

    const result = game.travel();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('mapLocked');
  });

  it('동굴과 고급 곡괭이가 같은 레벨에 열린다 — 하나만 열리면 헛걸음이다', () => {
    const level = mapUnlockLevel(MapId.CAVE);

    expect(isMapUnlocked(MapId.CAVE, level)).toBe(true);
    expect(isMapUnlocked(MapId.CAVE, level - 1)).toBe(false);
    expect(toolTierAtLevel(ToolKind.PICKAXE, level)).toBe(ToolTier.HIGH);
  });

  it('나오는 길은 언제나 열려 있다 — 잠긴 맵에 갇히지 않는다', () => {
    const game = makeGame();
    goThroughPortal(game);
    game.setVillageLevel(1);

    game.player.placeAt(game.portal.x, game.portal.y);

    expect(game.travel().ok).toBe(true);
    expect(game.currentMap).toBe(MapId.SURFACE);
  });

  it('통로를 타면 동굴로 간다', () => {
    const game = makeGame();
    goThroughPortal(game);

    expect(game.currentMap).toBe(MapId.CAVE);
    expect(game.inVillage).toBe(false);
  });

  it('도착 지점은 그쪽 통로 위다 — 나오면 들어간 자리에 선다', () => {
    const game = makeGame();
    goThroughPortal(game);

    expect(game.player.position).toEqual(game.portal);
    expect(game.onPortal).toBe(true);
  });

  it('다시 타면 지상으로 돌아온다', () => {
    const game = makeGame();
    const entrance = game.portal;

    goThroughPortal(game);
    goThroughPortal(game);

    expect(game.currentMap).toBe(MapId.SURFACE);
    expect(game.player.position).toEqual(entrance);
  });

  it('동굴은 지상과 다른 지형이다', () => {
    const game = makeGame();
    const surfaceSurface = game.terrain.surfaceBlock(1, 1);

    goThroughPortal(game);

    // 동굴 벽은 꽉 찬 암반 기둥이라 지상의 흙 지면보다 훨씬 높다.
    expect(game.terrain.columnHeight(0, 0)).toBeGreaterThan(3);
    expect(surfaceSurface).toBe(BlockType.DIRT);
  });

  it('이동을 알림으로 알린다', () => {
    const game = makeGame();
    game.drainNotices();
    goThroughPortal(game);

    const notices = game.drainNotices();

    expect(notices.some((notice) => notice.cue === 'travel')).toBe(true);
  });
});

describe('통로 자리', () => {
  it('실제 생성 지형에서 통로는 산악 구역에 놓인다', () => {
    const terrain = generateTerrain(32, 32, { seed: 20260901 });
    const game = new Game(terrain, new ResourceField(terrain, { seed: 20260901 }));

    // 구역은 마을 중심에서의 거리로 나뉜다(ADR 0005). 가장 먼 칸은 곧 산악이다.
    expect(zoneAt(terrain, game.portal.x, game.portal.y)).toBe(Zone.MOUNTAIN);
  });

  it('통로까지 걸어갈 수 있다 — 닿지 못하는 입구는 없는 것과 같다', () => {
    const terrain = generateTerrain(32, 32, { seed: 20260901 });
    const game = new Game(terrain, new ResourceField(terrain, { seed: 20260901 }));

    const start = game.player.position;
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length > 0) {
      const at = queue.shift()!;
      for (const next of walkableNeighbors(terrain, at)) {
        const key = `${next.x},${next.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push(next);
      }
    }

    expect(seen.has(`${game.portal.x},${game.portal.y}`)).toBe(true);
  });
});

describe('맵을 오가도 남는 것', () => {
  it('지상에서 판 자리가 그대로 남는다', () => {
    const game = makeGame();
    const dug = { x: 5, y: 5 };
    game.player.placeAt(dug.x + 1, dug.y);
    game.digAt(dug);
    const height = game.terrain.columnHeight(dug.x, dug.y);

    goThroughPortal(game);
    goThroughPortal(game);

    expect(game.terrain.columnHeight(dug.x, dug.y)).toBe(height);
  });

  it('동굴에서 판 자리도 남는다', () => {
    const game = makeGame();
    goThroughPortal(game);

    const at = game.player.position;
    const target = { x: at.x + 1, y: at.y };
    const before = game.terrain.columnHeight(target.x, target.y);
    // 동굴은 암반이라 곡괭이가 필요하다.
    game.player.selectTool(1);
    game.digAt(target);
    const after = game.terrain.columnHeight(target.x, target.y);
    expect(after).toBeLessThan(before);

    goThroughPortal(game);
    goThroughPortal(game);

    expect(game.terrain.columnHeight(target.x, target.y)).toBe(after);
  });

  it('마을의 시간은 동굴에 있는 동안에도 흐른다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.WELL);
    game.storage.add(ItemType.STONE, 10);
    game.buildAt({ x: 5, y: 5 });
    const before = game.buildings.completedCount;

    goThroughPortal(game);
    for (let i = 0; i < 600; i += 1) game.update(1000 / 60);

    // 동굴에 있는 동안 마을이 멈추면 오래 있을수록 손해가 되는 규칙이 생긴다.
    expect(game.buildings.completedCount).toBe(before + 1);
  });
});

describe('마을 규칙은 지상에서만', () => {
  it('동굴에서는 건축이 거부된다', () => {
    const game = makeGame();
    game.storage.add(ItemType.STONE, 20);
    game.selectBlueprint(BlueprintId.WELL);

    goThroughPortal(game);
    const at = game.player.position;
    const result = game.buildAt({ x: at.x + 1, y: at.y });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('notVillage');
  });

  it('동굴에서는 미리보기도 나오지 않는다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.WELL);
    goThroughPortal(game);

    expect(game.ghost(game.player.position)).toBeNull();
  });

  it('동굴에서는 창고에 손이 닿지 않는다', () => {
    const game = makeGame();
    goThroughPortal(game);

    expect(game.nearStorage).toBe(false);
    expect(game.depositAll().size).toBe(0);
  });

  it('동굴에서는 지상 건물이 칸을 막지 않는다', () => {
    const game = makeGame();
    const storage = game.startingStorage;
    expect(game.isOccupied({ x: storage.x, y: storage.y })).toBe(true);

    goThroughPortal(game);

    expect(game.isOccupied({ x: storage.x, y: storage.y })).toBe(false);
  });

  it('동굴에는 잠긴 구역이 없다 — 구역은 마을 중심에서의 거리다', () => {
    const game = makeGame(31);
    goThroughPortal(game);
    // 구역이 잠기는 낮은 레벨로 되돌려도 동굴에서는 잠금이 없다.
    game.setVillageLevel(1);

    expect(game.isZoneLocked(0, 0)).toBe(false);

    game.player.placeAt(game.portal.x, game.portal.y);
    game.travel();

    // 같은 좌표가 지상에서는 아직 열리지 않은 산악이다.
    expect(game.isZoneLocked(0, 0)).toBe(true);
  });

  it('동굴에서는 주민과 건물을 그리지 않는다', () => {
    const game = makeGame();
    const surfaceKinds = game.entities().map((entity) => entity.kind);
    expect(surfaceKinds).toContain('building');

    goThroughPortal(game);
    const caveKinds = game.entities().map((entity) => entity.kind);

    expect(caveKinds).not.toContain('building');
    expect(caveKinds).not.toContain('npc');
    // 나가는 길은 어느 맵에서나 보여야 한다.
    expect(caveKinds).toContain('portal');
  });
});

describe('맵과 저장', () => {
  it('동굴에 있는 채로 저장하면 동굴에서 이어진다', () => {
    const game = makeGame();
    goThroughPortal(game);

    const restored = Game.fromSave(game.toSave());

    expect(restored?.currentMap).toBe(MapId.CAVE);
    expect(restored?.player.position).toEqual(game.player.position);
  });

  it('두 맵의 변경분이 모두 저장된다', () => {
    const game = makeGame();
    const dug = { x: 5, y: 5 };
    game.player.placeAt(dug.x + 1, dug.y);
    game.digAt(dug);
    const surfaceHeight = game.terrain.columnHeight(dug.x, dug.y);

    goThroughPortal(game);
    const caveTile = { x: game.player.position.x + 1, y: game.player.position.y };
    game.player.selectTool(1);
    game.digAt(caveTile);
    const caveHeight = game.terrain.columnHeight(caveTile.x, caveTile.y);

    const restored = Game.fromSave(game.toSave());
    if (!restored) throw new Error('되살리지 못했다');

    expect(restored.terrain.columnHeight(caveTile.x, caveTile.y)).toBe(caveHeight);

    goThroughPortal(restored);

    expect(restored.currentMap).toBe(MapId.SURFACE);
    expect(restored.terrain.columnHeight(dug.x, dug.y)).toBe(surfaceHeight);
  });

  it('가 보지 않은 맵은 저장에 담기지 않는다 — 시드에서 다시 만들어진다', () => {
    const game = makeGame();

    expect(game.toSave().maps).toHaveLength(1);

    goThroughPortal(game);

    expect(game.toSave().maps).toHaveLength(2);
  });

  it('같은 시드면 같은 동굴이 나온다', () => {
    const first = makeGame();
    const second = makeGame();

    goThroughPortal(first);
    goThroughPortal(second);

    expect(second.terrain.toSave().heights).toBe(first.terrain.toSave().heights);
    expect(second.portal).toEqual(first.portal);
  });
});

describe('동굴의 자원', () => {
  /** 동굴에 들어간 게임을 만든다. */
  function inCave() {
    const game = makeGame(21);
    goThroughPortal(game);
    return game;
  }

  it('동굴에만 수정 광맥이 있다', () => {
    const game = inCave();
    const kinds = new Set([...game.resources.all].map((node) => node.kind));

    expect(kinds.has(NodeKind.CRYSTAL_VEIN)).toBe(true);
    // 볕이 들지 않는 곳이다.
    expect(kinds.has(NodeKind.TREE)).toBe(false);
  });

  it('광맥은 파낸 바닥에만 놓인다 — 벽 속에 있으면 닿을 수 없다', () => {
    const game = inCave();

    for (const node of game.resources.all) {
      expect(game.terrain.columnHeight(node.x, node.y)).toBe(1);
    }
  });

  it('출구에는 광맥을 두지 않는다 — 막히면 나갈 길이 사라진다', () => {
    const game = inCave();

    expect(game.resources.isBlocked(game.portal.x, game.portal.y)).toBe(false);
  });

  it('수정은 고급 곡괭이로만 캔다', () => {
    const game = inCave();
    const crystal = [...game.resources.all].find((node) => node.kind === NodeKind.CRYSTAL_VEIN);
    if (!crystal) throw new Error('수정 광맥이 없다');

    expect(nodeDefinition(NodeKind.CRYSTAL_VEIN).minTier).toBe(ToolTier.HIGH);

    // 중급 곡괭이로는 거절된다.
    const denied = game.resources.harvest(crystal.x, crystal.y, {
      kind: ToolKind.PICKAXE,
      tier: ToolTier.MID,
    });
    expect(denied.ok).toBe(false);
    expect(denied.ok === false && denied.reason).toBe('wrongTool');

    // 동굴이 열리는 레벨에서는 고급 곡괭이를 들고 있으므로 캘 수 있다.
    game.player.placeAt(crystal.x + 1, crystal.y);
    game.player.selectTool(1);
    expect(game.player.tool.tier).toBe(ToolTier.HIGH);
    expect(game.harvestAt({ x: crystal.x, y: crystal.y }).ok).toBe(true);
  });

  it('지상에는 수정이 없다 — 갈 이유가 동굴에 있어야 한다', () => {
    const terrain = generateTerrain(32, 32, { seed: 20260901 });
    const field = new ResourceField(terrain, { seed: 20260901 });
    const kinds = new Set([...field.all].map((node) => node.kind));

    expect(kinds.has(NodeKind.CRYSTAL_VEIN)).toBe(false);
  });

  it('동굴에서는 화면이 어둡다', () => {
    const game = makeGame();

    expect(game.dark).toBe(false);
    goThroughPortal(game);
    expect(game.dark).toBe(true);
  });
});

describe('대장간', () => {
  it('수정이 있어야 지어진다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.FORGE);
    game.storage.add(ItemType.STONE, 20);
    game.storage.add(ItemType.IRON_ORE, 10);

    const denied = game.buildAt({ x: 5, y: 5 });
    expect(denied.ok).toBe(false);
    expect(denied.ok === false && denied.reason).toBe('noMaterial');

    game.storage.add(ItemType.CRYSTAL, 3);
    const built = game.buildAt({ x: 5, y: 5 });

    expect(built.ok).toBe(true);
    expect(game.totalHeld(ItemType.CRYSTAL)).toBe(0);
  });

  it('동굴이 열리는 레벨에 함께 열린다', () => {
    const forge = blueprintById(BlueprintId.FORGE);

    expect(forge.unlockLevel).toBe(mapUnlockLevel(MapId.CAVE));
  });
});

describe('Phase 3 완료 기준', () => {
  it('동굴에서 수정을 캐 지상에 대장간을 짓는다', () => {
    const game = makeGame(21);
    goThroughPortal(game);

    const crystal = [...game.resources.all].find((node) => node.kind === NodeKind.CRYSTAL_VEIN);
    if (!crystal) throw new Error('수정 광맥이 없다');

    // 광맥 옆에 서서 부술 때까지 캔다. 휘두르기 쿨다운이 있으므로 사이사이 시간을 흘린다.
    game.player.placeAt(crystal.x + 1, crystal.y);
    game.player.selectTool(1);
    const needed = blueprintById(BlueprintId.FORGE).materials.find(
      (material) => material.item === ItemType.CRYSTAL,
    )!.amount;

    for (let guard = 0; guard < 200 && game.inventory.count(ItemType.CRYSTAL) < needed; guard += 1) {
      game.harvestAt({ x: crystal.x, y: crystal.y });
      for (let step = 0; step < 40; step += 1) game.update(1000 / 60);
    }

    expect(game.inventory.count(ItemType.CRYSTAL)).toBeGreaterThanOrEqual(needed);

    // 지상으로 돌아와 짓는다.
    game.player.placeAt(game.portal.x, game.portal.y);
    game.travel();
    expect(game.currentMap).toBe(MapId.SURFACE);

    game.storage.add(ItemType.STONE, 20);
    game.storage.add(ItemType.IRON_ORE, 10);
    game.selectBlueprint(BlueprintId.FORGE);

    const built = game.buildAt({ x: 5, y: 5 });

    expect(built.ok).toBe(true);
    // 갔다 온 보상이 마을에 남는다.
    for (let step = 0; step < 600; step += 1) game.update(1000 / 60);
    expect(
      [...game.buildings.all].some((building) => building.blueprintId === BlueprintId.FORGE),
    ).toBe(true);
  });
});
