import { canWalk, type TilePos } from '../core/movement';
import {
  DEFEAT_REWARD,
  MONSTER_ATTACK_MS,
  MONSTER_HEALTH,
  MONSTER_MOVE_MS,
  isRaidNight,
  raidSize,
} from '../core/monsters';
import { hashNoise } from '../core/random';
import type { RaidSave } from '../core/save';
import type { Terrain } from '../core/Terrain';
import { BlueprintId, blueprintById } from '../core/blueprints';
import { isFunctional, type Building, type Buildings } from './Buildings';

/** 침입한 몬스터 한 마리. */
export interface Monster {
  /** 고유 번호. */
  readonly id: number;
  /** 그리드 x. */
  x: number;
  /** 그리드 y. */
  y: number;
  /** 남은 체력. 0이 되면 물러간다. */
  health: number;
  /** 이동 누적 시간(ms). */
  moveElapsedMs: number;
  /** 두드리기 누적 시간(ms). */
  attackElapsedMs: number;
}

/** 한 스텝 동안 일어난 일. */
export interface RaidEvents {
  /** 이번 스텝에 몰려온 마릿수. 0이면 시작하지 않았다. */
  started: number;
  /** 이번 스텝에 손상된 건물들. */
  damaged: Building[];
  /** 이번 스텝에 무너진 건물들(울타리). */
  collapsed: Building[];
  /** 이번 스텝에 물리친 마릿수. */
  defeated: number;
  /** 침입이 끝났으면 true. */
  ended: boolean;
}

/** 망루가 몬스터를 쫓는 간격(ms). */
const TOWER_INTERVAL_MS = 2_200;

/** 망루가 닿는 거리(타일). */
const TOWER_RANGE = 6;

/** 빈 결과. 아무 일도 없는 스텝에 새 배열을 만들지 않는다. */
const NOTHING: RaidEvents = { started: 0, damaged: [], collapsed: [], defeated: 0, ended: false };

/**
 * 밤의 침입을 관리한다.
 *
 * 기획서 9절의 "방어 미니게임"이며, 깊이는 얕게 정했다(ADR 0017). 몬스터는 마을
 * 가장자리에서 나타나 가장 가까운 건물로 걸어가 **두드린다.** 부수지 않는다.
 * 해가 뜨면 남은 몬스터는 물러간다 — 밤 하나가 곧 한 판이다.
 *
 * 플레이어는 다치지 않는다. 이 클래스에 플레이어의 체력이 없는 것이 그 결정의 전부다.
 */
export class Raid {
  private readonly terrain: Terrain;
  private readonly buildings: Buildings;

  /** 지금 마을에 있는 몬스터들. */
  private readonly raiders: Monster[] = [];

  /** 다음에 부여할 몬스터 번호. */
  private nextId = 1;

  /** 마지막으로 침입이 일어난 날. 같은 밤에 두 번 몰려오지 않게 한다. */
  private lastRaidDay = 0;

  /** 망루 사격 누적 시간(ms). */
  private towerElapsedMs = 0;

  /**
   * @param terrain 지형.
   * @param buildings 마을 건물.
   */
  constructor(terrain: Terrain, buildings: Buildings) {
    this.terrain = terrain;
    this.buildings = buildings;
  }

  /** 지금 마을에 있는 몬스터들. */
  get monsters(): readonly Monster[] {
    return this.raiders;
  }

  /** 침입이 진행 중인지. */
  get active(): boolean {
    return this.raiders.length > 0;
  }

  /**
   * 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @param context 지금의 밤 여부·날짜·마을 레벨·세계 시드.
   * @returns 이번 스텝에 일어난 일.
   */
  update(
    stepMs: number,
    context: {
      night: boolean;
      day: number;
      level: number;
      seed: number;
      /** 마을 레벨로 늘어난 망루 사거리(타일). */
      towerRangeBonus?: number;
    },
  ): RaidEvents {
    if (!context.night) {
      // 해가 뜨면 남은 몬스터는 물러간다. 밤을 넘겨 쫓아다니게 두지 않는다.
      if (this.raiders.length === 0) return NOTHING;

      this.raiders.length = 0;

      return { started: 0, damaged: [], collapsed: [], defeated: 0, ended: true };
    }

    const started = this.trySpawn(context);
    if (this.raiders.length === 0) return started > 0 ? { ...NOTHING, started } : NOTHING;

    const hits = this.advance(stepMs);
    const defeated = this.fireTowers(stepMs, context.towerRangeBonus ?? 0);

    return { started, damaged: hits.damaged, collapsed: hits.collapsed, defeated, ended: false };
  }

