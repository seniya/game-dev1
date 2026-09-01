import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { ItemType } from '../src/core/items';
import { NodeKind, nodeDefinition } from '../src/core/resourceNodes';
import { Terrain } from '../src/core/Terrain';
import { ToolKind, ToolTier, type Tool } from '../src/core/tools';
import { FOREST_RADIUS, MEADOW_RADIUS, Zone, zoneAt } from '../src/core/zones';
import { ResourceField } from '../src/sim/ResourceField';

/**
 * 지정 크기의 평지를 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function flat(size: number): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
  }
  return terrain;
}

/** 도구를 만든다. */
const tool = (kind: ToolKind, tier: ToolTier = ToolTier.BASIC): Tool => ({ kind, tier });

/**
 * 노드가 하나만 있는 필드를 만든다. 밀도 0으로 배치를 비우고 직접 심는다.
 *
 * @param kind 심을 노드 종류.
 * @param size 맵 크기.
 */
function fieldWithOneNode(kind: NodeKind, size = 6) {
  const terrain = flat(size);
  const field = new ResourceField(terrain, { densityScale: 0 });
  field.addNode(2, 2, kind);

  return { terrain, field };
}

describe('ResourceField 배치', () => {
  it('같은 시드는 같은 배치를 만든다', () => {
    const terrain = flat(30);
    const a = new ResourceField(terrain, { seed: 9 });
    const b = new ResourceField(terrain, { seed: 9 });

    expect(a.nodeCount).toBe(b.nodeCount);
    for (const node of a.all) {
      expect(b.nodeAt(node.x, node.y)?.kind).toBe(node.kind);
    }
  });

  it('시드가 다르면 배치가 달라진다', () => {
    const terrain = flat(30);
    const a = new ResourceField(terrain, { seed: 1 });
    const b = new ResourceField(terrain, { seed: 2 });

    let differences = 0;
    for (const node of a.all) {
      if (b.nodeAt(node.x, node.y)?.kind !== node.kind) differences += 1;
    }

    expect(differences).toBeGreaterThan(0);
  });

  it('밀도 0이면 노드를 배치하지 않는다', () => {
    const terrain = flat(20);

    expect(new ResourceField(terrain, { densityScale: 0 }).nodeCount).toBe(0);
  });

  it('설 수 없는 칸에는 노드를 놓지 않는다', () => {
    const terrain = flat(20);
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        // 절반을 바닥까지 파낸다.
        if ((x + y) % 2 === 0) {
          terrain.dig(x, y);
          terrain.dig(x, y);
        }
      }
    }

    const field = new ResourceField(terrain, { seed: 3 });
    for (const node of field.all) {
      expect(terrain.columnHeight(node.x, node.y)).toBeGreaterThanOrEqual(1);
    }
  });

  it('철광석 광맥은 산악에만 나온다 — 기획서 5.2의 구역 서열', () => {
    const terrain = flat(40);
    const field = new ResourceField(terrain, { seed: 5 });

    let ironCount = 0;
    for (const node of field.all) {
      if (node.kind !== NodeKind.IRON_VEIN) continue;
      ironCount += 1;
      expect(zoneAt(terrain, node.x, node.y)).toBe(Zone.MOUNTAIN);
    }

    expect(ironCount).toBeGreaterThan(0);
  });

  it('초원에는 나무만 나온다', () => {
    const terrain = flat(40);
    const field = new ResourceField(terrain, { seed: 5 });

    for (const node of field.all) {
      if (zoneAt(terrain, node.x, node.y) !== Zone.MEADOW) continue;
      expect(node.kind).toBe(NodeKind.TREE);
    }
  });

  it('숲이 초원보다 나무가 빽빽하다', () => {
    const terrain = flat(40);
    const field = new ResourceField(terrain, { seed: 5 });

    let meadowTiles = 0;
    let meadowTrees = 0;
    let forestTiles = 0;
    let forestTrees = 0;

    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < 40; x += 1) {
        const zone = zoneAt(terrain, x, y);
        const isTree = field.nodeAt(x, y)?.kind === NodeKind.TREE;
        if (zone === Zone.MEADOW) {
          meadowTiles += 1;
          if (isTree) meadowTrees += 1;
        } else if (zone === Zone.FOREST) {
          forestTiles += 1;
          if (isTree) forestTrees += 1;
        }
      }
    }

    expect(forestTrees / forestTiles).toBeGreaterThan(meadowTrees / meadowTiles);
  });

  it('구역 경계 상수가 서로 어긋나지 않는다', () => {
    expect(MEADOW_RADIUS).toBeLessThan(FOREST_RADIUS);
  });
});

