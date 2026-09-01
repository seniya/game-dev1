import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { Terrain } from '../src/core/Terrain';
import { ToolTier } from '../src/core/tools';
import { ItemType } from '../src/core/items';
import { NodeKind, nodeDefinition } from '../src/core/resourceNodes';
import { Game } from '../src/sim/Game';
import { MOVE_DURATION_MS, SWING_DURATION_MS } from '../src/sim/Player';
import { ResourceField } from '../src/sim/ResourceField';

/**
 * 모든 열이 같은 높이인 지형으로 게임을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 * @param height 각 열의 블록 수.
 * @param type 채울 블록 타입.
 */
function makeGame(size = 7, height = 3, type: BlockType = BlockType.DIRT): Game {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, height, type);
  }
  // 지형 조작 테스트에서는 자원 노드가 끼어들지 않도록 밀도를 0으로 둔다.
  return new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
}

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

describe('Game 시작 상태', () => {
  it('플레이어를 맵 중앙의 설 수 있는 칸에 세운다', () => {
    const game = makeGame(7, 2);

    expect(game.terrain.columnHeight(game.player.position.x, game.player.position.y)).toBeGreaterThanOrEqual(1);
  });

  it('중앙이 뚫려 있으면 근처의 설 수 있는 칸을 찾는다', () => {
    const terrain = new Terrain(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        // 중앙만 비워 둔다.
        if (x === 2 && y === 2) continue;
        terrain.fillColumn(x, y, 2, BlockType.DIRT);
      }
    }

    const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
    expect(game.player.position).not.toEqual({ x: 2, y: 2 });
    expect(terrain.columnHeight(game.player.position.x, game.player.position.y)).toBeGreaterThanOrEqual(1);
  });

  it('보유 자원 없이 시작한다', () => {
    expect(makeGame().stash.total).toBe(0);
  });
});

describe('Game 파기', () => {
  it('인접 칸을 파면 블록을 얻고 지형이 낮아진다', () => {
    const game = makeGame(7, 3);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };
    const before = game.terrain.columnHeight(target.x, target.y);

    const result = game.digAt(target);

    expect(result).toEqual({
      ok: true,
      block: BlockType.DIRT,
      gained: { item: ItemType.DIRT, amount: 1 },
    });
    expect(game.terrain.columnHeight(target.x, target.y)).toBe(before - 1);
    expect(game.stash.count(ItemType.DIRT)).toBe(1);
  });

  it('인접하지 않은 칸은 팔 수 없다', () => {
    const game = makeGame(7, 3);
    const far = { x: game.player.position.x + 3, y: game.player.position.y };

    expect(game.digAt(far)).toEqual({ ok: false, reason: 'notAdjacent' });
  });

  it('자기가 선 칸은 팔 수 없다', () => {
    const game = makeGame(7, 3);

    expect(game.digAt(game.player.position)).toEqual({ ok: false, reason: 'notAdjacent' });
  });

  it('도구가 맞지 않으면 거절한다 — 흙은 삽, 돌은 곡괭이', () => {
    const game = makeGame(7, 3, BlockType.STONE);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };

    // 기본 선택은 삽이므로 돌을 팔 수 없다.
    expect(game.digAt(target)).toEqual({ ok: false, reason: 'wrongTool' });

    game.player.selectTool(1);
    expect(game.digAt(target)).toEqual({
      ok: true,
      block: BlockType.STONE,
      gained: { item: ItemType.STONE, amount: 1 },
    });
  });

  it('철광석은 중급 이상 곡괭이를 요구한다', () => {
    const terrain = new Terrain(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) terrain.fillColumn(x, y, 2, BlockType.IRON_ORE);
    }
    const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
    const target = { x: game.player.position.x + 1, y: game.player.position.y };

    game.player.selectTool(1);
    expect(game.digAt(target)).toEqual({ ok: false, reason: 'wrongTool' });

    game.player.upgradeTool(game.player.tool.kind, ToolTier.MID);
    expect(game.digAt(target)).toEqual({
      ok: true,
      block: BlockType.IRON_ORE,
      gained: { item: ItemType.IRON_ORE, amount: 1 },
    });
  });

  it('철광석은 자원으로 손에 남되 지형에는 되놓을 수 없다', () => {
    const terrain = new Terrain(5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) terrain.fillColumn(x, y, 2, BlockType.IRON_ORE);
    }
    const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
    game.player.selectTool(1);
    game.player.upgradeTool(game.player.tool.kind, ToolTier.MID);

    game.digAt({ x: game.player.position.x + 1, y: game.player.position.y });

    // 철광석은 지형에 되놓을 수 없지만 자원으로는 손에 남는다.
    expect(game.stash.count(ItemType.IRON_ORE)).toBe(1);
  });

  it('빈 칸은 팔 수 없다', () => {
    const game = makeGame(7, 1);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };

    game.digAt(target);
    advance(game, SWING_DURATION_MS);

    expect(game.digAt(target)).toEqual({ ok: false, reason: 'empty' });
  });

  it('휘두르는 중에는 다시 팔 수 없고, 끝나면 다시 팔 수 있다', () => {
    const game = makeGame(7, 4);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };

    expect(game.digAt(target).ok).toBe(true);
    expect(game.digAt(target)).toEqual({ ok: false, reason: 'busy' });

    advance(game, SWING_DURATION_MS);
    expect(game.digAt(target).ok).toBe(true);
  });

  it('이동 중에는 팔 수 없다', () => {
    const game = makeGame(7, 3);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };

    game.movePlayer(0, 1);
    expect(game.digAt(target)).toEqual({ ok: false, reason: 'busy' });
  });
});

