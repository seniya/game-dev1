import { BlueprintId, blueprintById, buildDurationMs, type Blueprint } from '../core/blueprints';
import { isAdjacent, type TilePos } from '../core/movement';
import type { BuildingSave } from '../core/save';
import type { Terrain } from '../core/Terrain';

/** 배치된 건물 하나. */
export interface Building {
  /** 고유 번호. */
  readonly id: number;
  /** 블루프린트 식별자. */
  readonly blueprintId: BlueprintId;
  /** 점유 영역 좌상단 그리드 x. */
  readonly x: number;
  /** 점유 영역 좌상단 그리드 y. */
  readonly y: number;
  /** 건축 남은 시간(ms). 0이면 완공이다. */
  buildRemainingMs: number;
}

/** 배치가 거절된 이유. */
export type PlacementFailure =
  /** 맵 밖으로 넘어간다. */
  | 'outOfBounds'
  /** 평탄하지 않다(높이가 다르거나 지면이 없다). */
  | 'notFlat'
  /** 자원 노드가 막고 있다. */
  | 'nodeInWay'
  /** 다른 건물과 겹친다. */
  | 'overlaps';

/** 배치 가능 여부 판정 결과. */
export type PlacementCheck = { ok: true } | { ok: false; reason: PlacementFailure };

/** 배치 판정에 필요한 자원 노드 정보만 추린 인터페이스. */
export interface NodeBlocker {
  /**
   * 그 칸이 노드로 막혀 있는지 확인한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   */
  isBlocked(x: number, y: number): boolean;
}

/**
 * 마을에 놓인 건물 모음.
 *
 * 기획서 5.3의 완성형 건축을 담당한다. 블록을 한 칸씩 쌓는 대신, 자재를 모아
 * 블루프린트를 확정하면 짧은 건축 시간을 거쳐 완성된 건물이 된다.
 *
 * 점유 칸은 `y * width + x` → 건물 번호 Map으로 따로 관리한다. 건물 목록을
 * 매번 훑어 점유를 판정하면 파기·쌓기·배치 미리보기가 매 프레임 O(건물 수 ×
 * 면적)을 돌게 된다.
 */
export class Buildings {
  private readonly terrain: Terrain;
  /** 건물 번호 → 건물. */
  private readonly buildings = new Map<number, Building>();
  /** 점유 칸 키 → 건물 번호. */
  private readonly occupancy = new Map<number, number>();

  /** 다음에 부여할 건물 번호. */
  private nextId = 1;

  /**
   * @param terrain 지형.
   */
  constructor(terrain: Terrain) {
    this.terrain = terrain;
  }

  /** 배치된 건물 수(건축 중 포함). */
  get count(): number {
    return this.buildings.size;
  }

  /** 완공된 건물 수. */
  get completedCount(): number {
    let done = 0;
    for (const building of this.buildings.values()) {
      if (building.buildRemainingMs <= 0) done += 1;
    }
    return done;
  }

  /** 모든 건물. */
  get all(): Iterable<Building> {
    return this.buildings.values();
  }

  /**
   * 그 칸이 건물로 점유돼 있는지 확인한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 점유돼 있으면 true.
   */
  isOccupied(x: number, y: number): boolean {
    return this.occupancy.has(this.key(x, y));
  }

  /**
   * 번호로 건물을 찾는다.
   *
   * @param id 건물 번호.
   * @returns 건물. 없으면 undefined.
   */
  buildingById(id: number): Building | undefined {
    for (const building of this.all) {
      if (building.id === id) return building;
    }

    return undefined;
  }

  /**
   * 그 칸을 점유한 건물을 돌려준다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 건물. 없으면 undefined.
   */
  buildingAt(x: number, y: number): Building | undefined {
    const id = this.occupancy.get(this.key(x, y));

    return id === undefined ? undefined : this.buildings.get(id);
  }

  /**
   * 특정 블루프린트로 지어진 완공 건물이 있는지 확인한다.
   * Phase 7의 시설 건축형 요청 판정에 쓴다.
   *
   * @param blueprintId 블루프린트 식별자.
   * @returns 하나라도 완공돼 있으면 true.
   */
  hasCompleted(blueprintId: BlueprintId): boolean {
    for (const building of this.buildings.values()) {
      if (building.blueprintId === blueprintId && building.buildRemainingMs <= 0) return true;
    }

    return false;
  }