describe('ResourceField.addNode', () => {
  it('설 수 있는 빈 칸에 심는다', () => {
    const terrain = flat(6);
    const field = new ResourceField(terrain, { densityScale: 0 });

    expect(field.addNode(1, 1, NodeKind.TREE)).toBe(true);
    expect(field.nodeAt(1, 1)?.kind).toBe(NodeKind.TREE);
  });

  it('이미 노드가 있는 칸에는 심지 않는다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);

    expect(field.addNode(2, 2, NodeKind.STONE_ROCK)).toBe(false);
    expect(field.nodeAt(2, 2)?.kind).toBe(NodeKind.TREE);
  });

  it('뚫린 칸이나 맵 밖에는 심지 않는다', () => {
    const terrain = flat(6);
    terrain.dig(3, 3);
    terrain.dig(3, 3);
    const field = new ResourceField(terrain, { densityScale: 0 });

    expect(field.addNode(3, 3, NodeKind.TREE)).toBe(false);
    expect(field.addNode(-1, 0, NodeKind.TREE)).toBe(false);
  });
});

describe('ResourceField 채집', () => {
  it('노드가 없는 칸은 채집할 수 없다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);

    expect(field.harvest(0, 0, tool(ToolKind.AXE))).toEqual({ ok: false, reason: 'noNode' });
  });

  it('도구가 맞지 않으면 거절한다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);

    expect(field.harvest(2, 2, tool(ToolKind.PICKAXE))).toEqual({ ok: false, reason: 'wrongTool' });
  });

  it('철광석 광맥은 중급 이상 곡괭이를 요구한다', () => {
    const { field } = fieldWithOneNode(NodeKind.IRON_VEIN);

    expect(field.harvest(2, 2, tool(ToolKind.PICKAXE, ToolTier.BASIC))).toEqual({
      ok: false,
      reason: 'wrongTool',
    });
    expect(field.harvest(2, 2, tool(ToolKind.PICKAXE, ToolTier.MID)).ok).toBe(true);
  });

  it('여러 번 때려야 부서지고, 부서질 때 자원을 드롭한다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);
    const definition = nodeDefinition(NodeKind.TREE);

    let destroyed = false;
    let hits = 0;
    let drop: { item: ItemType; amount: number } | undefined;

    while (!destroyed && hits < 20) {
      const result = field.harvest(2, 2, tool(ToolKind.AXE));
      expect(result.ok).toBe(true);
      hits += 1;
      if (result.ok && result.destroyed) {
        destroyed = true;
        drop = result.drop;
      }
    }

    expect(hits).toBe(definition.durability);
    expect(drop).toEqual({ item: ItemType.WOOD, amount: definition.dropAmount });
  });

  it('상위 등급 도구는 더 적은 타격으로 부순다 — 기획서 5.2의 채집 속도', () => {
    const basic = fieldWithOneNode(NodeKind.STONE_ROCK);
    const high = fieldWithOneNode(NodeKind.STONE_ROCK);

    /**
     * 노드가 부서질 때까지 때린 횟수를 센다.
     *
     * @param field 대상 필드.
     * @param tier 도구 등급.
     */
    const hitsToBreak = (field: ResourceField, tier: ToolTier): number => {
      let hits = 0;
      for (;;) {
        const result = field.harvest(2, 2, tool(ToolKind.PICKAXE, tier));
        if (!result.ok) break;
        hits += 1;
        if (result.destroyed) break;
      }
      return hits;
    };

    const basicHits = hitsToBreak(basic.field, ToolTier.BASIC);
    const highHits = hitsToBreak(high.field, ToolTier.HIGH);

    expect(highHits).toBeLessThan(basicHits);
  });

  it('부서진 노드는 다시 채집할 수 없다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);
    for (let i = 0; i < 5; i += 1) field.harvest(2, 2, tool(ToolKind.AXE));

    expect(field.harvest(2, 2, tool(ToolKind.AXE))).toEqual({ ok: false, reason: 'depleted' });
  });

  it('부서진 노드는 길을 막지 않는다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);

    expect(field.isBlocked(2, 2)).toBe(true);
    for (let i = 0; i < 5; i += 1) field.harvest(2, 2, tool(ToolKind.AXE));
    expect(field.isBlocked(2, 2)).toBe(false);
  });
});