  /**
   * 침입할 밤이면 몬스터를 불러온다.
   *
   * @param context 밤 여부·날짜·레벨·시드.
   * @returns 몰려온 마릿수.
   */
  private trySpawn(context: { day: number; level: number; seed: number }): number {
    if (this.lastRaidDay === context.day) return 0;
    if (!isRaidNight(context.day, context.level)) return 0;

    this.lastRaidDay = context.day;

    const count = raidSize(context.level);
    let spawned = 0;
    for (let index = 0; index < count; index += 1) {
      const spot = this.pickEdgeTile(context.seed, context.day, index);
      if (!spot) continue;

      this.raiders.push({
        id: this.nextId,
        x: spot.x,
        y: spot.y,
        health: MONSTER_HEALTH,
        moveElapsedMs: 0,
        attackElapsedMs: 0,
      });
      this.nextId += 1;
      spawned += 1;
    }

    return spawned;
  }

  /**
   * 맵 가장자리에서 설 수 있는 칸을 고른다.
   *
   * 시드와 날짜로 정하므로 같은 세계의 같은 밤에는 같은 곳에서 온다 — 밤마다 다른
   * 곳에서 오지만 재현은 된다.
   *
   * @param seed 세계 시드.
   * @param day 며칠째인지.
   * @param index 몇 번째 몬스터인지.
   * @returns 설 수 있는 칸. 없으면 null.
   */
  private pickEdgeTile(seed: number, day: number, index: number): TilePos | null {
    const width = this.terrain.width;
    const height = this.terrain.height;
    const perimeter = 2 * (width + height) - 4;
    if (perimeter <= 0) return null;

    const start = Math.floor(hashNoise(day, index, seed) * perimeter);

    for (let offset = 0; offset < perimeter; offset += 1) {
      const tile = this.edgeTileAt((start + offset) % perimeter);
      if (!tile) continue;
      if (this.terrain.columnHeight(tile.x, tile.y) < 1) continue;
      if (this.buildings.isOccupied(tile.x, tile.y)) continue;

      return tile;
    }

    return null;
  }

  /**
   * 가장자리를 한 바퀴 도는 순번을 칸으로 바꾼다.
   *
   * @param index 순번.
   * @returns 칸. 범위를 벗어나면 null.
   */
  private edgeTileAt(index: number): TilePos | null {
    const width = this.terrain.width;
    const height = this.terrain.height;

    if (index < width) return { x: index, y: 0 };
    if (index < width + height - 1) return { x: width - 1, y: index - width + 1 };
    if (index < 2 * width + height - 2) {
      return { x: 2 * width + height - 3 - index, y: height - 1 };
    }

    const y = 2 * (width + height) - 4 - index;

    return y >= 0 && y < height ? { x: 0, y } : null;
  }

  /**
   * 몬스터를 움직이고, 건물 옆에 닿았으면 두드리게 한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @returns 이번 스텝에 손상된 건물들과 무너진 건물들.
   */
  private advance(stepMs: number): { damaged: Building[]; collapsed: Building[] } {
    const damaged: Building[] = [];
    const collapsed: Building[] = [];

    /**
     * 건물 하나를 두드린다.
     *
     * @param building 대상 건물.
     */
    const hit = (building: Building): void => {
      const result = this.buildings.damageBuilding(building.id);
      if (result === 'damaged') damaged.push(building);
      if (result === 'collapsed') collapsed.push(building);
    };

    for (const monster of this.raiders) {
      const target = this.nearestBuilding(monster);
      if (!target) continue;

      if (this.isBeside(monster, target)) {
        monster.attackElapsedMs += stepMs;
        if (monster.attackElapsedMs < MONSTER_ATTACK_MS) continue;

        monster.attackElapsedMs = 0;
        hit(target);
        continue;
      }

      monster.moveElapsedMs += stepMs;
      if (monster.moveElapsedMs < MONSTER_MOVE_MS) continue;

      monster.moveElapsedMs = 0;
      if (this.stepToward(monster, target)) {
        monster.attackElapsedMs = 0;
        continue;
      }

      // 길이 막혔다. 앞을 가로막은 것을 두드린다 — 울타리로 완전히 두르면 몬스터가
      // 갇혀 아무 일도 일어나지 않던 문제다(ADR 0019).
      const blocker = this.blockingBuilding(monster);
      if (!blocker) continue;

      monster.attackElapsedMs += MONSTER_MOVE_MS;
      if (monster.attackElapsedMs < MONSTER_ATTACK_MS) continue;

      monster.attackElapsedMs = 0;
      hit(blocker);
    }

    return { damaged, collapsed };
  }