describe('Game 쌓기', () => {
  it('보유한 블록을 인접 칸에 쌓는다', () => {
    const game = makeGame(7, 2);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };

    game.digAt(target);
    advance(game, SWING_DURATION_MS);
    const height = game.terrain.columnHeight(target.x, target.y);

    expect(game.placeAt(target)).toEqual({ ok: true, block: BlockType.DIRT });
    expect(game.terrain.columnHeight(target.x, target.y)).toBe(height + 1);
    expect(game.stash.count(ItemType.DIRT)).toBe(0);
  });

  it('가진 블록이 없으면 거절한다', () => {
    const game = makeGame(7, 2);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };

    expect(game.placeAt(target)).toEqual({ ok: false, reason: 'noMaterial' });
  });

  it('높이 상한에 걸리면 거절하고 자재를 소모하지 않는다', () => {
    const game = makeGame(7, 5);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };
    const other = { x: game.player.position.x - 1, y: game.player.position.y };

    // 다른 칸을 파서 자재를 확보한다.
    game.digAt(other);
    advance(game, SWING_DURATION_MS);
    expect(game.stash.count(ItemType.DIRT)).toBe(1);

    expect(game.placeAt(target)).toEqual({ ok: false, reason: 'blocked' });
    expect(game.stash.count(ItemType.DIRT)).toBe(1);
  });

  it('인접하지 않은 칸에는 쌓을 수 없다', () => {
    const game = makeGame(7, 2);
    const other = { x: game.player.position.x - 1, y: game.player.position.y };
    game.digAt(other);
    advance(game, SWING_DURATION_MS);

    const far = { x: game.player.position.x + 3, y: game.player.position.y };
    expect(game.placeAt(far)).toEqual({ ok: false, reason: 'notAdjacent' });
  });
});

describe('Game 오브젝트 목록', () => {
  it('플레이어를 오브젝트로 내보낸다', () => {
    const game = makeGame(7, 2);
    const entities = game.entities();

    expect(entities).toHaveLength(1);
    expect(entities[0]!.kind).toBe('player');
  });

  it('이동 중에는 플레이어 위치가 소수가 된다', () => {
    const game = makeGame(7, 2);
    game.movePlayer(1, 0);
    advance(game, MOVE_DURATION_MS / 2);

    const player = game.entities()[0]!;
    expect(Number.isInteger(player.x)).toBe(false);
  });
});