describe('ResourceField 리스폰', () => {
  it('정해진 시간이 지나면 다시 자란다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);
    const definition = nodeDefinition(NodeKind.TREE);
    for (let i = 0; i < 5; i += 1) field.harvest(2, 2, tool(ToolKind.AXE));

    expect(field.isBlocked(2, 2)).toBe(false);

    field.update(definition.respawnMs - 1);
    expect(field.isBlocked(2, 2)).toBe(false);

    expect(field.update(2)).toBe(1);
    expect(field.isBlocked(2, 2)).toBe(true);
    expect(field.nodeAt(2, 2)!.durability).toBe(definition.durability);
  });

  it('나무가 광맥보다 빨리 회복된다 — 상위 자원이 귀해야 한다', () => {
    expect(nodeDefinition(NodeKind.TREE).respawnMs).toBeLessThan(
      nodeDefinition(NodeKind.STONE_ROCK).respawnMs,
    );
    expect(nodeDefinition(NodeKind.STONE_ROCK).respawnMs).toBeLessThan(
      nodeDefinition(NodeKind.IRON_VEIN).respawnMs,
    );
  });

  it('살아 있는 노드는 update로 바뀌지 않는다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);

    expect(field.update(100_000)).toBe(0);
    expect(field.nodeAt(2, 2)!.durability).toBe(nodeDefinition(NodeKind.TREE).durability);
  });

  it('다시 자라면 손상도가 0으로 돌아간다', () => {
    const { field } = fieldWithOneNode(NodeKind.STONE_ROCK);
    field.harvest(2, 2, tool(ToolKind.PICKAXE));
    expect(field.damageRatio(field.nodeAt(2, 2)!)).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) field.harvest(2, 2, tool(ToolKind.PICKAXE));
    field.update(nodeDefinition(NodeKind.STONE_ROCK).respawnMs);

    expect(field.damageRatio(field.nodeAt(2, 2)!)).toBe(0);
  });
});

describe('ResourceField 조회', () => {
  it('가장 가까운 살아 있는 노드를 찾는다', () => {
    const terrain = flat(30);
    const field = new ResourceField(terrain, { seed: 4 });

    const nearest = field.nearest({ x: 15, y: 15 });
    expect(nearest).toBeDefined();
    expect(nearest!.durability).toBeGreaterThan(0);
  });

  it('종류를 지정해 찾을 수 있다', () => {
    const terrain = flat(40);
    const field = new ResourceField(terrain, { seed: 4 });

    const iron = field.nearest({ x: 20, y: 20 }, NodeKind.IRON_VEIN);
    expect(iron?.kind).toBe(NodeKind.IRON_VEIN);
  });

  it('부서진 노드는 찾지 않는다', () => {
    const { field } = fieldWithOneNode(NodeKind.TREE);
    for (let i = 0; i < 5; i += 1) field.harvest(2, 2, tool(ToolKind.AXE));

    expect(field.nearest({ x: 0, y: 0 })).toBeUndefined();
  });
});