  /**
   * 몬스터를 가로막고 있는 건물을 찾는다.
   *
   * @param monster 대상 몬스터.
   * @returns 인접한 건물. 없으면 null.
   */
  private blockingBuilding(monster: Monster): Building | null {
    for (const step of [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ]) {
      const building = this.buildings.buildingAt(monster.x + step.dx, monster.y + step.dy);
      if (building && building.buildRemainingMs <= 0) return building;
    }

    return null;
  }

  /**
   * 목표에 한 칸 다가간다.
   *
   * 경로 탐색은 하지 않는다. 가까워지는 칸 중 걸을 수 있고 건물이 없는 곳으로 간다 —
   * **울타리가 길을 막는 것이 이 규칙에서 나온다.** 갈 곳이 없으면 제자리에 머문다.
   *
   * @param monster 움직일 몬스터.
   * @param target 목표 건물.
   * @returns 한 칸이라도 움직였으면 true.
   */
  private stepToward(monster: Monster, target: Building): boolean {
    const goal = this.buildingCenter(target);
    const here = Math.abs(monster.x - goal.x) + Math.abs(monster.y - goal.y);

    let best: TilePos | null = null;
    let bestDistance = here;

    for (const step of [
      { dx: Math.sign(goal.x - monster.x), dy: 0 },
      { dx: 0, dy: Math.sign(goal.y - monster.y) },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ]) {
      if (step.dx === 0 && step.dy === 0) continue;

      const next = { x: monster.x + step.dx, y: monster.y + step.dy };
      if (!this.terrain.contains(next.x, next.y)) continue;
      if (!canWalk(this.terrain, { x: monster.x, y: monster.y }, next)) continue;
      if (this.buildings.isOccupied(next.x, next.y)) continue;

      const distance = Math.abs(next.x - goal.x) + Math.abs(next.y - goal.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = next;
      }
    }

    if (!best) return false;

    monster.x = best.x;
    monster.y = best.y;

    return true;
  }

  /**
   * 망루가 가까운 몬스터를 쫓는다.
   *
   * @param stepMs 스텝 길이(ms).
   * @param rangeBonus 마을 레벨로 늘어난 사거리(타일).
   * @returns 이번 스텝에 물리친 마릿수.
   */
  private fireTowers(stepMs: number, rangeBonus: number): number {
    const towers: Building[] = [];
    for (const building of this.buildings.all) {
      if (!isFunctional(building)) continue;
      if (building.blueprintId === BlueprintId.WATCHTOWER) towers.push(building);
    }

    if (towers.length === 0) {
      this.towerElapsedMs = 0;
      return 0;
    }

    this.towerElapsedMs += stepMs;
    if (this.towerElapsedMs < TOWER_INTERVAL_MS) return 0;

    this.towerElapsedMs = 0;

    let defeated = 0;
    for (const tower of towers) {
      const center = this.buildingCenter(tower);
      const victim = this.raiders.find(
        (monster) =>
          Math.abs(monster.x - center.x) + Math.abs(monster.y - center.y) <=
          TOWER_RANGE + rangeBonus,
      );
      if (!victim) continue;

      victim.health -= 1;
      if (victim.health <= 0) defeated += 1;
    }

    if (defeated > 0) this.removeDefeated();

    return defeated;
  }

  /**
   * 플레이어가 그 칸을 때린다.
   *
   * @param tile 때린 칸.
   * @returns 맞혔으면 결과. 아무도 없으면 null.
   */
  hitAt(tile: TilePos): { defeated: boolean } | null {
    const monster = this.raiders.find((raider) => raider.x === tile.x && raider.y === tile.y);
    if (!monster) return null;

    monster.health -= 1;
    if (monster.health > 0) return { defeated: false };

    this.removeDefeated();

    return { defeated: true };
  }

