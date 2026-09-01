import { describe, expect, it } from 'vitest';
import { BlueprintId, type Blueprint } from '../src/core/blueprints';
import { ItemType } from '../src/core/items';
import { canWalk, walkableNeighbors, type TilePos } from '../src/core/movement';
import { generateTerrain } from '../src/core/terrainGen';
import { MAX_VILLAGE_LEVEL } from '../src/core/village';
import { Game } from '../src/sim/Game';
import { MOVE_DURATION_MS, SWING_DURATION_MS } from '../src/sim/Player';
import { ResourceField } from '../src/sim/ResourceField';

/** 시뮬레이션 스텝 길이(ms). 게임 루프와 같은 60Hz. */
const STEP_MS = 1000 / 60;

/** 이 시간(게임 시간, ms) 안에 목표 레벨에 닿아야 한다. */
const TIME_BUDGET_MS = 20 * 60 * 1000;

/** 무한 루프 방지용 최대 행동 수. */
const MAX_ACTIONS = 20_000;

/**
 * 봇이 게임을 플레이한 결과.
 */
interface PlaythroughResult {
  /** 도달한 마을 레벨. */
  level: number;
  /** 소비한 게임 시간(ms). */
  elapsedMs: number;
  /** 지은 건물 수. */
  buildings: number;
  /** 주민 수. */
  residents: number;
  /** 완료한 요청 수. */
  requests: number;
  /** 부순 자원 노드 수. */
  harvested: number;
  /** 걸은 칸 수. */
  steps: number;
}

/**
 * 아주 단순한 자동 플레이 봇.
 *
 * 사람이 하듯 "요청을 내고, 지을 수 있으면 짓고, 아니면 가장 가까운 자원을 캐고,
 * 손이 차면 창고에 넣는다"를 반복한다. 최적 플레이가 아니라 **막히지 않는지**와
 * **얼마나 걸리는지**를 재는 것이 목적이다 — Phase 9 완료 기준이 "처음 실행해서
 * 레벨 5까지 막힘 없이 플레이된다"이기 때문이다.
 *
 * @param seed 지형·자원 시드.
 * @param goalLevel 목표 레벨.
 * @returns 플레이 결과.
 */
