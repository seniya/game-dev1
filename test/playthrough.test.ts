import { describe, expect, it } from 'vitest';
import { BlueprintId, type Blueprint } from '../src/core/blueprints';
import { ItemType } from '../src/core/items';
import { BlockType } from '../src/core/blocks';
import { DIRECTIONS, canWalk, walkableNeighbors, type TilePos } from '../src/core/movement';
import { isWorkplace } from '../src/core/jobs';
import { MapId } from '../src/core/maps';
import { generateTerrain } from '../src/core/terrainGen';
import { DAY_LENGTH_MS, dayNumber } from '../src/core/daycycle';
import { GOAL_VILLAGE_LEVEL, MAX_VILLAGE_LEVEL, isMapUnlocked } from '../src/core/village';
import { Game } from '../src/sim/Game';
import { MOVE_DURATION_MS, SWING_DURATION_MS } from '../src/sim/Player';
import { ResourceField } from '../src/sim/ResourceField';

/** 맵 한 변의 길이. `main.ts`와 같은 값을 쓴다. */
const MAP_SIZE = 32;

/** 시뮬레이션 스텝 길이(ms). 게임 루프와 같은 60Hz. */
const STEP_MS = 1000 / 60;

/**
 * 이 시간(게임 시간, ms) 안에 목표 레벨에 닿아야 한다.
 *
 * 봇은 최적 플레이(가장 가까운 노드를 즉시 알고 헛클릭이 없음)라 사람은 훨씬 오래 걸린다.
 * 봇 기준 몇 분이면 사람 기준 수십 분으로, 첫 플레이 분량으로 알맞다.
 */
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
  /** 행동 종류별 횟수. 막혔을 때 무엇을 반복했는지 보려고 센다. */
  tally: Record<string, number>;
  /** 레벨에 처음 닿은 시각(ms). 인덱스가 레벨 - 1이다. 구간 소요 시간을 여기서 읽는다. */
  levelTimesMs: number[];
  /**
   * 마을에 선 건물의 종류별 수.
   *
   * "봇이 새 시스템을 실제로 쓰는가"를 이 값으로 확인한다 — 로드맵이 두 번 강조한 것이고,
   * 실제로 두 번 다 봇이 쓰지 않아 측정이 거짓이 될 뻔했다.
   */
  builtTypes: Record<string, number>;
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
 * @param saveEveryActions 이 행동 수마다 저장하고 다시 불러온다. 0이면 하지 않는다.
 * @returns 플레이 결과.
 */