  /**
   * 완공된 건물의 블루프린트 종류를 모은다.
   *
   * 마을 점수에서 시설을 종류당 한 번만 세기 위한 것이다.
   *
   * @param filter 셀 대상을 가르는 함수. 생략하면 모든 완공 건물.
   * @returns 종류 집합.
   */
  completedTypes(filter?: (blueprint: Blueprint) => boolean): Set<BlueprintId> {
    const types = new Set<BlueprintId>();

    for (const building of this.buildings.values()) {
      if (building.buildRemainingMs > 0) continue;

      const blueprint = blueprintById(building.blueprintId);
      if (filter && !filter(blueprint)) continue;

      types.add(building.blueprintId);
    }

    return types;
  }

  /**
   * 완공 건물의 특정 속성을 모두 더한다. 주민 수용 인원, 창고 슬롯 등에 쓴다.
   *
   * @param pick 블루프린트에서 값을 꺼내는 함수.
   * @returns 합계.
   */
  sumCompleted(pick: (blueprint: Blueprint) => number): number {
    let total = 0;
    for (const building of this.buildings.values()) {
      if (building.buildRemainingMs > 0) continue;
      total += pick(blueprintById(building.blueprintId));
    }

    return total;
  }

  /**
   * 배치 가능 여부를 판정한다.
   *
   * 기획서 5.3의 "평탄한 빈 공간 위에서만 배치 확정 가능"을 구현한다.
   *
   * @param blueprint 블루프린트.
   * @param x 점유 영역 좌상단 그리드 x.
   * @param y 점유 영역 좌상단 그리드 y.
   * @param nodes 자원 노드(막힘 판정용).
   * @returns 판정 결과.
   */
  canPlace(blueprint: Blueprint, x: number, y: number, nodes: NodeBlocker): PlacementCheck {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, reason: 'outOfBounds' };
    if (!this.terrain.contains(x, y)) return { ok: false, reason: 'outOfBounds' };
    if (!this.terrain.contains(x + blueprint.width - 1, y + blueprint.depth - 1)) {
      return { ok: false, reason: 'outOfBounds' };
    }

    if (!this.terrain.isFlatArea(x, y, blueprint.width, blueprint.depth)) {
      return { ok: false, reason: 'notFlat' };
    }

    for (let dy = 0; dy < blueprint.depth; dy += 1) {
      for (let dx = 0; dx < blueprint.width; dx += 1) {
        if (nodes.isBlocked(x + dx, y + dy)) return { ok: false, reason: 'nodeInWay' };
        if (this.isOccupied(x + dx, y + dy)) return { ok: false, reason: 'overlaps' };
      }
    }

