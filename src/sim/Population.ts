import { blueprintById } from '../core/blueprints';
import { type TilePos, canStand } from '../core/movement';
import type { Terrain } from '../core/Terrain';
import type { NpcSave } from '../core/save';
import type { Buildings, Building } from './Buildings';
import { Npc } from './Npc';

/** 이주 결과. */
export interface Migration {
  /** 이주한 주민. */
  npc: Npc;
  /** 그 주민이 들어간 집. */
  building: Building;
}

/**
 * 마을 주민 집단.
 *
 * 기획서 5.4의 이주 규칙을 담당한다. 집이 완공되고 수용 인원에 여유가 생기면
 * 주민이 자동으로 이주하며, 알림은 토스트 한 줄뿐이다(대사·컷신 없음).
 *
 * 이주는 매 스텝이 아니라 **여유가 생긴 시점부터 일정 시간 뒤**에 일어난다.
 * 집을 짓는 순간 주민이 튀어나오면 "이주"라는 느낌이 없고, 큰 집을 지었을 때
 * 두 명이 동시에 나타나 어색하다.
 */
export class Population {
  private readonly terrain: Terrain;
  private readonly buildings: Buildings;

  /** 주민 목록. */
  private readonly npcs: Npc[] = [];
  /** 다음에 부여할 주민 번호. */
  private nextId = 1;
  /** 다음 이주까지 남은 시간(ms). 여유가 없으면 초기값으로 되돌린다. */
  private migrationTimerMs = 0;

  /** 여유가 생긴 뒤 실제 이주까지 걸리는 시간(ms). */
  private readonly migrationDelayMs = 2500;

  /**
   * @param terrain 지형.
   * @param buildings 마을 건물.
   */
  constructor(terrain: Terrain, buildings: Buildings) {
    this.terrain = terrain;
    this.buildings = buildings;
    this.migrationTimerMs = this.migrationDelayMs;
  }

  /** 주민 수. */
  get count(): number {
    return this.npcs.length;
  }

  /** 주민 목록. */
  get all(): readonly Npc[] {
    return this.npcs;
  }

  /** 완공된 집이 제공하는 총 수용 인원. */
  get housingCapacity(): number {
    return this.buildings.sumCompleted((blueprint) => blueprint.housing);
  }

  /** 지금 이주할 자리가 있는지 여부. */
  get hasVacancy(): boolean {
    return this.npcs.length < this.housingCapacity;
  }

  /**
   * 저장용 표현으로 바꾼다.
   *
   * 배회 중인 이동은 담지 않는다. 불러온 순간 각자 서 있다가 다시 걷기 시작하는 편이
   * 자연스럽고, 중간 상태를 되살릴 이유가 없다.
   *
   * @returns 저장 데이터와 다음 번호.
   */
  toSave(): { npcs: NpcSave[]; nextId: number } {
    return {
      npcs: this.npcs.map((npc) => ({
        id: npc.id,
        homeBuildingId: npc.homeBuildingId,
        homeX: npc.homeTile.x,
        homeY: npc.homeTile.y,
        x: npc.position.x,
        y: npc.position.y,
      })),
      nextId: this.nextId,
    };
  }

  /**
   * 저장에서 주민을 되살린다.
   *
   * @param terrain 지형.
   * @param buildings 마을 건물.
   * @param saved 저장된 주민 목록.
   * @param nextId 다음에 부여할 번호.
   * @returns 되살린 주민 집단.
   */
  static fromSave(
    terrain: Terrain,
    buildings: Buildings,
    saved: readonly NpcSave[],
    nextId: number,
  ): Population {
    const population = new Population(terrain, buildings);

    for (const entry of saved) {
      if (!Number.isInteger(entry.id)) continue;
      if (!Number.isInteger(entry.x) || !Number.isInteger(entry.y)) continue;

      const npc = new Npc(entry.id, entry.homeBuildingId, { x: entry.homeX, y: entry.homeY });
      npc.placeAt({ x: entry.x, y: entry.y });
      population.npcs.push(npc);
    }

    population.nextId = Math.max(nextId, ...population.npcs.map((npc) => npc.id + 1), 1);

    return population;
  }

  /**
   * 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @returns 이번 스텝에 일어난 이주 목록.
   */
  update(stepMs: number): Migration[] {
    for (const npc of this.npcs) npc.update(stepMs, this.terrain);

    if (!this.hasVacancy) {
      this.migrationTimerMs = this.migrationDelayMs;
      return [];
    }

    this.migrationTimerMs -= stepMs;
    if (this.migrationTimerMs > 0) return [];

    this.migrationTimerMs = this.migrationDelayMs;

    const migration = this.moveIn();

    return migration ? [migration] : [];
  }

  /**
   * 주민 한 명을 이주시킨다.
   *
   * @returns 이주 결과. 자리가 없거나 설 곳이 없으면 null.
   */
  private moveIn(): Migration | null {
    const home = this.findVacantHouse();
    if (!home) return null;

    const doorstep = this.findDoorstep(home);
    if (!doorstep) return null;

    const npc = new Npc(this.nextId, home.id, doorstep);
    this.nextId += 1;
    this.npcs.push(npc);

    return { npc, building: home };
  }

  /**
   * 아직 정원이 남은 완공 집을 찾는다.
   *
   * @returns 집 건물. 없으면 undefined.
   */
  private findVacantHouse(): Building | undefined {
    for (const building of this.buildings.all) {
      if (building.buildRemainingMs > 0) continue;

      const blueprint = blueprintById(building.blueprintId);
      if (blueprint.housing <= 0) continue;

      const residents = this.npcs.filter((npc) => npc.homeBuildingId === building.id).length;
      if (residents < blueprint.housing) return building;
    }

    return undefined;
  }

  /**
   * 집 앞에 설 수 있는 칸을 찾는다. 건물이 점유한 칸에는 설 수 없다.
   *
   * @param building 집 건물.
   * @returns 집 앞 칸. 없으면 null.
   */
  private findDoorstep(building: Building): TilePos | null {
    const blueprint = blueprintById(building.blueprintId);

    for (let dy = -1; dy <= blueprint.depth; dy += 1) {
      for (let dx = -1; dx <= blueprint.width; dx += 1) {
        // 점유 영역 내부는 건물이 차지하고 있다.
        const inside = dx >= 0 && dx < blueprint.width && dy >= 0 && dy < blueprint.depth;
        if (inside) continue;

        const tile = { x: building.x + dx, y: building.y + dy };
        if (!canStand(this.terrain, tile.x, tile.y)) continue;
        if (this.buildings.isOccupied(tile.x, tile.y)) continue;

        return tile;
      }
    }

    return null;
  }
}