function playToLevel(seed: number, goalLevel = MAX_VILLAGE_LEVEL): PlaythroughResult {
  const terrain = generateTerrain(32, 32, { seed });
  const resources = new ResourceField(terrain, { seed });
  const game = new Game(terrain, resources);

  let elapsedMs = 0;
  let harvested = 0;
  let steps = 0;

  /**
   * 시뮬레이션을 지정 시간만큼 진행한다.
   *
   * @param totalMs 진행할 시간(ms).
   */
  const advance = (totalMs: number): void => {
    for (let done = 0; done < totalMs; done += STEP_MS) {
      game.update(STEP_MS);
      elapsedMs += STEP_MS;
    }
  };

  /** 플레이어가 행동을 받을 수 있을 때까지 기다린다. */
  const waitIdle = (): void => {
    let guard = 0;
    while (!game.player.idle && guard < 200) {
      advance(STEP_MS);
      guard += 1;
    }
  };

  /**
   * 목표 칸에 인접한 자리까지 한 걸음 간다.
   *
   * 너비 우선 탐색으로 경로를 찾고 첫 걸음만 밟는다. 경로가 없으면 false.
   *
   * @param goal 목표 칸.
   * @returns 한 걸음 갔으면 true. 이미 인접하거나 길이 없으면 false.
   */
  const stepTowardAdjacent = (goal: TilePos): boolean => {
    const start = game.player.position;
    const startKey = `${start.x},${start.y}`;

    const queue: TilePos[] = [start];
    const cameFrom = new Map<string, string | null>([[startKey, null]]);
    let found: TilePos | null = null;

    while (queue.length > 0 && !found) {
      const current = queue.shift()!;
      if (Math.abs(current.x - goal.x) + Math.abs(current.y - goal.y) === 1) {
        found = current;
        break;
      }

      for (const next of walkableNeighbors(terrain, current)) {
        const key = `${next.x},${next.y}`;
        if (cameFrom.has(key)) continue;
        cameFrom.set(key, `${current.x},${current.y}`);
        queue.push(next);
      }
    }

    if (!found) return false;

    // 목표 직전까지의 경로를 거슬러 첫 걸음을 찾는다.
    let cursor = `${found.x},${found.y}`;
    let previous = cameFrom.get(cursor) ?? null;
    if (previous === null) return false;

    while (previous !== startKey) {
      cursor = previous;
      previous = cameFrom.get(cursor) ?? null;
      if (previous === null) return false;
    }

    const [nx, ny] = cursor.split(',').map(Number) as [number, number];
    if (!canWalk(terrain, start, { x: nx, y: ny })) return false;

    waitIdle();
    if (!game.movePlayer(nx - start.x, ny - start.y)) return false;

    advance(MOVE_DURATION_MS);
    steps += 1;

    return true;
  };

  /**
   * 지금 지을 수 있는 블루프린트를 고른다.
   *
   * 사람이 하듯 판단한다: 주민이 점수에 가장 크게 기여하므로 집을 우선하고,
   * 시설은 **종류당 한 채만** 짓는다(같은 시설을 여러 채 지어도 점수가 오르지
   * 않으므로 부지만 낭비한다).
   *
   * @returns 블루프린트. 없으면 null.
   */
  const pickAffordable = (): Blueprint | null => {
    const order = [BlueprintId.MANOR, BlueprintId.COTTAGE, BlueprintId.WELL, BlueprintId.WORKBENCH];

    for (const id of order) {
      const blueprint = game.availableBlueprints.find((candidate) => candidate.id === id);
      if (!blueprint) continue;
      if (game.missingMaterials(blueprint).length > 0) continue;
      // 집이 아닌 시설은 이미 있으면 다시 짓지 않는다.
      if (blueprint.housing === 0 && game.buildings.hasCompleted(blueprint.id)) continue;

      return blueprint;
    }

    return null;
  };

  /**
   * 블루프린트를 놓을 자리를 찾는다. 마을 중심 근처를 안쪽부터 훑는다.
   *
   * @param blueprint 블루프린트.
   * @returns 놓을 좌표. 없으면 null.
   */
  const findSpot = (blueprint: Blueprint): TilePos | null => {
    const center = { x: 15, y: 15 };

    for (let radius = 1; radius <= 10; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

          const spot = { x: center.x + dx, y: center.y + dy };
          if (!game.buildings.canPlace(blueprint, spot.x, spot.y, resources).ok) continue;

          // 플레이어를 건물 안에 갇히게 하지 않는다.
          const player = game.player.position;
          const covers =
            player.x >= spot.x &&
            player.x < spot.x + blueprint.width &&
            player.y >= spot.y &&
            player.y < spot.y + blueprint.depth;
          if (covers) continue;

          return spot;
        }
      }
    }

    return null;
  };

  /**
   * 채집할 노드를 고른다. 필요한 자원을 우선한다.
   *
   * @returns 노드 좌표. 없으면 null.
   */
  const pickNode = (): TilePos | null => {
    const player = game.player.position;
    const needIron = game.totalHeld(ItemType.IRON_ORE) < 3 && game.villageLevel >= 3;

    let best: TilePos | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const node of resources.all) {
      if (node.durability <= 0) continue;

      const distance = Math.abs(node.x - player.x) + Math.abs(node.y - player.y);
      // 필요한 자원에 가중치를 줘 가까운 것만 캐다 막히는 상황을 피한다.
      const priority = needIron && node.kind === 'ironVein' ? 0.4 : 1;
      const cost = distance * priority;

      if (cost < bestCost) {
        bestCost = cost;
        best = { x: node.x, y: node.y };
      }
    }

    return best;
  };

  /**
   * 노드 종류에 맞는 도구를 든다.
   *
   * @param target 노드 좌표.
   */
  const equipFor = (target: TilePos): void => {
    const node = resources.nodeAt(target.x, target.y);
    if (!node) return;

    game.player.selectTool(node.kind === 'tree' ? 2 : 1);
  };

  for (let action = 0; action < MAX_ACTIONS; action += 1) {
    if (game.villageLevel >= goalLevel) break;
    if (elapsedMs >= TIME_BUDGET_MS) break;

    // 1. 낼 수 있는 요청은 즉시 낸다. 점수 효율이 가장 좋다.
    if (game.fulfillRequest()) continue;

    // 2. 지을 수 있으면 짓는다.
    const blueprint = pickAffordable();
    if (blueprint) {
      const spot = findSpot(blueprint);
      if (spot) {
        game.selectBlueprint(blueprint.id);
        waitIdle();
        const result = game.buildAt(spot);
        game.selectBlueprint(null);
        if (result.ok) {
          advance(200);
          continue;
        }
      }
    }

    // 3. 인벤토리가 차면 창고에 넣는다. 창고까지 걸어간다.
    if (game.inventory.isFull) {
      const storage = { x: game.startingStorage.x, y: game.startingStorage.y };
      if (!game.nearStorage) {
        if (!stepTowardAdjacent(storage)) advance(500);
        continue;
      }
      game.depositAll();
      continue;
    }

    // 4. 가장 가까운 노드를 캔다.
    const target = pickNode();
    if (!target) {
      // 노드가 모두 부서졌으면 리스폰을 기다린다.
      advance(2000);
      continue;
    }

    const player = game.player.position;
    if (Math.abs(target.x - player.x) + Math.abs(target.y - player.y) !== 1) {
      if (!stepTowardAdjacent(target)) {
        // 길이 없으면 그 노드를 잠시 포기하고 시간을 흘린다.
        advance(500);
      }
      continue;
    }

    equipFor(target);
    waitIdle();
    const result = game.actAt(target);
    advance(SWING_DURATION_MS);

    if (result.ok && result.destroyed) harvested += 1;
    if (!result.ok && result.reason === 'inventoryFull') {
      // 창고로 가서 비운다.
      if (game.nearStorage) game.depositAll();
      else if (!stepTowardAdjacent({ x: game.startingStorage.x, y: game.startingStorage.y })) {
        advance(500);
      }
    }
    if (!result.ok && (result.reason === 'zoneLocked' || result.reason === 'wrongTool')) {
      // 캘 수 없는 노드는 내구도를 0으로 만들지 못하므로 다른 노드를 고르게 한다.
      resources.nodeAt(target.x, target.y)!.respawnRemainingMs = 5_000;
      resources.nodeAt(target.x, target.y)!.durability = 0;
    }
  }

  return {
    level: game.villageLevel,
    elapsedMs,
    buildings: game.buildings.completedCount,
    residents: game.population.count,
    requests: game.completedRequestCount,
    harvested,
    steps,
  };
}

describe('통과 플레이', () => {
  it('봇이 기본 시드에서 마을 레벨 5까지 도달한다', () => {
    const result = playToLevel(20260901);

    // 밸런싱 판단 근거로 남긴다.
    console.log(
      `레벨 ${result.level} · ${(result.elapsedMs / 60000).toFixed(1)}분 · ` +
        `건물 ${result.buildings} · 주민 ${result.residents} · 요청 ${result.requests} · ` +
        `채집 ${result.harvested} · 이동 ${result.steps}칸`,
    );

    expect(result.level).toBe(MAX_VILLAGE_LEVEL);
    expect(result.elapsedMs).toBeLessThan(TIME_BUDGET_MS);
  });

  it('다른 시드에서도 막히지 않는다', () => {
    for (const seed of [7, 4242]) {
      const result = playToLevel(seed);
      console.log(`시드 ${seed}: 레벨 ${result.level} · ${(result.elapsedMs / 60000).toFixed(1)}분`);

      expect(result.level).toBe(MAX_VILLAGE_LEVEL);
    }
  });
});
