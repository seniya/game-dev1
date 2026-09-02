import { describe, expect, it } from 'vitest';
import { BlueprintId } from '../src/core/blueprints';
import { BlockType } from '../src/core/blocks';
import { ItemType } from '../src/core/items';
import { generateTerrain } from '../src/core/terrainGen';
import { Terrain } from '../src/core/Terrain';
import { ToolKind, ToolTier } from '../src/core/tools';
import { Game } from '../src/sim/Game';
import { ResourceField } from '../src/sim/ResourceField';

/**
 * 게임을 지정한 시간만큼 진행한다.
 *
 * @param game 대상 게임.
 * @param totalMs 진행할 시간(ms).
 */
function advance(game: Game, totalMs: number): void {
  const stepMs = 1000 / 60;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) game.update(stepMs);
}

/**
 * 자재를 넉넉히 넣은 평지 게임을 만든다.
 *
 * @param size 맵 크기.
 */
function makeGame(size = 20): Game {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
  }
  const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
  game.setWorldSeed(1234);
  game.storage.add(ItemType.WOOD, 80);
  game.storage.add(ItemType.STONE, 80);

  return game;
}

describe('Game 저장 왕복', () => {
  it('시작 직후 상태가 그대로 돌아온다', () => {
    const game = makeGame();
    const restored = Game.fromSave(game.toSave())!;

    expect(restored).not.toBeNull();
    expect(restored.player.position).toEqual(game.player.position);
    expect(restored.villageLevel).toBe(game.villageLevel);
    expect(restored.buildings.completedCount).toBe(game.buildings.completedCount);
    expect(restored.worldSeed).toBe(1234);
  });

  it('지형 변경분이 보존된다', () => {
    const game = makeGame();
    const target = { x: game.player.position.x, y: game.player.position.y + 1 };
    game.digAt(target);
    advance(game, 300);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.terrain.columnHeight(target.x, target.y)).toBe(
      game.terrain.columnHeight(target.x, target.y),
    );
  });

  it('인벤토리와 창고가 보존된다', () => {
    const game = makeGame();
    game.inventory.add(ItemType.WOOD, 5);
    game.inventory.add(ItemType.IRON_ORE, 2);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.inventory.count(ItemType.WOOD)).toBe(5);
    expect(restored.inventory.count(ItemType.IRON_ORE)).toBe(2);
    expect(restored.storage.count(ItemType.STONE)).toBe(80);
  });

  it('도구 등급과 선택이 보존된다', () => {
    const game = makeGame();
    game.player.upgradeTool(ToolKind.PICKAXE, ToolTier.HIGH);
    game.player.selectTool(1);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.player.selectedSlot).toBe(1);
    expect(restored.player.tool.kind).toBe(ToolKind.PICKAXE);
    expect(restored.player.tool.tier).toBe(ToolTier.HIGH);
  });

  it('건물과 점유가 보존되고, 같은 자리에 다시 지을 수 없다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.COTTAGE);
    game.buildAt({ x: 12, y: 12 });
    advance(game, 6000);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.buildings.completedCount).toBe(game.buildings.completedCount);
    expect(restored.isOccupied({ x: 12, y: 12 })).toBe(true);
    expect(restored.isOccupied({ x: 13, y: 13 })).toBe(true);

    restored.selectBlueprint(BlueprintId.WELL);
    const result = restored.buildAt({ x: 12, y: 12 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.placement).toBe('overlaps');
  });

  it('건축 중인 건물은 남은 시간까지 보존되고 이어서 완공된다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.WELL);
    game.buildAt({ x: 14, y: 14 });
    advance(game, 1000);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.buildings.hasCompleted(BlueprintId.WELL)).toBe(false);
    advance(restored, 6000);
    expect(restored.buildings.hasCompleted(BlueprintId.WELL)).toBe(true);
  });

  it('주민과 집 연결이 보존된다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.COTTAGE);
    game.buildAt({ x: 12, y: 12 });
    advance(game, 12_000);
    expect(game.population.count).toBe(1);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.population.count).toBe(1);
    expect(restored.population.all[0]!.homeBuildingId).toBe(game.population.all[0]!.homeBuildingId);
    expect(restored.population.all[0]!.position).toEqual(game.population.all[0]!.position);
  });

  it('되살린 주민도 정원을 넘겨 늘어나지 않는다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.COTTAGE);
    game.buildAt({ x: 12, y: 12 });
    advance(game, 12_000);

    const restored = Game.fromSave(game.toSave())!;
    advance(restored, 60_000);

    expect(restored.population.count).toBe(1);
  });

  it('요청과 완료 수가 보존된다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.COTTAGE);
    game.buildAt({ x: 12, y: 12 });
    advance(game, 40_000);
    expect(game.requests.requests.length).toBeGreaterThan(0);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.requests.requests.map((request) => request.id)).toEqual(
      game.requests.requests.map((request) => request.id),
    );
    expect(restored.completedRequestCount).toBe(game.completedRequestCount);
  });

  it('마을 레벨과 경험치, 점수가 보존된다', () => {
    const game = makeGame();
    game.setVillageLevel(3);
    game.selectBlueprint(BlueprintId.COTTAGE);
    game.buildAt({ x: 12, y: 12 });
    advance(game, 12_000);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.villageLevel).toBe(game.villageLevel);
    expect(restored.villageScore).toBe(game.villageScore);
    expect(restored.availableBlueprints.length).toBe(game.availableBlueprints.length);
  });

  it('자원 노드의 내구도와 리스폰 시간이 보존된다', () => {
    const terrain = generateTerrain(20, 20, { seed: 3 });
    const field = new ResourceField(terrain, { seed: 3 });
    const game = new Game(terrain, field);

    // 노드 하나를 때려 손상시킨다.
    const node = field.nearest(game.player.position)!;
    node.durability = 1;
    node.respawnRemainingMs = 0;

    const restored = Game.fromSave(game.toSave())!;
    const restoredNode = restored.resources.nodeAt(node.x, node.y)!;

    expect(restoredNode.kind).toBe(node.kind);
    expect(restoredNode.durability).toBe(1);
    expect(restored.resources.nodeCount).toBe(field.nodeCount);
  });

  it('시뮬레이션 시각이 이어진다', () => {
    const game = makeGame();
    advance(game, 5000);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.elapsedMs).toBeCloseTo(game.elapsedMs, 3);
  });

  it('저장 → 로드 → 계속 플레이가 정상이다', () => {
    const game = makeGame();
    const restored = Game.fromSave(game.toSave())!;

    restored.selectBlueprint(BlueprintId.WELL);
    expect(restored.buildAt({ x: 15, y: 15 }).ok).toBe(true);
    advance(restored, 6000);

    expect(restored.buildings.hasCompleted(BlueprintId.WELL)).toBe(true);
  });

  it('되살린 뒤에도 창고 입출고가 동작한다', () => {
    const game = makeGame();
    const restored = Game.fromSave(game.toSave())!;

    expect(restored.nearStorage).toBe(true);
    restored.inventory.add(ItemType.WOOD, 3);
    const moved = restored.depositAll();

    expect(moved.get(ItemType.WOOD)).toBe(3);
  });

  it('두 번 왕복해도 같은 상태다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.COTTAGE);
    game.buildAt({ x: 12, y: 12 });
    advance(game, 12_000);

    const once = Game.fromSave(game.toSave())!;
    const twice = Game.fromSave(once.toSave())!;

    expect(twice.villageScore).toBe(game.villageScore);
    expect(twice.population.count).toBe(game.population.count);
    expect(twice.buildings.completedCount).toBe(game.buildings.completedCount);
  });
});