function playToLevel(
  seed: number,
  goalLevel = MAX_VILLAGE_LEVEL,
  saveEveryActions = 0,
): PlaythroughResult {
  const startTerrain = generateTerrain(MAP_SIZE, MAP_SIZE, { seed });
  // 저장/불러오기를 끼워 넣으면 게임 객체 자체가 교체되므로 재대입이 가능해야 한다.
  let game = new Game(startTerrain, new ResourceField(startTerrain, { seed }));
  game.setWorldSeed(seed);

  let elapsedMs = 0;
  let harvested = 0;
  let steps = 0;
  const tally: Record<string, number> = {};
  // 레벨에 처음 닿은 시각. 구간이 앞 구간보다 지나치게 길어지는지 보려고 남긴다.
  const levelTimesMs: number[] = [0];

  /**
   * 행동 횟수를 센다.
   *
   * @param key 행동 이름.
   */
  const count = (key: string): void => {
    tally[key] = (tally[key] ?? 0) + 1;
  };

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
   * 플레이어에서 걸어갈 수 있는 모든 칸까지의 거리를 잰다.
   *
   * 직선거리는 이 지형에서 이동 비용의 좋은 대리값이 아니다. 등반이 1칸으로 제한돼
   * 있어(ADR 0004) 절벽 하나가 긴 우회를 만들기 때문이다. 실제로 직선거리로 노드를
   * 고르게 했더니 어떤 시드에서 채집 한 번에 40칸씩 걸어 다녔다.
   *
   * @returns 칸 키 → 걸음 수.
   */
  const walkDistances = (): Map<string, number> => {
    const start = game.player.position;
    const distances = new Map<string, number>([[`${start.x},${start.y}`, 0]]);
    const queue: TilePos[] = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const distance = distances.get(`${current.x},${current.y}`)!;

      for (const next of walkableNeighbors(game.terrain, current)) {
        const key = `${next.x},${next.y}`;
        if (distances.has(key)) continue;
        distances.set(key, distance + 1);
        queue.push(next);
      }
    }

    return distances;
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

      for (const next of walkableNeighbors(game.terrain, current)) {
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
    if (!canWalk(game.terrain, start, { x: nx, y: ny })) return false;

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
    // 집을 먼저 짓는다. 주민이 점수에 가장 크게 기여하고, 큰 집을 기다리느라 자재를
    // 쌓아 두면 그동안 아무 진전이 없다.
    const order = [
      BlueprintId.COTTAGE,
      BlueprintId.MANOR,
      BlueprintId.WELL,
      BlueprintId.WORKBENCH,
      // 일터를 지어야 주민에게 일자리가 생기고, 일자리 요청도 닫힌다.
      BlueprintId.QUARRY,
      // 방어 시설. 망루가 있으면 자리를 비운 밤에도 마을이 버틴다.
      BlueprintId.WATCHTOWER,
      // 수정을 쓰는 것들. 동굴에 다녀와야 지을 수 있다.
      BlueprintId.FORGE,
      BlueprintId.BEACON,
    ];

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
   * 통로 칸 **위로** 올라선다.
   *
   * `stepTowardAdjacent`는 목표에 인접한 자리까지만 간다. 자원 노드는 옆에서 캐지만
   * 통로는 밟아야 하므로(ADR 0013) 마지막 한 걸음을 더 디뎌야 한다 — 그러지 않으면
   * 봇이 통로 옆에서 영원히 서성인다.
   *
   * @returns 한 걸음이라도 나아갔으면 true.
   */
  const stepOntoPortal = (): boolean => {
    const portal = game.portal;
    const at = game.player.position;
    if (at.x === portal.x && at.y === portal.y) return true;

    const dx = portal.x - at.x;
    const dy = portal.y - at.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      waitIdle();
      if (game.movePlayer(Math.sign(dx), Math.sign(dy))) {
        steps += 1;
        advance(MOVE_DURATION_MS);
        return true;
      }
      return false;
    }

    return stepTowardAdjacent(portal);
  };

  /**
   * 수정이 더 필요한지 본다.
   *
   * 대장간과 수정 등대가 수정을 요구한다. 둘 다 세워졌으면 더 캘 이유가 없다 —
   * 동굴은 목적이 있을 때만 간다.
   *
   * @returns 필요한 수정 개수. 필요 없으면 0.
   */
  const crystalNeeded = (): number => {
    let need = 0;
    for (const id of [BlueprintId.FORGE, BlueprintId.BEACON]) {
      const blueprint = game.availableBlueprints.find((candidate) => candidate.id === id);
      if (!blueprint) continue;
      if (game.buildings.hasCompleted(id)) continue;

      const wants = blueprint.materials.find((material) => material.item === ItemType.CRYSTAL);
      if (wants) need = Math.max(need, wants.amount);
    }

    return Math.max(0, need - game.totalHeld(ItemType.CRYSTAL));
  };

  /**
   * 블루프린트를 놓을 자리를 찾는다. 마을 중심 근처를 안쪽부터 훑는다.
   *
   * @param blueprint 블루프린트.
   * @returns 놓을 좌표. 없으면 null.
   */
  const findSpot = (blueprint: Blueprint): TilePos | null => {
    // 마을은 시작 지점(맵 중앙) 둘레로 자란다. 반경을 맵 크기에서 뽑지 않으면
    // **봇이 다 채운 뒤 평탄화만 반복한다** — 실제로 그렇게 측정됐다.
    // centerTile은 짝수 맵에서 소수를 준다(15.5). 정수 칸으로 내림한다.
    const raw = game.terrain.centerTile;
    const center = { x: Math.floor(raw.x), y: Math.floor(raw.y) };
    const maxRadius = Math.floor(Math.min(game.terrain.width, game.terrain.height) / 2) - 1;

    for (let radius = 1; radius <= maxRadius; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

          const spot = { x: center.x + dx, y: center.y + dy };
          if (!game.buildings.canPlace(blueprint, spot.x, spot.y, game.resources).ok) continue;

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
   * 블루프린트를 놓을 수 있도록 땅을 고르는 한 걸음을 밟는다.
   *
   * 기획서 5.1이 지형 변형의 목적으로 "건축 부지 평탄화"를 든다. 마을 주변의 평탄한
   * 자리는 금방 떨어지므로, 계속 지으려면 파고 메워 자리를 만들어야 한다. 봇이 이것을
   * 하지 않으면 중반에 막힌다 — 실제로 막혔고, 그래서 넣었다.
   *
   * @param blueprint 놓으려는 블루프린트.
   * @returns 한 걸음이라도 진행했으면 true.
   */
  const levelGroundStep = (blueprint: Blueprint): boolean => {
    const target = findFlattenTarget(blueprint);
    if (!target) return false;

    const player = game.player.position;
    if (Math.abs(target.tile.x - player.x) + Math.abs(target.tile.y - player.y) !== 1) {
      return stepTowardAdjacent(target.tile);
    }

    waitIdle();
    const height = game.terrain.columnHeight(target.tile.x, target.tile.y);

    if (height > target.height) {
      // 표면 블록에 맞는 도구로 바꿔 판다.
      const surface = game.terrain.surfaceBlock(target.tile.x, target.tile.y);
      game.player.selectTool(surface === BlockType.DIRT ? 0 : 1);
      const result = game.digAt(target.tile);
      advance(SWING_DURATION_MS);
      return result.ok;
    }

    // 낮으면 메운다. 흙이 없으면 옆 땅을 파서 마련한다.
    if (game.inventory.count(ItemType.DIRT) === 0 && game.totalHeld(ItemType.DIRT) === 0) {
      const dirtSource = walkableNeighbors(game.terrain, player).find(
        (tile) =>
          !game.isOccupied(tile) &&
          !game.resources.isBlocked(tile.x, tile.y) &&
          game.terrain.surfaceBlock(tile.x, tile.y) === BlockType.DIRT,
      );
      if (!dirtSource) return false;

      game.player.selectTool(0);
      const dug = game.digAt(dirtSource);
      advance(SWING_DURATION_MS);
      return dug.ok;
    }

    const result = game.placeAt(target.tile);
    advance(SWING_DURATION_MS);

    return result.ok;
  };

  /**
   * 평탄화할 자리와 목표 높이를 찾는다.
   *
   * 건물·노드가 없고 맵 안인 영역 중, 높이를 맞추면 지을 수 있게 되는 곳을 고른다.
   * 목표 높이는 그 영역에서 가장 흔한 높이다 — 손대야 할 칸이 가장 적다.
   *
   * @param blueprint 놓으려는 블루프린트.
   * @returns 손댈 칸과 목표 높이. 없으면 null.
   */
  const findFlattenTarget = (
    blueprint: Blueprint,
  ): { tile: TilePos; height: number } | null => {
    const center = { x: 15, y: 15 };

    for (let radius = 1; radius <= 12; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;

          const origin = { x: center.x + dx, y: center.y + dy };
          const counts = new Map<number, number>();
          let usable = true;

          for (let ty = 0; ty < blueprint.depth && usable; ty += 1) {
            for (let tx = 0; tx < blueprint.width; tx += 1) {
              const tile = { x: origin.x + tx, y: origin.y + ty };
              if (!game.terrain.contains(tile.x, tile.y)) { usable = false; break; }
              if (game.isOccupied(tile)) { usable = false; break; }
              if (game.resources.isBlocked(tile.x, tile.y)) { usable = false; break; }

              const height = game.terrain.columnHeight(tile.x, tile.y);
              if (height < 1) { usable = false; break; }
              counts.set(height, (counts.get(height) ?? 0) + 1);
            }
          }
          if (!usable) continue;

          // 가장 흔한 높이를 목표로 삼는다.
          let goalHeight = 0;
          let best = 0;
          for (const [height, count] of counts) {
            if (count > best) { best = count; goalHeight = height; }
          }

          for (let ty = 0; ty < blueprint.depth; ty += 1) {
            for (let tx = 0; tx < blueprint.width; tx += 1) {
              const tile = { x: origin.x + tx, y: origin.y + ty };
              if (game.terrain.columnHeight(tile.x, tile.y) !== goalHeight) {
                return { tile, height: goalHeight };
              }
            }
          }
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
    const pickaxeTier = Math.max(
      ...[0, 1, 2].map((slot) => {
        game.player.selectTool(slot);
        return game.player.tool.kind === 'pickaxe' ? game.player.tool.tier : 0;
      }),
    );

    const distances = walkDistances();

    let best: TilePos | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const node of game.resources.all) {
      if (node.durability <= 0) continue;
      // 캘 수 없는 노드로 걸어가는 것은 시간 낭비다. 사람도 그러지 않는다.
      if (game.isZoneLocked(node.x, node.y)) continue;
      if (node.kind === 'ironVein' && pickaxeTier < 2) continue;

      // 노드 옆에 설 수 있는 칸 중 가장 가까운 곳까지의 걸음 수를 비용으로 본다.
      let reach = Number.POSITIVE_INFINITY;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const stand = distances.get(`${node.x + dx},${node.y + dy}`);
        if (stand !== undefined && stand < reach) reach = stand;
      }
      if (!Number.isFinite(reach)) continue;

      // 필요한 자원에 가중치를 줘 가까운 것만 캐다 막히는 상황을 피한다.
      // 동굴에 들어간 이유는 수정이므로 그것을 먼저 본다.
      const priority =
        node.kind === 'crystalVein'
          ? 0.2
          : needIron && node.kind === 'ironVein'
            ? 0.4
            : 1;
      const cost = reach * priority;

      if (cost < bestCost) {
        bestCost = cost;
        best = { x: node.x, y: node.y };
      }
    }

    void player;

    return best;
  };

  /**
   * 노드 종류에 맞는 도구를 든다.
   *
   * @param target 노드 좌표.
   */
  const equipFor = (target: TilePos): void => {
    const node = game.resources.nodeAt(target.x, target.y);
    if (!node) return;

    game.player.selectTool(node.kind === 'tree' ? 2 : 1);
  };

  /**
   * 손상된 건물 하나를 찾는다.
   *
   * @returns 손상된 건물 칸. 없으면 null.
   */
  const findDamaged = (): TilePos | null => {
    for (const building of game.buildings.all) {
      if (building.buildRemainingMs > 0 || building.damage <= 0) continue;

      return { x: building.x, y: building.y };
    }

    return null;
  };

  /**
   * 가장 가까운 몬스터를 찾는다.
   *
   * @returns 몬스터 칸. 없거나 닿을 수 없으면 null.
   */
  const findMonster = (): TilePos | null => {
    if (game.raid.monsters.length === 0) return null;

    const distances = walkDistances();
    let best: TilePos | null = null;
    let bestCost = Number.POSITIVE_INFINITY;

    for (const monster of game.raid.monsters) {
      for (const step of DIRECTIONS) {
        const stand = distances.get(`${monster.x + step.dx},${monster.y + step.dy}`);
        if (stand === undefined || stand >= bestCost) continue;

        bestCost = stand;
        best = { x: monster.x, y: monster.y };
      }
    }

    // 멀리 있는 몬스터를 쫓아다니면 채집이 멈춘다. 마을 근처만 상대한다.
    return bestCost <= 12 ? best : null;
  };

  /**
   * 비어 있는 일터에 주민을 배정한다.
   *
   * @returns 배정했으면 true.
   */
  const fillJobs = (): boolean => {
    if (game.population.idleWorkers.length === 0) return false;

    for (const building of game.buildings.all) {
      if (building.buildRemainingMs > 0 || building.damage > 0) continue;
      if (!isWorkplace(building.blueprintId)) continue;
      if (game.population.workersAt(building.id).length >= game.slotsPerWorkplace) continue;

      if (game.toggleWorker({ x: building.x, y: building.y }).ok) return true;
    }

    return false;
  };

  for (let action = 0; action < MAX_ACTIONS; action += 1) {
    while (levelTimesMs.length < game.villageLevel) levelTimesMs.push(elapsedMs);
    if (game.villageLevel >= goalLevel) break;
    if (elapsedMs >= TIME_BUDGET_MS) break;

    // 저장을 끼워 넣어도 플레이가 이어지는지 확인한다. 실제 플레이에서 자동 저장이
    // 30초마다 돌고 사용자가 언제든 새로고침할 수 있으므로, 이 경로가 막히면 안 된다.
    if (saveEveryActions > 0 && action > 0 && action % saveEveryActions === 0) {
      const restored = Game.fromSave(JSON.parse(JSON.stringify(game.toSave())));
      if (!restored) throw new Error(`행동 ${action}에서 저장을 되살리지 못했다`);
      game = restored;
    }

    // 0. 몬스터가 마을 근처에 있으면 먼저 쫓는다. 두면 건물이 상하고, 상한 건물은
    //    마을 점수에서 빠진다 — 방어가 곧 진행이다.
    const monster = findMonster();
    if (monster) {
      const player = game.player.position;
      if (Math.abs(monster.x - player.x) + Math.abs(monster.y - player.y) === 1) {
        waitIdle();
        const hit = game.actAt(monster);
        advance(SWING_DURATION_MS);
        count(hit.ok ? 'fight' : `fightFail:${hit.ok === false ? hit.reason : ''}`);
      } else if (stepTowardAdjacent(monster)) {
        count('walk');
      } else {
        advance(300);
      }
      continue;
    }

    // 0.5 손상된 건물을 고친다. 고치기 전에는 기능도 점수도 돌아오지 않는다.
    const damaged = findDamaged();
    if (damaged) {
      const repaired = game.repairAt(damaged);
      if (repaired.ok) {
        count('repair');
        continue;
      }
      // 자재가 없으면 나중에 다시 온다.
      if (repaired.ok === false && repaired.reason !== 'noMaterial') count('repairFail');
    }

    // 0.7 놀고 있는 주민을 일터에 넣는다. 낮 동안 자원이 조금씩 쌓인다.
    if (fillJobs()) {
      count('assign');
      continue;
    }

    // 0.8 수정이 필요하면 동굴에 다녀온다. 대장간과 수정 등대는 그것 없이는 못 짓는다.
    const needCrystal = crystalNeeded();
    if (game.currentMap === MapId.CAVE) {
      // 다 캤으면 나간다. 인벤토리가 차도 나간다 — 창고는 지상에 있다.
      const full = game.inventory.usedSlots >= game.inventory.slotCount;
      if (needCrystal === 0 || full) {
        if (game.onPortal) {
          game.travel();
          count('travel');
        } else if (!stepOntoPortal()) {
          advance(500);
        } else count('walk');
        continue;
      }
    } else if (needCrystal > 0 && isMapUnlocked(MapId.CAVE, game.villageLevel)) {
      // 창고를 비우고 들어간다. 손이 차 있으면 수정을 받을 자리가 없다.
      if (game.inventory.usedSlots >= game.inventory.slotCount && !game.nearStorage) {
        if (!stepTowardAdjacent({ x: game.startingStorage.x, y: game.startingStorage.y })) advance(500);
        continue;
      }
      if (game.inventory.usedSlots >= game.inventory.slotCount) {
        game.depositAll();
        continue;
      }

      if (game.onPortal) {
        game.travel();
        count('travel');
      } else if (!stepOntoPortal()) {
        advance(500);
      } else count('walk');
      continue;
    }

    // 1. 낼 수 있는 요청은 즉시 낸다. 점수 효율이 가장 좋다.
    if (game.fulfillRequest()) continue;

    // 2. 지을 수 있으면 짓는다. 자리가 없으면 땅을 골라 자리를 만든다.
    const blueprint = pickAffordable();
    if (blueprint) {
      const spot = findSpot(blueprint);
      if (spot) {
        game.selectBlueprint(blueprint.id);
        waitIdle();
        const result = game.buildAt(spot);
        game.selectBlueprint(null);
        if (result.ok) {
          count('build');
          advance(200);
          continue;
        }
        count('buildFailed');
      } else if (levelGroundStep(blueprint)) {
        count('flatten');
        continue;
      }
    }

    // 3. 슬롯이 다 차면 창고에 넣는다. 모든 슬롯이 상한까지 찰 때까지 기다리면
    //    새 종류의 자원을 받지 못해 채집이 계속 거절된다.
    if (game.inventory.usedSlots >= game.inventory.slotCount) {
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
      count('noNode');
      advance(2000);
      continue;
    }

    const player = game.player.position;
    if (Math.abs(target.x - player.x) + Math.abs(target.y - player.y) !== 1) {
      if (!stepTowardAdjacent(target)) {
        // 길이 없으면 그 노드를 잠시 포기하고 시간을 흘린다.
        count('unreachable');
        advance(500);
      } else count('walk');
      continue;
    }

    equipFor(target);
    waitIdle();
    const result = game.actAt(target);
    advance(SWING_DURATION_MS);

    count(result.ok ? 'hit' : `hitFail:${result.reason}`);
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
      game.resources.nodeAt(target.x, target.y)!.respawnRemainingMs = 5_000;
      game.resources.nodeAt(target.x, target.y)!.durability = 0;
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
    tally,
    levelTimesMs,
    builtTypes: (() => {
      const types: Record<string, number> = {};
      for (const building of game.buildings.all) {
        if (building.buildRemainingMs > 0) continue;
        types[building.blueprintId] = (types[building.blueprintId] ?? 0) + 1;
      }
      return types;
    })(),
  };
}

/**
 * 같은 조건의 통과 플레이 결과를 재사용한다.
 *
 * 레벨 20까지 도는 데 몇 초가 걸리므로, 같은 시드를 여러 테스트가 각자 돌리면 테스트가
 * 수십 초로 늘어난다. 결과는 결정적이라 나눠 써도 안전하다.
 */
const cache = new Map<string, PlaythroughResult>();

/**
 * 통과 플레이를 돌리되 같은 조건이면 앞선 결과를 쓴다.
 *
 * @param seed 시드.
 * @param goalLevel 목표 레벨.
 * @param saveEveryActions 저장 간격.
 * @returns 플레이 결과.
 */
function play(seed: number, goalLevel = MAX_VILLAGE_LEVEL, saveEveryActions = 0): PlaythroughResult {
  const key = `${seed}:${goalLevel}:${saveEveryActions}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const result = playToLevel(seed, goalLevel, saveEveryActions);
  cache.set(key, result);

  return result;
}

describe('통과 플레이', () => {
  it('봇이 기본 시드에서 최대 레벨까지 도달한다', () => {
    const result = play(20260901);

    // 밸런싱 판단 근거로 남긴다.
    console.log(
      `레벨 ${result.level} · ${(result.elapsedMs / 60000).toFixed(1)}분 · ` +
        `건물 ${result.buildings} · 주민 ${result.residents} · 요청 ${result.requests} · ` +
        `채집 ${result.harvested} · 이동 ${result.steps}칸 · ${JSON.stringify(result.tally)}`,
    );

    console.log('건물 종류:', JSON.stringify(result.builtTypes));
    console.log(
      '구간: ' +
        result.levelTimesMs
          .map((time, index) => `${index + 1}=${(time / 60000).toFixed(1)}분`)
          .join(' '),
    );

    expect(result.level).toBe(MAX_VILLAGE_LEVEL);
    expect(result.elapsedMs).toBeLessThan(TIME_BUDGET_MS);
  });

  it('구간이 앞 구간보다 지나치게 길어지지 않는다', () => {
    const result = play(20260901);
    const times = result.levelTimesMs;

    // 초반 몇 레벨은 워낙 짧아 비율이 크게 흔들린다. 중반 이후만 본다.
    for (let level = 6; level < times.length; level += 1) {
      const gap = times[level]! - times[level - 1]!;
      const previous = times[level - 1]! - times[level - 2]!;
      if (previous <= 0) continue;

      expect(gap).toBeLessThan(previous * 3);
    }
  });

  it('1차 목표(레벨 10)는 한 판의 앞쪽에서 닿는다 — 나머지는 여운이다', () => {
    const result = play(20260901);

    expect(result.levelTimesMs[GOAL_VILLAGE_LEVEL - 1]).toBeLessThan(result.elapsedMs * 0.5);
  });

  it('봇이 새 시스템을 실제로 쓴다 — 쓰지 않는 시스템은 측정되지 않는다', () => {
    const result = play(20260901);

    // 동굴: 수정 없이는 대장간도 등대도 못 짓는다. 지었다면 다녀온 것이다.
    expect(result.tally.travel ?? 0).toBeGreaterThan(0);
    expect(result.builtTypes.forge ?? 0).toBeGreaterThan(0);
    expect(result.builtTypes.beacon ?? 0).toBeGreaterThan(0);

    // 일터와 배정.
    expect(result.builtTypes.quarry ?? 0).toBeGreaterThan(0);
    expect(result.tally.assign ?? 0).toBeGreaterThan(0);

    // 방어와 수리.
    expect(result.builtTypes.watchtower ?? 0).toBeGreaterThan(0);
    expect(result.tally.fight ?? 0).toBeGreaterThan(0);
    expect(result.tally.repair ?? 0).toBeGreaterThan(0);
  });

  it('한 판 안에 해가 여러 번 뜨고 진다 — 하루 길이가 세션에 맞는다', () => {
    const result = play(20260901);
    const days = dayNumber(result.elapsedMs);

    console.log(`통과 플레이 동안 ${days}일이 흘렀다 (하루 ${DAY_LENGTH_MS / 60000}분)`);

    // 한 번도 밤을 보지 못하면 사이클을 넣은 의미가 없고, 열 번을 넘기면
    // 사람 기준으로는 밤이 너무 잦다(봇 1분은 사람 8~12분에 해당한다).
    expect(days).toBeGreaterThanOrEqual(2);
    expect(days).toBeLessThanOrEqual(10);
  });

  it('다른 시드에서도 막히지 않는다', () => {
    for (const seed of [7, 4242]) {
      const result = play(seed);
      console.log(
        `시드 ${seed}: 레벨 ${result.level} · ${(result.elapsedMs / 60000).toFixed(1)}분 · ` +
          `건물 ${result.buildings} · 주민 ${result.residents} · ${JSON.stringify(result.tally)}`,
      );

      expect(result.level).toBe(MAX_VILLAGE_LEVEL);
    }
  });
});

describe('저장을 끼운 통과 플레이', () => {
  it('중간에 저장하고 불러와도 최대 레벨까지 도달한다', () => {
    const result = play(20260901, MAX_VILLAGE_LEVEL, 40);

    console.log(
      `저장 왕복 포함: 레벨 ${result.level} · ${(result.elapsedMs / 60000).toFixed(1)}분 · ` +
        `건물 ${result.buildings} · 주민 ${result.residents}`,
    );

    expect(result.level).toBe(MAX_VILLAGE_LEVEL);
  });

  it('잦은 저장에도 진행이 뒤로 가지 않는다', () => {
    const plain = play(7);
    const withSaves = play(7, MAX_VILLAGE_LEVEL, 15);

    expect(withSaves.level).toBe(plain.level);
    // 저장 왕복은 시뮬레이션 시간을 늘리지 않는다. 오차는 봇의 판단 차이 정도여야 한다.
    expect(withSaves.elapsedMs).toBeLessThan(plain.elapsedMs * 2 + 60_000);
  });
});