describe('Game 채집', () => {
  /**
   * 플레이어 옆에 노드 하나만 있는 게임을 만든다.
   *
   * @param kind 심을 노드 종류.
   */
  function gameWithNode(kind: NodeKind) {
    const terrain = new Terrain(7, 7);
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
    }
    const field = new ResourceField(terrain, { densityScale: 0 });
    const game = new Game(terrain, field);
    const target = { x: game.player.position.x + 1, y: game.player.position.y };
    field.addNode(target.x, target.y, kind);

    return { game, field, target };
  }

  it('나무는 도끼로만 벤다', () => {
    const { game, target } = gameWithNode(NodeKind.TREE);

    // 기본 선택은 삽.
    expect(game.actAt(target)).toEqual({ ok: false, reason: 'wrongTool' });

    game.player.selectTool(2);
    const result = game.actAt(target);
    expect(result.ok).toBe(true);
  });

  it('부술 때까지 때리면 목재를 얻는다', () => {
    const { game, target } = gameWithNode(NodeKind.TREE);
    game.player.selectTool(2);

    for (let i = 0; i < 6; i += 1) {
      game.actAt(target);
      advance(game, SWING_DURATION_MS);
    }

    expect(game.stash.count(ItemType.WOOD)).toBe(nodeDefinition(NodeKind.TREE).dropAmount);
  });

  it('노드가 있는 칸은 지형이 아니라 노드를 대상으로 한다', () => {
    const { game, target } = gameWithNode(NodeKind.TREE);
    const height = game.terrain.columnHeight(target.x, target.y);

    game.player.selectTool(2);
    game.actAt(target);

    // 지형 높이는 그대로여야 한다.
    expect(game.terrain.columnHeight(target.x, target.y)).toBe(height);
  });

  it('노드를 부순 뒤에는 같은 칸에서 지형을 팔 수 있다', () => {
    const { game, target } = gameWithNode(NodeKind.TREE);
    game.player.selectTool(2);
    for (let i = 0; i < 6; i += 1) {
      game.actAt(target);
      advance(game, SWING_DURATION_MS);
    }

    game.player.selectTool(0);
    const height = game.terrain.columnHeight(target.x, target.y);
    expect(game.actAt(target).ok).toBe(true);
    expect(game.terrain.columnHeight(target.x, target.y)).toBe(height - 1);
  });

  it('살아 있는 노드가 있는 칸에는 블록을 쌓을 수 없다', () => {
    const { game, target } = gameWithNode(NodeKind.TREE);
    const other = { x: game.player.position.x - 1, y: game.player.position.y };

    game.digAt(other);
    advance(game, SWING_DURATION_MS);
    expect(game.stash.count(ItemType.DIRT)).toBe(1);

    expect(game.placeAt(target)).toEqual({ ok: false, reason: 'blocked' });
    expect(game.stash.count(ItemType.DIRT)).toBe(1);
  });

  it('인접하지 않은 노드는 채집할 수 없다', () => {
    const { game, field } = gameWithNode(NodeKind.TREE);
    const far = { x: game.player.position.x + 3, y: game.player.position.y };
    field.addNode(far.x, far.y, NodeKind.TREE);
    game.player.selectTool(2);

    expect(game.actAt(far)).toEqual({ ok: false, reason: 'notAdjacent' });
  });

  it('노드를 오브젝트 목록에 내보내고, 부서지면 사라진다', () => {
    const { game, target } = gameWithNode(NodeKind.TREE);

    expect(game.entities().filter((entity) => entity.kind === 'tree')).toHaveLength(1);

    game.player.selectTool(2);
    for (let i = 0; i < 6; i += 1) {
      game.actAt(target);
      advance(game, SWING_DURATION_MS);
    }

    expect(game.entities().filter((entity) => entity.kind === 'tree')).toHaveLength(0);
  });

  it('리스폰 시간이 지나면 다시 나타난다', () => {
    const { game, target } = gameWithNode(NodeKind.TREE);
    game.player.selectTool(2);
    for (let i = 0; i < 6; i += 1) {
      game.actAt(target);
      advance(game, SWING_DURATION_MS);
    }
    expect(game.entities().filter((entity) => entity.kind === 'tree')).toHaveLength(0);

    advance(game, nodeDefinition(NodeKind.TREE).respawnMs + 100);

    expect(game.entities().filter((entity) => entity.kind === 'tree')).toHaveLength(1);
  });

  it('광맥은 oreVein 오브젝트로 내보낸다', () => {
    const { game } = gameWithNode(NodeKind.IRON_VEIN);

    expect(game.entities().filter((entity) => entity.kind === 'oreVein')).toHaveLength(1);
  });

  it('커서 칸 설명에 노드 이름과 남은 비율을 담는다', () => {
    const { game, target } = gameWithNode(NodeKind.STONE_ROCK);

    expect(game.describeTile(target)).toBe('돌 광맥 100%');

    game.player.selectTool(1);
    game.actAt(target);

    expect(game.describeTile(target)).toMatch(/^돌 광맥 \d+%$/);
    expect(game.describeTile(target)).not.toBe('돌 광맥 100%');
  });

  it('노드가 없는 칸은 설명이 없다', () => {
    const { game } = gameWithNode(NodeKind.TREE);

    expect(game.describeTile(game.player.position)).toBeNull();
  });
});