    return { ok: true };
  }

  /**
   * 건물을 배치한다. 자재 소모는 호출부(`Game`)가 먼저 처리한다 —
   * 이 클래스는 자재를 모른다.
   *
   * @param blueprint 블루프린트.
   * @param x 점유 영역 좌상단 그리드 x.
   * @param y 점유 영역 좌상단 그리드 y.
   * @param nodes 자원 노드.
   * @param instant true면 건축 시간 없이 즉시 완공한다(시작 시점의 마을 창고 등).
   * @returns 배치한 건물. 배치할 수 없으면 null.
   */
  place(
    blueprint: Blueprint,
    x: number,
    y: number,
    nodes: NodeBlocker,
    instant = false,
  ): Building | null {
    if (!this.canPlace(blueprint, x, y, nodes).ok) return null;

    const building: Building = {
      id: this.nextId,
      blueprintId: blueprint.id,
      x,
      y,
      buildRemainingMs: instant ? 0 : buildDurationMs(blueprint),
    };
    this.nextId += 1;

    this.buildings.set(building.id, building);
    for (let dy = 0; dy < blueprint.depth; dy += 1) {
      for (let dx = 0; dx < blueprint.width; dx += 1) {
        this.occupancy.set(this.key(x + dx, y + dy), building.id);
      }
    }

    return building;
  }

  /**
   * 저장용 표현으로 바꾼다. 점유 맵은 담지 않는다 — 건물 목록에서 파생되는 값이라
   * 함께 저장하면 둘이 어긋난 저장을 만들 수 있다.
   *
   * @returns 저장 데이터와 다음 번호.
   */
  toSave(): { buildings: BuildingSave[]; nextId: number } {
    const saved: BuildingSave[] = [];

    for (const building of this.buildings.values()) {
      saved.push({
        id: building.id,
        blueprintId: building.blueprintId,
        x: building.x,
        y: building.y,
        buildRemainingMs: building.buildRemainingMs,
      });
    }

    return { buildings: saved, nextId: this.nextId };
  }

  /**
   * 저장에서 건물을 되살린다. 점유 맵은 목록으로 다시 만든다.
   *
   * 배치 판정을 다시 돌리지 않는다 — 저장 시점에 이미 통과한 배치이고, 판정 규칙이
   * 바뀌면 멀쩡한 마을의 건물이 사라져 버린다.
   *
   * @param terrain 지형.
   * @param saved 저장된 건물 목록.
   * @param nextId 다음에 부여할 번호.
   * @returns 되살린 건물 모음.
   */
  static fromSave(terrain: Terrain, saved: readonly BuildingSave[], nextId: number): Buildings {
    const buildings = new Buildings(terrain);

    for (const entry of saved) {
      if (!Number.isInteger(entry.id) || !Number.isInteger(entry.x) || !Number.isInteger(entry.y)) {
        continue;
      }
      if (typeof entry.blueprintId !== 'string') continue;

      let blueprint;
      try {
        blueprint = blueprintById(entry.blueprintId);
      } catch {
        // 없어진 블루프린트를 가리키는 저장은 그 건물만 버린다.
        continue;
      }

      const building: Building = {
        id: entry.id,
        blueprintId: entry.blueprintId,
        x: entry.x,
        y: entry.y,
        buildRemainingMs: Math.max(0, entry.buildRemainingMs ?? 0),
      };

      buildings.buildings.set(building.id, building);
      for (let dy = 0; dy < blueprint.depth; dy += 1) {
        for (let dx = 0; dx < blueprint.width; dx += 1) {
          buildings.occupancy.set(buildings.key(building.x + dx, building.y + dy), building.id);
        }
      }
    }

    buildings.nextId = Math.max(nextId, ...[...buildings.buildings.keys()].map((id) => id + 1), 1);

    return buildings;
  }

  /**
   * 건물을 철거한다. 점유도 함께 해제한다.
   *
   * 자재 환불은 호출부(`Game`)가 처리한다 — 이 클래스는 자재를 모른다.
   *
   * @param id 건물 번호.
   * @returns 철거한 건물. 없는 번호면 null.
   */
  remove(id: number): Building | null {
    const building = this.buildings.get(id);
    if (!building) return null;

    const blueprint = blueprintById(building.blueprintId);
    for (let dy = 0; dy < blueprint.depth; dy += 1) {
      for (let dx = 0; dx < blueprint.width; dx += 1) {
        this.occupancy.delete(this.key(building.x + dx, building.y + dy));
      }
    }
    this.buildings.delete(id);

    return building;
  }

  /**
   * 건축 진행을 한 스텝 처리한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @returns 이번 스텝에 완공된 건물 목록.
   */
  update(stepMs: number): Building[] {
    const completed: Building[] = [];

    for (const building of this.buildings.values()) {
      if (building.buildRemainingMs <= 0) continue;

      building.buildRemainingMs -= stepMs;
      if (building.buildRemainingMs <= 0) {
        building.buildRemainingMs = 0;
        completed.push(building);
      }
    }

    return completed;
  }

  /**
   * 건축 진행도를 0~1로 돌려준다.
   *
   * @param building 대상 건물.
   * @returns 완공이면 1.
   */
  progressOf(building: Building): number {
    const total = buildDurationMs(blueprintById(building.blueprintId));
    if (building.buildRemainingMs <= 0) return 1;

    return Math.max(0, Math.min(1, 1 - building.buildRemainingMs / total));
  }

  /**
   * 그 칸에 인접한 완공 건물을 찾는다. 창고 입출고 판정에 쓴다.
   *
   * @param from 기준 칸.
   * @param blueprintId 찾을 블루프린트. 생략하면 종류를 가리지 않는다.
   * @returns 인접한 완공 건물. 없으면 undefined.
   */
  adjacentCompleted(from: TilePos, blueprintId?: BlueprintId): Building | undefined {
    for (const building of this.buildings.values()) {
      if (building.buildRemainingMs > 0) continue;
      if (blueprintId !== undefined && building.blueprintId !== blueprintId) continue;

      const blueprint = blueprintById(building.blueprintId);
      for (let dy = 0; dy < blueprint.depth; dy += 1) {
        for (let dx = 0; dx < blueprint.width; dx += 1) {
          if (isAdjacent(from, { x: building.x + dx, y: building.y + dy })) return building;
        }
      }
    }

    return undefined;
  }

  /**
   * 칸 좌표를 Map 키로 바꾼다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 키.
   */
  private key(x: number, y: number): number {
    return y * this.terrain.width + x;
  }
}