  /**
   * 그 칸에 몬스터가 있는지 확인한다.
   *
   * @param tile 대상 칸.
   * @returns 있으면 true.
   */
  occupies(tile: TilePos): boolean {
    return this.raiders.some((raider) => raider.x === tile.x && raider.y === tile.y);
  }

  /** 체력이 다한 몬스터를 목록에서 뺀다. */
  private removeDefeated(): void {
    for (let index = this.raiders.length - 1; index >= 0; index -= 1) {
      if (this.raiders[index]!.health <= 0) this.raiders.splice(index, 1);
    }
  }

  /**
   * 가장 가까운 건물을 찾는다. 손상된 건물도 목표가 된다 — 다 부술 때까지 두드린다.
   *
   * @param from 기준 몬스터.
   * @returns 목표 건물. 마을에 건물이 없으면 null.
   */
  private nearestBuilding(from: { x: number; y: number }): Building | null {
    let best: Building | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const building of this.buildings.all) {
      if (building.buildRemainingMs > 0) continue;

      const center = this.buildingCenter(building);
      const distance = Math.abs(from.x - center.x) + Math.abs(from.y - center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }

    return best;
  }

  /**
   * 건물 점유 영역의 중심 칸을 구한다.
   *
   * @param building 건물.
   * @returns 중심 칸.
   */
  private buildingCenter(building: Building): TilePos {
    const blueprint = blueprintById(building.blueprintId);

    return {
      x: building.x + Math.floor((blueprint.width - 1) / 2),
      y: building.y + Math.floor((blueprint.depth - 1) / 2),
    };
  }

  /**
   * 몬스터가 건물 옆에 붙어 있는지 확인한다.
   *
   * @param monster 몬스터.
   * @param building 건물.
   * @returns 옆에 있으면 true.
   */
  private isBeside(monster: Monster, building: Building): boolean {
    const blueprint = blueprintById(building.blueprintId);

    for (let dy = -1; dy <= blueprint.depth; dy += 1) {
      for (let dx = -1; dx <= blueprint.width; dx += 1) {
        const inside = dx >= 0 && dy >= 0 && dx < blueprint.width && dy < blueprint.depth;
        if (inside) continue;

        if (monster.x === building.x + dx && monster.y === building.y + dy) {
          // 대각선은 인접으로 보지 않는다(ADR 0004의 4방향 규약).
          const straight = dx === -1 || dx === blueprint.width ? dy >= 0 && dy < blueprint.depth : true;
          if (straight) return true;
        }
      }
    }

    return false;
  }

  /**
   * 저장용 표현으로 바꾼다.
   *
   * @returns 저장 데이터.
   */
  toSave(): RaidSave {
    return {
      lastRaidDay: this.lastRaidDay,
      monsters: this.raiders.map((monster) => ({
        id: monster.id,
        x: monster.x,
        y: monster.y,
        health: monster.health,
      })),
    };
  }

  /**
   * 저장에서 되살린다. 이상한 값은 버린다.
   *
   * @param saved 저장 데이터.
   */
  restore(saved: RaidSave | undefined): void {
    this.raiders.length = 0;
    if (!saved) return;

    this.lastRaidDay = Number.isFinite(saved.lastRaidDay) ? Math.floor(saved.lastRaidDay) : 0;

    for (const entry of saved.monsters ?? []) {
      if (!Number.isInteger(entry.x) || !Number.isInteger(entry.y)) continue;
      if (!this.terrain.contains(entry.x, entry.y)) continue;

      const health = Math.max(1, Math.min(MONSTER_HEALTH, Math.floor(entry.health)));
      this.raiders.push({
        id: entry.id,
        x: entry.x,
        y: entry.y,
        health,
        moveElapsedMs: 0,
        attackElapsedMs: 0,
      });
      this.nextId = Math.max(this.nextId, entry.id + 1);
    }
  }
}

/** 물리친 보상을 재수출한다. 호출부가 `monsters`를 따로 import하지 않도록 둔다. */
export { DEFEAT_REWARD };