describe('Game 저장 거절', () => {
  it('형식이 아닌 값은 거절한다', () => {
    expect(Game.fromSave(null)).toBeNull();
    expect(Game.fromSave({})).toBeNull();
    expect(Game.fromSave('저장')).toBeNull();
  });

  it('지형이 손상되면 거절한다', () => {
    const data = makeGame().toSave();
    data.maps[0]!.terrain.heights = 'AAAA';

    expect(Game.fromSave(data)).toBeNull();
  });

  it('창고가 하나도 없으면 거절한다 — 저장할 곳이 없으면 진행이 막힌다', () => {
    const data = makeGame().toSave();
    data.buildings = [];

    expect(Game.fromSave(data)).toBeNull();
  });

  it('없어진 블루프린트를 가리키는 건물만 버린다', () => {
    const game = makeGame();
    game.selectBlueprint(BlueprintId.WELL);
    game.buildAt({ x: 14, y: 14 });
    advance(game, 6000);

    const data = game.toSave();
    data.buildings.push({
      id: 999,
      blueprintId: '사라진설계도' as BlueprintId,
      x: 5,
      y: 5,
      buildRemainingMs: 0,
    });

    const restored = Game.fromSave(data)!;

    expect(restored).not.toBeNull();
    expect(restored.isOccupied({ x: 5, y: 5 })).toBe(false);
    expect(restored.buildings.hasCompleted(BlueprintId.WELL)).toBe(true);
  });

  it('망가진 요청 항목만 버린다', () => {
    const game = makeGame();
    const data = game.toSave();
    data.requests.push({ kind: 'deliver', id: 1, npcId: 1, item: ItemType.WOOD, amount: 3 });
    data.requests.push({ kind: 'deliver', id: 2, npcId: 1, item: ItemType.WOOD, amount: -5 });

    const restored = Game.fromSave(data)!;

    expect(restored.requests.requests).toHaveLength(1);
  });
});

describe('Game 안내 진행도 저장', () => {
  it('본 힌트가 보존돼 다시 뜨지 않는다', () => {
    const game = makeGame();
    game.inventory.add(ItemType.WOOD, 3);

    // 힌트가 한 번 뜰 때까지 진행한다.
    advance(game, 4000);
    const seen = game.guidance.seenHints;
    expect(seen.length).toBeGreaterThan(0);

    const restored = Game.fromSave(game.toSave())!;

    expect(restored.guidance.seenHints).toEqual(seen);
  });

  it('예치 경험이 보존된다', () => {
    const game = makeGame();
    game.inventory.add(ItemType.WOOD, 3);
    game.depositAll();
    expect(game.guidance.hasDeposited).toBe(true);

    expect(Game.fromSave(game.toSave())!.guidance.hasDeposited).toBe(true);
  });

  it('안내 진행도가 없는 예전 저장도 읽힌다 — 선택적 필드다', () => {
    const data = makeGame().toSave();
    delete data.seenHints;
    delete data.hasDeposited;

    const restored = Game.fromSave(data);

    expect(restored).not.toBeNull();
    expect(restored!.guidance.seenHints).toEqual([]);
  });
});
