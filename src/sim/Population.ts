import { blueprintById } from '../core/blueprints';
import { type TilePos, canStand } from '../core/movement';
import type { Terrain } from '../core/Terrain';
import type { NpcSave } from '../core/save';
import type { Buildings, Building } from './Buildings';
import { SLOTS_PER_WORKPLACE, isWorkplace } from '../core/jobs';
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
        // 배정은 사용자의 선택이므로 저장한다. 예전 저장에는 없고, 없으면
        // "일하지 않는다"로 읽히는 것이 맞는 해석이라 형식 버전은 올리지 않는다.
        ...(npc.jobBuildingId === null ? {} : { jobBuildingId: npc.jobBuildingId }),
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
      // 없어진 건물을 가리키는 배정은 버린다 — 저장과 마을이 어긋난 상태를 만들지 않는다.
      if (typeof entry.jobBuildingId === 'number') {
        const workplace = population.workplaceById(entry.jobBuildingId);
        if (workplace) npc.setJob(entry.jobBuildingId);
      }
      population.npcs.push(npc);
    }

    population.nextId = Math.max(nextId, ...population.npcs.map((npc) => npc.id + 1), 1);

    return population;
  }

  /**
   * 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @param workTime 지금이 일하는 시간대인지. 낮이면 배정된 주민이 일터로 간다.
   * @returns 이번 스텝에 일어난 이주 목록.
   */
  update(stepMs: number, workTime = false): Migration[] {
    this.syncAnchors(workTime);

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
   * 주민들이 머물 기준점을 시간대에 맞춘다.
   *
   * 낮에는 배정된 일터 앞, 그 밖에는 집 앞이다. 순간이동이 아니라 기준점만 옮기므로
   * 주민이 걸어서 오간다 — 출퇴근이 배회 로직 위에 그대로 얹힌다.
   *
   * @param workTime 지금이 일하는 시간대인지.
   */
  private syncAnchors(workTime: boolean): void {
    for (const npc of this.npcs) {
      const job = workTime ? npc.jobBuildingId : null;
      const workplace = job === null ? null : this.workplaceById(job);
      const doorstep = workplace ? this.findDoorstep(workplace) : null;

      npc.setAnchor(doorstep ?? npc.homeTile);
    }
  }

  /**
   * 일터로 쓸 수 있는 완공 건물을 번호로 찾는다.
   *
   * @param buildingId 건물 번호.
   * @returns 건물. 없거나 일터가 아니면 null.
   */
  private workplaceById(buildingId: number): Building | null {
    for (const building of this.buildings.all) {
      if (building.id !== buildingId) continue;
      if (building.buildRemainingMs > 0) return null;

      return isWorkplace(building.blueprintId) ? building : null;
    }

    return null;
  }

  /**
   * 그 일터에 배정된 주민들.
   *
   * @param buildingId 건물 번호.
   * @returns 배정된 주민 목록.
   */
  workersAt(buildingId: number): Npc[] {
    return this.npcs.filter((npc) => npc.jobBuildingId === buildingId);
  }

  /** 지금 어디에도 배정되지 않은 주민들. */
  get idleWorkers(): Npc[] {
    return this.npcs.filter((npc) => npc.jobBuildingId === null);
  }

  /** 배정된 주민 수. */
  get employed(): number {
    return this.npcs.filter((npc) => npc.jobBuildingId !== null).length;
  }

  /**
   * 그 일터에 주민 한 명을 배정한다.
   *
   * 누구를 배정할지는 고르게 하지 않는다 — 주민이 마흔 명까지 늘어나는데(측정값)
   * 그중 하나를 지목하게 하면 목록 UI가 필요하고, 이 게임의 UI 원칙(대사창 없음,
   * 토스트와 아이콘)과 맞지 않는다. **가장 가까운 놀고 있는 주민**이 간다.
   *
   * @param building 일터 건물.
   * @param slots 이 일터가 받는 자리 수. 마을 레벨에서 온다.
   * @returns 배정된 주민. 자리가 없거나 놀고 있는 주민이 없으면 null.
   */
  assign(building: Building, slots: number = SLOTS_PER_WORKPLACE): Npc | null {
    if (!isWorkplace(building.blueprintId)) return null;
    if (building.buildRemainingMs > 0) return null;
    if (this.workersAt(building.id).length >= slots) return null;

    let best: Npc | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const npc of this.idleWorkers) {
      const distance =
        Math.abs(npc.position.x - building.x) + Math.abs(npc.position.y - building.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = npc;
      }
    }

    if (!best) return null;

    best.setJob(building.id);

    return best;
  }

  /**
   * 그 일터에서 주민 한 명을 뺀다.
   *
   * @param buildingId 건물 번호.
   * @returns 빠진 주민. 배정된 주민이 없으면 null.
   */
  unassign(buildingId: number): Npc | null {
    const worker = this.workersAt(buildingId)[0];
    if (!worker) return null;

    worker.setJob(null);
    worker.setAnchor(worker.homeTile);

    return worker;
  }

  /**
   * 없어진 건물에 묶인 배정을 푼다. 철거 뒤에 부른다.
   *
   * @param buildingId 없어진 건물 번호.
   */
  releaseWorkplace(buildingId: number): void {
    for (const npc of this.npcs) {
      if (npc.jobBuildingId !== buildingId) continue;

      npc.setJob(null);
      npc.setAnchor(npc.homeTile);
    }
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
