import { Inventory } from '../core/Inventory';
import { BlockType } from '../core/blocks';
import {
  BlueprintId,
  blueprintById,
  unlockedBlueprints,
  type Blueprint,
} from '../core/blueprints';
import {
  DayPhase,
  dayNumber,
  dayTint,
  isNight,
  nightAmount,
  phaseAt,
  timeOfDay,
} from '../core/daycycle';
import { ItemType, blockToItem, itemLabel, itemToBlock } from '../core/items';
import { isWorkplace, jobDefinition, jobForWorkplace } from '../core/jobs';
import { lookById, nextLook, unlockedLooks } from '../core/looks';
import { DEFEAT_REWARD } from '../core/monsters';
import { MapId, isVillageMap, mapLabel, mapSeed } from '../core/maps';
import { canInteract, walkableNeighbors, type TilePos } from '../core/movement';
import { nodeDefinition, type NodeKind } from '../core/resourceNodes';
import { Terrain } from '../core/Terrain';
import { generateCave } from '../core/terrainGen';
import { canDigBlock, tierSpeedMultiplier } from '../core/tools';
import { requestMessage, type VillageRequest } from '../core/requests';
import { SAVE_VERSION, isSaveData, type SaveData } from '../core/save';
import {
  bonusMultiplier,
  describeUnlock,
  GOAL_VILLAGE_LEVEL,
  isMapUnlocked,
  isZoneUnlocked,
  jobSlotsAtLevel,
  towerRangeBonus,
  levelForScore,
  levelProgress,
  nextThreshold,
  toolTierAtLevel,
  unlocksAtLevel,
  villageScore,
  MAX_VILLAGE_LEVEL,
} from '../core/village';
import { distanceFromCenter, zoneAt } from '../core/zones';
import { DARK_RADIUS, LIT_RADIUS, MAX_DARKNESS } from '../core/light';
import type { Atmosphere, Entity, GhostPreview } from '../render/WorldRenderer';
import { Buildings, type Building, type PlacementFailure } from './Buildings';
import { Player } from './Player';
import { Guidance } from './Guidance';
import type { GuidanceState } from '../core/guidance';
import { Population, type Migration } from './Population';
import { RequestBoard, type RequestCompletion } from './Requests';
import { Raid } from './Raid';
import { ResourceField } from './ResourceField';

/** UI로 알릴 사건의 종류. 문구·소리·연출을 고르는 데 쓴다. */
export type NoticeCue =
  /** 몬스터가 몰려왔다. */
  | 'raid'
  /** 건물이 손상됐다. */
  | 'damage'
  /** 주민이 일터에 배정되거나 풀렸다. */
  | 'job'
  /** 다른 맵으로 이동했다. */
  | 'travel'
  | 'migration'
  | 'levelUp'
  | 'unlock'
  | 'requestNew'
  | 'requestDone'
  | 'buildDone';

/** UI로 알릴 사건 하나. */
export interface Notice {
  /** 표시 문구. */
  message: string;
  /** 강조 색. */
  tone: 'neutral' | 'good' | 'bad';
  /** 사건 종류. 소리와 연출을 고르는 데 쓴다. */
  cue?: NoticeCue;
}

/** 행동이 거절된 이유. UI 안내 문구로 옮긴다. */
export type ActionFailure =
  /** 바꿀 외형이 아직 없다. */
  | 'noLook'
  /** 고칠 것이 없다(성한 건물이다). */
  | 'notDamaged'
  /** 일터가 아닌 건물이다. */
  | 'noWorkplace'
  /** 일터의 자리가 찼다. */
  | 'jobFull'
  /** 배정할 주민이 없다. */
  | 'noWorker'
  /** 마을이 없는 맵에서는 할 수 없는 일이다(건축·철거). */
  | 'notVillage'
  /** 통로 위에 서 있지 않다. */
  | 'notPortal'
  /** 아직 열리지 않은 맵이다. */
  | 'mapLocked'
  /** 이동·휘두르기 중이라 새 행동을 받을 수 없다. */
  | 'busy'
  /** 대상이 인접 칸이 아니다. */
  | 'notAdjacent'
  /** 대상 칸에 팔 것이 없다. */
  | 'empty'
  /** 현재 도구로는 그 블록을 팔 수 없다. */
  | 'wrongTool'
  /** 놓을 블록을 갖고 있지 않다. */
  | 'noMaterial'
  /** 인벤토리에 자리가 없다. */
  | 'inventoryFull'
  /** 아직 열리지 않은 채집 구역이다. */
  | 'zoneLocked'
  /** 그 자리에는 놓을 수 없다(높이 상한, 노드가 막고 있음 등). */
  | 'blocked'
  /** 건축 모드가 아니거나 블루프린트를 고르지 않았다. */
  | 'noBlueprint'
  /** 그 자리에 건물을 세울 수 없다. 구체적 이유는 placement에 담긴다. */
  | 'badPlacement'
  /** 그 자리에 철거할 건물이 없다. */
  | 'noBuilding'
  /** 마지막 창고는 철거할 수 없다. */
  | 'lastStorage';

/** 행동 결과. 성공이면 무엇이 일어났는지 함께 알린다. */
export type ActionResult =
  | {
      ok: true;
      /** 파낸 블록. 지형을 팠을 때만 있다. */
      block?: BlockType;
      /** 얻은 아이템. 채집이나 파기로 손에 들어온 것이 있을 때만 있다. */
      gained?: { item: ItemType; amount: number };
      /** 타격한 자원 노드 종류. 채집이었을 때만 있다. */
      node?: NodeKind;
      /** 노드를 부쉈는지. 채집이었을 때만 의미가 있다. */
      destroyed?: boolean;
      /** 착공한 건물. 건축이었을 때만 있다. */
      building?: Building;
    }
  | { ok: false; reason: ActionFailure; placement?: PlacementFailure };

/**
 * 게임 진행 상태를 한데 모은 오케스트레이터.
 *
 * 지형·플레이어·보유 자원을 소유하고, 입력에서 들어온 의도를 규칙에 맞춰
 * 적용한다. DOM과 렌더링을 전혀 모르므로 단위 테스트가 가능하다 — 조작 규칙이
 * 늘어날수록 이 분리의 이득이 커진다.
 */
/**
 * 밤에 밝게 남는 반경(타일).
 *
 * 처음에는 8칸이었는데, 브라우저에서 보니 **확대 상태에서 화면 대부분이 밝은 반경 안**이라
 * 한밤 22시가 흐린 낮처럼 보였다. 5칸으로 줄여 밤이 화면에 드러나게 한다. 동굴(5칸)과
 * 같은 반경이지만 세기가 훨씬 옅어(0.45 대 0.8) 마을을 돌아다니는 데는 지장이 없다.
 */
const NIGHT_LIT_RADIUS = 5;

/** 밤에 가장 어두워지는 반경(타일). */
const NIGHT_DARK_RADIUS = 14;

/** 한밤에 가장 어두운 곳의 불투명도. 동굴(0.8)보다 옅다. */
const MAX_NIGHT_DARKNESS = 0.45;

/** 맵 하나가 들고 있는 것. */
interface WorldMapState {
  /** 그 맵의 지형. */
  terrain: Terrain;
  /** 그 맵의 자원 노드. */
  resources: ResourceField;
  /** 반대편 맵으로 통하는 칸. */
  portal: TilePos;
}

export class Game {
  /**
   * 다녀온 맵들.
   *
   * 지상은 처음부터 있고, 동굴은 **처음 들어갈 때 시드에서 만들어진다.** 미리 만들지
   * 않는 이유는 두 가지다 — 가 보지 않은 맵을 들고 있을 이유가 없고, 단위 테스트가
   * 작은 지형 하나만으로 게임을 세울 수 있어야 한다.
   */
  private readonly maps = new Map<MapId, WorldMapState>();

  /** 지금 있는 맵. */
  private current: MapId = MapId.SURFACE;

  /** 플레이어. */
  readonly player: Player;
  /** 플레이어 인벤토리. */
  readonly inventory = new Inventory();
  /** 마을 공용 창고. 슬롯과 스택 상한이 인벤토리보다 넉넉하다. */
  readonly storage = new Inventory({ slotCount: 24, stackLimit: 99 });
  /** 마을 건물. */
  readonly buildings: Buildings;
  /** 시작 시점에 놓인 창고 건물. 저장에서 되살릴 때는 저장된 창고로 대체된다. */
  readonly startingStorage: Building;
  /** 마을 주민. */
  readonly population: Population;
  /** 주민 요청 게시판. */
  readonly requests: RequestBoard;
  /** 첫 플레이 안내. */
  readonly guidance = new Guidance();

  /** 밤의 침입. */
  readonly raid: Raid;

  /**
   * 이번 프레임에 UI로 알릴 사건들.
   *
   * 게임 규칙과 알림 표시를 분리하기 위해, `Game`은 사건을 쌓아 두고 UI가
   * 꺼내 가게 한다. 이렇게 두면 규칙을 단위 테스트로 검증할 때 DOM이 필요 없다.
   *
   * `cue`는 "무슨 일인가"를 값으로 알린다. UI가 그것을 문구·소리·연출 어디에 쓸지
   * 정한다 — 규칙이 소리를 알 필요는 없다.
   */
  private readonly pendingNotices: Array<Notice> = [];

  /** 건축 모드에서 고른 블루프린트. 건축 모드가 아니면 null. */
  private selectedBlueprint: Blueprint | null = null;

  /** 마을 레벨. Phase 8에서 마을 상태가 이 값을 관리한다. */
  private level = 1;

  /** 요청 완료로 누적된 마을 경험치. Phase 8의 레벨 산정에 쓴다. */
  private villageExperience = 0;

  /** 시뮬레이션 누적 시간(ms). 저장과 연출 시각에 쓴다. */
  private elapsed = 0;

  /** 지형·자원 생성에 쓴 시드. 저장에 함께 담아 재현과 디버깅에 쓴다. */
  private seed = 0;

  /**
   * 주민별 생산 진행도(ms).
   *
   * 저장하지 않는다 — 한 번 만드는 데 걸리는 시간의 일부일 뿐이라, 잃어도 손해가
   * 자원 한 개 미만이다. 저장 형식을 늘릴 값이 아니다.
   */
  private readonly jobProgressMs = new Map<number, number>();

  /** 쌓기에 쓸 아이템의 우선순위. 흙을 먼저 쓰고 없으면 돌을 쓴다. */
  private readonly placePriority: readonly ItemType[] = [ItemType.DIRT, ItemType.STONE];

  /** 렌더러에 넘길 오브젝트 버퍼. 프레임마다 새 배열을 만들지 않는다. */
  private readonly entityBuffer: Entity[] = [];

  /**
   * @param terrain 지형.
   * @param resources 자원 노드. 생략하면 시드 1로 배치한다.
   * @param options `restoring`이면 시작 창고를 세우지 않는다 — 저장에서 되살리는 중이라
   *   곧바로 갈아 끼울 것이기 때문이다.
   */
  constructor(terrain: Terrain, resources?: ResourceField, options: { restoring?: boolean } = {}) {
    const surfaceResources = resources ?? new ResourceField(terrain);
    this.maps.set(MapId.SURFACE, {
      terrain,
      resources: surfaceResources,
      portal: findPortalTile(terrain, surfaceResources),
    });

    const start = findStartTile(terrain, surfaceResources);
    this.player = new Player(start.x, start.y);

    this.buildings = new Buildings(terrain);

    // 시작 창고를 마을 중심에 즉시 완공 상태로 세운다. 저장할 곳이 없으면
    // 첫 채집부터 인벤토리가 막혀 루프가 시작되지 않는다.
    this.startingStorage = options.restoring
      ? ({
          id: 0,
          blueprintId: BlueprintId.WAREHOUSE,
          x: start.x,
          y: start.y,
          buildRemainingMs: 0,
          damage: 0,
          look: 0,
        })
      : placeStartingStorage(this.buildings, surfaceResources, terrain, start);

    this.population = new Population(terrain, this.buildings);
    this.requests = new RequestBoard(this.buildings, this.population);
    this.raid = new Raid(terrain, this.buildings);
  }

  /**
   * 맵 상태를 가져온다. 동굴은 처음 물을 때 만들어진다.
   *
   * @param id 맵 종류.
   * @returns 그 맵의 상태.
   */
  private mapState(id: MapId): WorldMapState {
    const existing = this.maps.get(id);
    if (existing) return existing;

    const surface = this.maps.get(MapId.SURFACE)!;
    const terrain = generateCave(surface.terrain.width, surface.terrain.height, {
      seed: mapSeed(this.seed, id),
    });
    const resources = new ResourceField(terrain, {
      seed: mapSeed(this.seed, id),
      layout: 'cave',
    });
    const created: WorldMapState = { terrain, resources, portal: findCaveExit(terrain, resources) };

    this.maps.set(id, created);

    return created;
  }

  /** 지금 있는 맵의 지형. */
  get terrain(): Terrain {
    return this.maps.get(this.current)!.terrain;
  }

  /** 지금 있는 맵의 자원 노드. */
  get resources(): ResourceField {
    return this.maps.get(this.current)!.resources;
  }

  /** 지금 있는 맵. */
  get currentMap(): MapId {
    return this.current;
  }

  /** 지금 맵에 마을이 있는지. 건축·철거·예치가 여기에 달려 있다. */
  get inVillage(): boolean {
    return isVillageMap(this.current);
  }

  /**
   * 지금 맵이 어두운지.
   *
   * 규칙은 여기 있고 표현은 렌더러가 한다 — 렌더러는 "동굴"을 모르고 빛의 중심만 받는다.
   */
  get dark(): boolean {
    return this.current === MapId.CAVE;
  }

  /**
   * 하루 안에서의 위치(0~1).
   *
   * **누적 시간에서 파생되므로 저장하지 않는다.** 되살릴 때 누적 시간만 알면 같은 시각이
   * 나온다 — 레벨에서 파생되는 보너스를 저장하지 않는 것과 같은 규칙이다(ADR 0011).
   */
  get timeOfDay(): number {
    return timeOfDay(this.elapsed);
  }

  /** 며칠째인지. 표시에만 쓴다. */
  get dayCount(): number {
    return dayNumber(this.elapsed);
  }

  /** 지금 시간대. */
  get dayPhase(): DayPhase {
    return phaseAt(this.timeOfDay);
  }

  /** 지금이 밤인지. 이후 Phase(직업 시간대·야간 침입)가 이 값을 본다. */
  get isNight(): boolean {
    return isNight(this.timeOfDay);
  }

  /**
   * 화면에 얹을 색조와 빛을 정한다.
   *
   * 두 가지 어둠이 있다 — **동굴의 어둠**은 장소의 성격이고 시간과 무관하며(ADR 0014),
   * **밤의 어둠**은 시간의 성격이고 지상에만 온다. 동굴 안에서는 하늘이 보이지 않으므로
   * 시간대 색조를 얹지 않는다.
   *
   * @returns 렌더러에 넘길 분위기.
   */
  atmosphere(): Atmosphere {
    const pose = this.player.pose(this.terrain);

    if (this.dark) {
      return {
        tint: null,
        light: { ...pose, lit: LIT_RADIUS, dark: DARK_RADIUS, max: MAX_DARKNESS },
      };
    }

    const night = nightAmount(this.timeOfDay);
    if (night <= 0) return { tint: null, light: null };

    // 밤의 시야는 동굴보다 넓고 옅다. 마을을 돌아다니는 것이 막히면 안 된다.
    return {
      tint: dayTint(this.timeOfDay),
      light: {
        ...pose,
        lit: NIGHT_LIT_RADIUS,
        dark: NIGHT_DARK_RADIUS,
        max: MAX_NIGHT_DARKNESS * night,
      },
    };
  }

  /** 지금 맵의 통로 칸. 반대편 맵으로 이어진다. */
  get portal(): TilePos {
    return this.maps.get(this.current)!.portal;
  }

  /** 통로 위에 서 있는지. 안내 문구에 쓴다. */
  get onPortal(): boolean {
    const at = this.player.position;
    const portal = this.portal;

    return at.x === portal.x && at.y === portal.y;
  }

  /**
   * 통로를 타고 반대편 맵으로 간다.
   *
   * 도착 지점은 그쪽 맵의 통로 칸이다 — 나오면 들어간 자리에 서 있게 된다.
   * 떠난 맵의 지형과 노드는 그대로 남아 있고(`maps`가 들고 있다), 마을의 시간도
   * 계속 흐른다. 동굴에 있는 동안 마을이 멈추면 주민과 요청이 얼어붙는다.
   *
   * @returns 행동 결과.
   */
  travel(): ActionResult {
    if (!this.onPortal) return { ok: false, reason: 'notPortal' };

    const destination = this.current === MapId.SURFACE ? MapId.CAVE : MapId.SURFACE;
    // 나오는 길은 언제나 열려 있다. 잠긴 맵에 갇히는 상황을 만들지 않는다.
    if (!isMapUnlocked(destination, this.level)) return { ok: false, reason: 'mapLocked' };
    const arrival = this.mapState(destination);

    this.current = destination;
    this.player.placeAt(arrival.portal.x, arrival.portal.y);

    this.pendingNotices.push({
      message: `${mapLabel(destination)}으로 이동했습니다`,
      tone: 'neutral',
      cue: 'travel',
    });

    return { ok: true };
  }

  /**
   * 시뮬레이션을 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  update(stepMs: number): void {
    this.elapsed += stepMs;
    this.player.update(stepMs);

    // 떠나 있는 맵도 함께 흐른다. 그러지 않으면 동굴에 다녀오는 동안 지상의
    // 나무가 자라지 않아, 오래 있을수록 손해가 되는 이상한 규칙이 생긴다.
    for (const map of this.maps.values()) map.resources.update(stepMs);

    for (const building of this.buildings.update(stepMs)) {
      this.onBuildingCompleted(building);
      this.pendingNotices.push({
        message: `${blueprintById(building.blueprintId).label} 완공`,
        tone: 'good',
        cue: 'buildDone',
      });
    }

    // 낮에만 일한다. 밤에는 집으로 돌아간다(기획서 5.4의 "정해진 시간대").
    const workTime = this.dayPhase === DayPhase.DAY;
    for (const migration of this.population.update(stepMs, workTime)) {
      this.onMigration(migration);
    }

    if (workTime) this.produce(stepMs);

    this.updateRaid(stepMs);

    const board = this.requests.update(stepMs);
    for (const request of board.created) {
      this.pendingNotices.push({ message: requestMessage(request), tone: 'neutral', cue: 'requestNew' });
    }
    for (const completion of board.completed) {
      this.onRequestCompleted(completion);
    }

    this.syncVillageLevel();

    const hint = this.guidance.update(stepMs, this.guidanceState());
    if (hint) this.pendingNotices.push({ message: hint, tone: 'neutral' });
  }

  /**
   * 밤의 침입을 진행하고 결과를 알린다.
   *
   * 침입은 **지상의 일**이다. 동굴에 있는 동안에도 마을에서 벌어지므로 계속 돌린다 —
   * 자리를 비운 사이에 마을이 상하는 것이 이 시스템의 긴장이다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  private updateRaid(stepMs: number): void {
    const events = this.raid.update(stepMs, {
      night: this.isNight,
      day: this.dayCount,
      level: this.level,
      seed: this.seed,
      towerRangeBonus: towerRangeBonus(this.level),
    });

    if (events.started > 0) {
      this.pendingNotices.push({
        message: `몬스터 ${events.started}마리가 마을로 옵니다`,
        tone: 'bad',
        cue: 'raid',
      });
    }

    for (const building of events.damaged) {
      this.pendingNotices.push({
        message: `${blueprintById(building.blueprintId).label}이(가) 손상됐습니다`,
        tone: 'bad',
        cue: 'damage',
      });
    }

    if (events.defeated > 0) this.rewardDefeat(events.defeated);

    if (events.ended) {
      this.pendingNotices.push({ message: '해가 떠 몬스터가 물러갔습니다', tone: 'good' });
    }
  }

  /**
   * 몬스터를 물리친 보상을 준다.
   *
   * 보상은 마을 경험치다. 자원을 주면 채집보다 사냥이 나은 순간이 생기고,
   * 그러면 이 게임이 방어 게임이 된다.
   *
   * @param count 물리친 마릿수.
   */
  private rewardDefeat(count: number): void {
    this.villageExperience += DEFEAT_REWARD * count;
    this.pendingNotices.push({
      message: `몬스터 ${count}마리를 쫓아냈습니다 (+${DEFEAT_REWARD * count})`,
      tone: 'good',
      cue: 'requestDone',
    });
    this.syncVillageLevel();
  }

  /**
   * 손상된 건물을 고친다.
   *
   * 자재는 원래 필요량의 4분의 1(올림)이다. 공짜면 손상이 아무것도 아니게 되고,
   * 전액이면 다시 짓는 편이 나아 수리라는 선택지가 사라진다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과.
   */
  repairAt(target: TilePos): ActionResult {
    if (!this.inVillage) return { ok: false, reason: 'notVillage' };

    const building = this.buildings.buildingAt(target.x, target.y);
    if (!building) return { ok: false, reason: 'noBuilding' };
    if (building.damage <= 0) return { ok: false, reason: 'notDamaged' };

    const blueprint = blueprintById(building.blueprintId);
    const cost = blueprint.materials.map((material) => ({
      item: material.item,
      amount: Math.max(1, Math.ceil(material.amount / 4)),
    }));

    for (const requirement of cost) {
      if (this.totalHeld(requirement.item) < requirement.amount) {
        return { ok: false, reason: 'noMaterial' };
      }
    }

    for (const requirement of cost) this.consume(requirement.item, requirement.amount);

    this.buildings.repairBuilding(building.id);
    this.pendingNotices.push({
      message: `${blueprint.label}을(를) 고쳤습니다`,
      tone: 'good',
      cue: 'buildDone',
    });

    return { ok: true, building };
  }

  /**
   * 겨냥한 건물의 외형을 다음 것으로 바꾼다.
   *
   * 규칙에는 아무 영향이 없다(기획서 5.3의 외형 슬롯). 열린 외형이 하나뿐이면 바꿀 것이
   * 없다고 알린다 — 아무 일도 안 일어나면 키가 고장 난 것처럼 보인다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과.
   */
  cycleLook(target: TilePos): ActionResult {
    if (!this.inVillage) return { ok: false, reason: 'notVillage' };

    const building = this.buildings.buildingAt(target.x, target.y);
    if (!building) return { ok: false, reason: 'noBuilding' };
    if (unlockedLooks(this.level).length <= 1) return { ok: false, reason: 'noLook' };

    const next = nextLook(building.look, this.level);
    this.buildings.setLook(building.id, next);
    this.pendingNotices.push({
      message: `${blueprintById(building.blueprintId).label} — ${lookById(next).label}`,
      tone: 'neutral',
    });

    return { ok: true, building };
  }

  /**
   * 겨냥한 칸의 몬스터를 때린다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과. 몬스터가 없으면 null.
   */
  private strikeAt(target: TilePos): ActionResult | null {
    if (!this.raid.occupies(target)) return null;
    if (!this.player.idle) return { ok: false, reason: 'busy' };
    if (!canInteract(this.terrain, this.player.position, target)) {
      return { ok: false, reason: 'notAdjacent' };
    }

    const result = this.raid.hitAt(target);
    if (!result) return null;

    this.player.trySwing();
    if (result.defeated) this.rewardDefeat(1);

    return { ok: true };
  }

  /**
   * 배정된 주민들이 자원을 만든다.
   *
   * 만들어진 것은 **창고로 간다.** 인벤토리로 보내면 플레이어가 어디에 있든 짐이 늘어
   * 채집을 방해한다. 창고가 가득 차면 그 몫은 그냥 나오지 않는다 — 넘치는 자원을
   * 어딘가에 쌓아 두면 그것을 비우는 일이 또 하나의 잡일이 된다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  private produce(stepMs: number): void {
    for (const npc of this.population.all) {
      const buildingId = npc.jobBuildingId;
      if (buildingId === null) continue;

      const building = this.buildings.buildingById(buildingId);
      // 손상된 일터는 생산을 멈춘다. 고칠 이유가 그것이다.
      if (!building || building.buildRemainingMs > 0 || building.damage > 0) continue;

      const job = jobForWorkplace(building.blueprintId);
      if (!job) continue;

      const definition = jobDefinition(job);
      // 생산 속도 보너스는 레벨에서 파생된다(ADR 0011의 규칙). 간격을 줄이는 방식이다.
      const interval = definition.intervalMs / bonusMultiplier('production', this.level);
      const progress = (this.jobProgressMs.get(npc.id) ?? 0) + stepMs;
      if (progress < interval) {
        this.jobProgressMs.set(npc.id, progress);
        continue;
      }

      // 남는 시간은 다음 몫으로 넘긴다. 프레임 길이에 생산량이 좌우되지 않게 한다.
      this.jobProgressMs.set(npc.id, progress - interval);

      const added = this.storage.add(definition.produces, definition.amount);
      if (added > 0) {
        this.pendingNotices.push({
          message: `${definition.label}가 ${itemLabel(definition.produces)} ${added}개를 냈습니다`,
          tone: 'neutral',
        });
      }
    }
  }

  /** 일터 한 채가 받는 자리 수. 마을 레벨에서 파생된다 — 저장하지 않는다. */
  get slotsPerWorkplace(): number {
    return jobSlotsAtLevel(this.level);
  }

  /** 일터 자리 현황. HUD 표시에 쓴다. */
  get jobSlots(): { assigned: number; total: number } {
    const perBuilding = this.slotsPerWorkplace;
    let total = 0;
    for (const building of this.buildings.all) {
      if (building.buildRemainingMs > 0) continue;
      if (isWorkplace(building.blueprintId)) total += perBuilding;
    }

    return { assigned: this.population.employed, total };
  }

  /**
   * 대상 칸의 일터에 주민을 배정하거나 뺀다.
   *
   * 한 키로 배정과 해제를 모두 처리한다 — 자리가 비어 있으면 넣고, 차 있으면 뺀다.
   * 일터 하나에 자리가 하나뿐이라 이 방식으로 모호함이 생기지 않는다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과.
   */
  toggleWorker(target: TilePos): ActionResult {
    if (!this.inVillage) return { ok: false, reason: 'notVillage' };

    const building = this.buildings.buildingAt(target.x, target.y);
    if (!building) return { ok: false, reason: 'noBuilding' };
    if (!isWorkplace(building.blueprintId)) return { ok: false, reason: 'noWorkplace' };
    if (building.buildRemainingMs > 0) return { ok: false, reason: 'noBuilding' };

    const job = jobForWorkplace(building.blueprintId)!;
    const label = jobDefinition(job).label;

    const working = this.population.workersAt(building.id);
    // 자리가 남아 있으면 더 넣고, 꽉 찼으면 한 명을 뺀다.
    if (working.length >= this.slotsPerWorkplace) {
      const removed = this.population.unassign(building.id);
      if (removed) this.jobProgressMs.delete(removed.id);
      this.pendingNotices.push({ message: `${label}를 그만두었습니다`, tone: 'neutral', cue: 'job' });

      return { ok: true };
    }

    if (this.population.idleWorkers.length === 0) return { ok: false, reason: 'noWorker' };

    const assigned = this.population.assign(building, this.slotsPerWorkplace);
    if (!assigned) return { ok: false, reason: 'jobFull' };

    this.jobProgressMs.set(assigned.id, 0);
    this.pendingNotices.push({ message: `주민이 ${label}가 되었습니다`, tone: 'good', cue: 'job' });

    return { ok: true };
  }

  /**
   * 안내 규칙에 넘길 상태 요약을 만든다.
   *
   * @returns 상태 요약.
   */
  guidanceState(): GuidanceState {
    return {
      wood: this.totalHeld(ItemType.WOOD),
      stone: this.totalHeld(ItemType.STONE),
      carried: this.inventory.total,
      nearStorage: this.nearStorage,
      houses: this.buildings.sumCompleted((blueprint) => (blueprint.housing > 0 ? 1 : 0)),
      residents: this.population.count,
      buildings: this.buildings.completedCount,
      requests: this.requests.requests.length,
      payableRequests: this.requests.requests.filter((request) => this.canFulfill(request)).length,
      level: this.level,
      goalLevel: this.goalLevel,
      buildMode: this.buildMode,
      blueprintCount: this.availableBlueprints.length,
      onPortal: this.onPortal,
      night: this.isNight,
      openJobs: Math.max(0, this.jobSlots.total - this.jobSlots.assigned),
      raiding: this.inVillage && this.raid.active,
      // 수리는 마을에서만 할 수 있다. 동굴에서 안내가 뜨면 할 수 없는 일을 시키는 셈이다.
      damagedBuildings: this.inVillage ? this.buildings.damagedCount : 0,
      hasDeposited: this.guidance.hasDeposited,
    };
  }

  /** 마을 점수. 건물·주민·요청 보상을 합산한 누적치다(기획서 6절). */
  get villageScore(): number {
    return villageScore({
      houses: this.buildings.sumCompleted((blueprint) => (blueprint.housing > 0 ? 1 : 0)),
      facilityTypes: this.buildings.completedTypes((blueprint) => blueprint.housing === 0).size,
      residents: this.population.count,
      requestExperience: this.villageExperience,
    });
  }

  /** 다음 레벨까지의 진행도(0~1). 최대 레벨이면 1이다. */
  get levelProgress(): number {
    return levelProgress(this.villageScore, this.level);
  }

  /** 다음 레벨에 필요한 점수. 최대 레벨이면 null. */
  get nextLevelScore(): number | null {
    return nextThreshold(this.level);
  }

  /** 1차 목표 레벨. 상단에 상시 노출한다(기획서 6절). 최대 레벨과는 다르다. */
  get goalLevel(): number {
    return GOAL_VILLAGE_LEVEL;
  }

  /**
   * 점수에 맞춰 레벨을 올리고 해금을 적용한다.
   *
   * 레벨은 점수에서 파생되는 값이므로 따로 저장하지 않고 매 스텝 확인한다.
   * 점수가 줄어드는 경로는 없으므로 레벨이 내려가는 일도 없다.
   */
  private syncVillageLevel(): void {
    const target = levelForScore(this.villageScore);
    while (this.level < target) {
      this.level += 1;
      this.applyUnlocks(this.level);
    }
  }

  /**
   * 그 레벨의 해금을 적용하고 알림을 쌓는다.
   *
   * @param level 도달한 레벨.
   */
  private applyUnlocks(level: number): void {
    this.pendingNotices.push({ message: `마을 레벨 ${level} 달성`, tone: 'good', cue: 'levelUp' });

    for (const unlock of unlocksAtLevel(level)) {
      this.applyUnlock(unlock);
      this.pendingNotices.push({ message: `해금: ${describeUnlock(unlock)}`, tone: 'good', cue: 'unlock' });
    }
  }

  /**
   * 해금 항목 하나를 실제 상태에 반영한다.
   *
   * 배수형 보너스(이동·채집)는 레벨에서 파생되므로 여기서 다시 계산해 넣는다 —
   * 저장에 담지 않아도 되살릴 때 같은 값이 나온다.
   *
   * @param unlock 해금 항목.
   */
  private applyUnlock(unlock: ReturnType<typeof unlocksAtLevel>[number]): void {
    switch (unlock.kind) {
      case 'tool':
        this.player.upgradeTool(unlock.tool, unlock.tier);
        break;
      case 'inventory':
        this.inventory.expand(unlock.slots);
        break;
      case 'storage':
        this.storage.expand(unlock.slots);
        break;
      case 'speed':
        this.player.setSpeedMultiplier(bonusMultiplier('speed', this.level));
        break;
      case 'harvest':
        // 채집 보너스는 타격할 때 읽으므로 따로 반영할 상태가 없다.
        break;
      default:
        break;
    }
  }

  /**
   * 쌓인 알림을 꺼내 간다. 꺼내면 목록은 비워진다.
   *
   * @returns 이번에 표시할 알림 목록.
   */
  drainNotices(): Notice[] {
    return this.pendingNotices.splice(0, this.pendingNotices.length);
  }

  /** 지금까지 완료한 요청 수. 마을 레벨 산정에 쓴다. */
  get completedRequestCount(): number {
    return this.requests.completedCount;
  }

  /**
   * 지금 낼 수 있는 납품 요청을 낸다. 단축키 하나로 처리하기 위한 것이다.
   *
   * @returns 완료한 요청. 낼 수 있는 요청이 없으면 null.
   */
  fulfillRequest(): RequestCompletion | null {
    const payable = this.requests.findPayableDelivery((item, amount) => this.totalHeld(item) >= amount);
    if (!payable) return null;

    const completion = this.requests.fulfillDelivery(
      payable.id,
      (item, amount) => this.totalHeld(item) >= amount,
      (item, amount) => {
        this.consume(item, amount);
      },
    );

    if (completion) this.onRequestCompleted(completion);

    return completion;
  }

  /**
   * 요청을 낼 수 있는지 확인한다. UI 강조에 쓴다.
   *
   * @param request 대상 요청.
   * @returns 낼 수 있으면 true.
   */
  canFulfill(request: VillageRequest): boolean {
    if (request.kind !== 'deliver') return false;

    return this.totalHeld(request.item) >= request.amount;
  }

  /**
   * 주민이 이주했을 때의 처리.
   *
   * @param migration 이주 결과.
   */
  private onMigration(migration: Migration): void {
    // 기획서 5.4: 대사 없이 알림만 표시한다.
    this.pendingNotices.push({ message: '새 주민이 이주했습니다', tone: 'good', cue: 'migration' });
    void migration;
  }

  /**
   * 요청이 완료됐을 때의 처리.
   *
   * @param completion 완료 결과.
   */
  private onRequestCompleted(completion: RequestCompletion): void {
    this.villageExperience += completion.reward;
    this.pendingNotices.push({
      message: `요청 완료 (+${completion.reward})`,
      tone: 'good',
      cue: 'requestDone',
    });
  }

  /** 시뮬레이션 누적 시간(ms). */
  get elapsedMs(): number {
    return this.elapsed;
  }

  /** 지형·자원 생성에 쓴 시드. */
  get worldSeed(): number {
    return this.seed;
  }

  /**
   * 시드를 기록한다. 생성 직후 한 번만 부른다.
   *
   * @param seed 시드.
   */
  setWorldSeed(seed: number): void {
    this.seed = seed;
  }

  /**
   * 지금 상태를 저장 데이터로 만든다.
   *
   * @returns 저장 데이터.
   */
  toSave(): SaveData {
    const buildings = this.buildings.toSave();
    const npcs = this.population.toSave();
    const requests = this.requests.toSave();

    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      seed: this.seed,
      // 다녀온 맵만 담는다. 가 보지 않은 맵은 시드에서 다시 만들어진다.
      maps: [...this.maps.entries()].map(([id, map]) => ({
        id,
        terrain: map.terrain.toSave(),
        nodes: map.resources.toSave(),
      })),
      currentMap: this.current,
      player: this.player.toSave(),
      inventory: this.inventory.toSave(),
      storage: this.storage.toSave(),
      buildings: buildings.buildings,
      nextBuildingId: buildings.nextId,
      npcs: npcs.npcs,
      nextNpcId: npcs.nextId,
      requests: requests.requests,
      nextRequestId: requests.nextId,
      completedRequests: requests.completed,
      requestTimerMs: requests.timerMs,
      level: this.level,
      experience: this.villageExperience,
      elapsedMs: this.elapsed,
      raid: this.raid.toSave(),
      seenHints: this.guidance.seenHints,
      hasDeposited: this.guidance.hasDeposited,
    };
  }

  /**
   * 저장에서 게임을 되살린다.
   *
   * "상태를 그대로 되살리는 것"이 아니라 **저장값으로 객체를 다시 조립하는 것**이다.
   * 점유 맵처럼 다른 값에서 파생되는 자료구조는 저장하지 않고 조립 과정에서 다시 만든다 —
   * 파생값을 저장하면 원본과 어긋난 저장이 생길 수 있다.
   *
   * @param data 저장 데이터.
   * @returns 되살린 게임. 읽을 수 없으면 null.
   */
  static fromSave(data: unknown): Game | null {
    if (!isSaveData(data)) return null;

    // 마을은 지상에 있으므로 지상 지형이 없으면 되살릴 것이 없다.
    const surfaceSave = data.maps.find((map) => map.id === MapId.SURFACE);
    if (!surfaceSave) return null;

    const terrain = Terrain.fromSave(surfaceSave.terrain);
    if (!terrain) return null;

    const resources = ResourceField.fromSave(terrain, surfaceSave.nodes);
    const player = Player.fromSave(data.player);
    const inventory = Inventory.fromSave(data.inventory);
    const storage = Inventory.fromSave(data.storage);
    if (!player || !inventory || !storage) return null;

    const buildings = Buildings.fromSave(terrain, data.buildings, data.nextBuildingId);

    // 창고가 하나도 없으면 저장이 손상된 것이다. 저장할 곳이 없으면 진행이 막힌다.
    let startingStorage: Building | null = null;
    for (const building of buildings.all) {
      if (blueprintById(building.blueprintId).storageSlots > 0) {
        startingStorage = building;
        break;
      }
    }
    if (!startingStorage) return null;

    const game = new Game(terrain, resources, { restoring: true });
    game.seed = Number.isFinite(data.seed) ? data.seed : 0;
    game.assignRestored({
      player,
      inventory,
      storage,
      buildings,
      startingStorage,
      npcs: data.npcs,
      nextNpcId: data.nextNpcId,
      level: Math.max(1, Math.floor(data.level)),
      experience: Math.max(0, Math.floor(data.experience)),
      elapsedMs: Number.isFinite(data.elapsedMs) ? data.elapsedMs : 0,
    });
    game.requests.restore({
      requests: data.requests,
      nextId: data.nextRequestId,
      completed: data.completedRequests,
      timerMs: data.requestTimerMs,
    });
    game.guidance.restore(data.seenHints, data.hasDeposited);
    game.raid.restore(data.raid);
    game.restoreMaps(data);

    return game;
  }

  /**
   * 지상 말고 다녀왔던 맵들을 되살리고, 있던 자리로 돌려놓는다.
   *
   * 지형은 저장값으로 되살리지만 **통로 위치는 다시 계산한다** — 지형에서 파생되는
   * 값이므로 저장하면 저장과 파생이 어긋날 수 있다(로드맵 02 Phase 1의 원칙).
   *
   * @param data 저장 데이터.
   */
  private restoreMaps(data: SaveData): void {
    for (const saved of data.maps) {
      if (saved.id === MapId.SURFACE) continue;

      const terrain = Terrain.fromSave(saved.terrain);
      if (!terrain) continue;

      const resources = ResourceField.fromSave(terrain, saved.nodes);
      this.maps.set(saved.id, { terrain, resources, portal: findCaveExit(terrain, resources) });
    }

    // 저장된 맵에 있을 때만 그 맵으로 돌아간다. 없으면 지상에서 시작한다.
    if (this.maps.has(data.currentMap)) this.current = data.currentMap;
  }

  /**
   * 되살린 부품들을 게임에 끼워 넣는다.
   *
   * 생성자가 만든 기본 부품을 갈아 끼우는 자리다. 필드가 `readonly`인 것들은 저장 복원에서만
   * 바뀌므로, 이 한 곳에 모아 두고 다른 경로에서는 손대지 않는다.
   *
   * @param parts 되살린 부품들.
   */
  private assignRestored(parts: {
    player: Player;
    inventory: Inventory;
    storage: Inventory;
    buildings: Buildings;
    startingStorage: Building;
    npcs: SaveData['npcs'];
    nextNpcId: number;
    level: number;
    experience: number;
    elapsedMs: number;
  }): void {
    const mutable = this as {
      player: Player;
      inventory: Inventory;
      storage: Inventory;
      buildings: Buildings;
      startingStorage: Building;
      population: Population;
      requests: RequestBoard;
    };

    mutable.player = parts.player;
    mutable.inventory = parts.inventory;
    mutable.storage = parts.storage;
    mutable.buildings = parts.buildings;
    mutable.startingStorage = parts.startingStorage;
    mutable.population = Population.fromSave(
      this.terrain,
      parts.buildings,
      parts.npcs,
      parts.nextNpcId,
    );
    mutable.requests = new RequestBoard(parts.buildings, mutable.population);

    this.level = parts.level;
    this.villageExperience = parts.experience;
    this.elapsed = parts.elapsedMs;

    // 배수형 보너스는 저장하지 않고 레벨에서 다시 계산한다. 슬롯 확장은 저장된
    // 슬롯 수에 이미 반영돼 있으므로 다시 늘리지 않는다.
    this.player.setSpeedMultiplier(bonusMultiplier('speed', this.level));
  }

  /** 현재 마을 레벨. */
  get villageLevel(): number {
    return this.level;
  }

  /** 요청 완료로 누적된 마을 경험치. */
  get experience(): number {
    return this.villageExperience;
  }

  /**
   * 마을 레벨을 직접 설정한다.
   *
   * 정상 진행에서는 점수에서 파생되지만(`syncVillageLevel`), 테스트에서 상위
   * 콘텐츠를 바로 확인하려면 필요하다. 올릴 때는 해금도 함께 적용한다.
   *
   * @param level 새 레벨. 1 이상의 정수.
   */
  setVillageLevel(level: number): void {
    if (!Number.isInteger(level) || level < 1) return;

    const target = Math.min(MAX_VILLAGE_LEVEL, level);
    while (this.level < target) {
      this.level += 1;
      this.player.upgradeTool(this.player.tool.kind, toolTierAtLevel(this.player.tool.kind, this.level));
      for (const unlock of unlocksAtLevel(this.level)) this.applyUnlock(unlock);
    }

    this.level = target;

    // 레벨이 내려가는 경우(테스트 등)에는 고른 블루프린트가 잠길 수 있다.
    if (this.selectedBlueprint && this.selectedBlueprint.unlockLevel > target) {
      this.selectedBlueprint = null;
    }
  }

  /** 지금 지을 수 있는 블루프린트 목록. */
  get availableBlueprints(): Blueprint[] {
    return unlockedBlueprints(this.level);
  }

  /** 건축 모드인지 여부. 블루프린트를 고르면 건축 모드다. */
  get buildMode(): boolean {
    return this.selectedBlueprint !== null;
  }

  /** 고른 블루프린트. 건축 모드가 아니면 null. */
  get blueprint(): Blueprint | null {
    return this.selectedBlueprint;
  }

  /**
   * 블루프린트를 고른다. 같은 것을 다시 고르면 건축 모드를 끈다 —
   * 버튼 하나로 켜고 끌 수 있게 하려는 것이다.
   *
   * @param id 블루프린트 식별자. null이면 건축 모드를 끈다.
   * @returns 건축 모드가 켜졌으면 true.
   */
  selectBlueprint(id: BlueprintId | null): boolean {
    if (id === null) {
      this.selectedBlueprint = null;
      return false;
    }

    const blueprint = blueprintById(id);
    if (blueprint.unlockLevel > this.level) return false;

    this.selectedBlueprint = this.selectedBlueprint?.id === id ? null : blueprint;

    return this.selectedBlueprint !== null;
  }

  /**
   * 자재가 충분한지 확인한다. 인벤토리와 창고를 합쳐 센다(기획서 5.3).
   *
   * @param blueprint 블루프린트.
   * @returns 부족한 자재 목록. 비어 있으면 충분하다.
   */
  missingMaterials(blueprint: Blueprint): Array<{ item: ItemType; short: number }> {
    const missing: Array<{ item: ItemType; short: number }> = [];

    for (const requirement of blueprint.materials) {
      const short = requirement.amount - this.totalHeld(requirement.item);
      if (short > 0) missing.push({ item: requirement.item, short });
    }

    return missing;
  }

  /**
   * 지금 커서 위치에 보일 건축 미리보기를 만든다.
   *
   * @param hovered 커서가 올라간 칸. 없으면 null.
   * @returns 미리보기. 건축 모드가 아니거나 커서가 없으면 null.
   */
  ghost(hovered: TilePos | null): GhostPreview | null {
    if (!this.selectedBlueprint || !hovered || !this.inVillage) return null;

    const origin = this.placementOrigin(this.selectedBlueprint, hovered);
    const check = this.buildings.canPlace(
      this.selectedBlueprint,
      origin.x,
      origin.y,
      this.resources,
    );

    return {
      x: origin.x,
      y: origin.y,
      width: this.selectedBlueprint.width,
      depth: this.selectedBlueprint.depth,
      valid: check.ok && this.missingMaterials(this.selectedBlueprint).length === 0,
      label: this.selectedBlueprint.label,
    };
  }

  /**
   * 그 칸이 잠긴 구역인지 확인한다. 화면 표시에 쓴다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 잠겨 있으면 true.
   */
  isZoneLocked(x: number, y: number): boolean {
    // 구역은 마을 중심에서의 거리로 나뉜다(ADR 0005). 동굴에는 마을 중심이 없다.
    if (!this.inVillage) return false;
    if (!this.terrain.contains(x, y)) return false;

    return !isZoneUnlocked(zoneAt(this.terrain, x, y), this.level);
  }

  /**
   * 설계도를 목록에서 다음(또는 이전) 것으로 넘긴다.
   *
   * 숫자 키만으로 고르던 시절에는 **설계도가 아홉 종을 넘으면 고를 수 없었다** —
   * 실제로 아홉에서 딱 찼다. 순환이 있으면 목록이 아무리 길어져도 닿는다.
   *
   * @param step 넘길 방향. 1이면 다음, -1이면 이전.
   * @returns 고른 설계도. 목록이 비었으면 null.
   */
  cycleBlueprint(step: number): Blueprint | null {
    const list = this.availableBlueprints;
    if (list.length === 0) return null;

    const current = this.selectedBlueprint
      ? list.findIndex((blueprint) => blueprint.id === this.selectedBlueprint!.id)
      : -1;

    const size = list.length;
    const next = current < 0 ? (step > 0 ? 0 : size - 1) : (current + step + size) % size;
    this.selectedBlueprint = list[next]!;

    return this.selectedBlueprint;
  }

  /**
   * 고른 블루프린트를 커서 위치에 착공한다.
   *
   * 확정 즉시 자재를 소모하고, 짧은 건축 시간이 지나면 완공된다(기획서 5.3).
   *
   * @param hovered 커서가 올라간 칸.
   * @returns 행동 결과.
   */
  buildAt(hovered: TilePos): ActionResult {
    // 마을은 지상에 있다. 동굴에 집을 지으면 주민도 요청도 갈 곳이 어긋난다.
    if (!this.inVillage) return { ok: false, reason: 'notVillage' };

    const blueprint = this.selectedBlueprint;
    if (!blueprint) return { ok: false, reason: 'noBlueprint' };

    const origin = this.placementOrigin(blueprint, hovered);
    const check = this.buildings.canPlace(blueprint, origin.x, origin.y, this.resources);
    if (!check.ok) return { ok: false, reason: 'badPlacement', placement: check.reason };

    if (this.missingMaterials(blueprint).length > 0) return { ok: false, reason: 'noMaterial' };

    // 자재를 먼저 소모한다. 배치는 이미 판정을 통과했으므로 실패하지 않는다.
    for (const requirement of blueprint.materials) {
      this.consume(requirement.item, requirement.amount);
    }

    const building = this.buildings.place(blueprint, origin.x, origin.y, this.resources);
    if (!building) return { ok: false, reason: 'blocked' };

    return { ok: true, building };
  }

  /**
   * 대상 칸의 건물을 철거한다.
   *
   * 자재는 **절반만** 돌려준다(내림). 전액 환불이면 배치를 고민할 이유가 없고,
   * 환불이 없으면 잘못 놓은 건물이 영구히 부지를 잡아 마을이 막힌다 —
   * 자동 플레이로 실제로 막히는 것을 확인해서 넣은 기능이다.
   *
   * 창고가 하나뿐일 때는 철거하지 않는다. 저장할 곳이 사라지면 첫 채집부터
   * 인벤토리가 막혀 게임이 진행되지 않는다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과. 성공하면 돌려준 자재를 gained에 담지 않고 refunded로 알린다.
   */
  demolishAt(target: TilePos): ActionResult & { refunded?: Array<{ item: ItemType; amount: number }> } {
    if (!this.inVillage) return { ok: false, reason: 'notVillage' };

    const building = this.buildings.buildingAt(target.x, target.y);
    if (!building) return { ok: false, reason: 'noBuilding' };

    const blueprint = blueprintById(building.blueprintId);

    if (blueprint.storageSlots > 0) {
      const storages = this.buildings.completedTypes((candidate) => candidate.storageSlots > 0);
      let storageCount = 0;
      for (const other of this.buildings.all) {
        if (blueprintById(other.blueprintId).storageSlots > 0) storageCount += 1;
      }
      if (storages.size > 0 && storageCount <= 1) return { ok: false, reason: 'lastStorage' };
    }

    this.buildings.remove(building.id);
    // 없어진 일터에 묶인 배정을 푼다. 그러지 않으면 주민이 빈 자리로 출근한다.
    this.population.releaseWorkplace(building.id);

    // 절반 환불. 인벤토리를 먼저 채우고 남으면 창고로 보낸다.
    const refunded: Array<{ item: ItemType; amount: number }> = [];
    for (const requirement of blueprint.materials) {
      const amount = Math.floor(requirement.amount / 2);
      if (amount < 1) continue;

      const leftover = this.inventory.add(requirement.item, amount);
      if (leftover > 0) this.storage.add(requirement.item, leftover);
      refunded.push({ item: requirement.item, amount });
    }

    return { ok: true, refunded };
  }

  /**
   * 커서 칸을 기준으로 점유 영역의 좌상단을 구한다.
   *
   * 커서를 영역의 **중앙**으로 삼는다. 좌상단을 기준으로 하면 큰 건물이 커서에서
   * 멀리 떨어져 보여 배치 감각이 어긋난다.
   *
   * @param blueprint 블루프린트.
   * @param hovered 커서가 올라간 칸.
   * @returns 점유 영역 좌상단.
   */
  private placementOrigin(blueprint: Blueprint, hovered: TilePos): TilePos {
    return {
      x: hovered.x - Math.floor((blueprint.width - 1) / 2),
      y: hovered.y - Math.floor((blueprint.depth - 1) / 2),
    };
  }

  /**
   * 건물이 완공됐을 때의 처리.
   *
   * @param building 완공된 건물.
   */
  private onBuildingCompleted(building: Building): void {
    const blueprint = blueprintById(building.blueprintId);

    // 창고를 지으면 저장 공간이 늘어난다.
    if (blueprint.storageSlots > 0) this.storage.expand(blueprint.storageSlots);
  }

  /**
   * 플레이어 이동을 시도한다.
   *
   * @param dx x 방향 델타.
   * @param dy y 방향 델타.
   * @returns 이동을 시작했으면 true.
   */
  movePlayer(dx: number, dy: number): boolean {
    return this.player.tryMove(this.terrain, dx, dy);
  }

  /**
   * 대상 칸에 주 행동을 한다.
   *
   * 그 칸에 살아 있는 자원 노드가 있으면 채집하고, 없으면 지형을 판다.
   * 노드가 지형 위에 서 있으므로 노드를 먼저 처리하는 것이 자연스럽다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과.
   */
  actAt(target: TilePos): ActionResult {
    // 눈앞의 것부터 다룬다: 몬스터 → 고칠 건물 → 자원 → 지형.
    const struck = this.strikeAt(target);
    if (struck) return struck;

    const building = this.inVillage ? this.buildings.buildingAt(target.x, target.y) : undefined;
    if (building && building.damage > 0) return this.repairAt(target);

    if (this.resources.isBlocked(target.x, target.y)) return this.harvestAt(target);

    return this.digAt(target);
  }

  /**
   * 대상 칸의 자원 노드를 채집한다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과. 노드를 부수면 드롭을 함께 돌려준다.
   */
  harvestAt(target: TilePos): ActionResult {
    if (!this.player.idle) return { ok: false, reason: 'busy' };
    if (!canInteract(this.terrain, this.player.position, target)) {
      return { ok: false, reason: 'notAdjacent' };
    }

    // 아직 열리지 않은 구역에서는 채집만 막는다. 이동을 막으면 벽이 필요하고
    // 그 벽이 지형 변형(파기·쌓기)과 충돌한다 — 구역 잠금은 규칙이지 지형이 아니다.
    if (this.inVillage && !isZoneUnlocked(zoneAt(this.terrain, target.x, target.y), this.level)) {
      return { ok: false, reason: 'zoneLocked' };
    }

    // 부서질 타격이라면 드롭이 전부 들어갈 자리가 있는지 먼저 본다. 자리가 없을 때
    // 노드를 부수면 자원이 사라져 버리므로, 타격 자체를 거절하는 편이 낫다.
    const node = this.resources.nodeAt(target.x, target.y);
    if (node && this.willBreak(target)) {
      const definition = nodeDefinition(node.kind);
      if (this.inventory.freeSpaceFor(definition.drop) < definition.dropAmount) {
        return { ok: false, reason: 'inventoryFull' };
      }
    }

    const result = this.resources.harvest(
      target.x,
      target.y,
      this.player.tool,
      bonusMultiplier('harvest', this.level),
    );
    if (!result.ok) {
      if (result.reason === 'wrongTool') return { ok: false, reason: 'wrongTool' };
      return { ok: false, reason: 'empty' };
    }

    this.player.trySwing();

    if (!result.drop) return { ok: true, node: result.kind, destroyed: false };

    this.inventory.add(result.drop.item, result.drop.amount);

    return { ok: true, node: result.kind, destroyed: true, gained: result.drop };
  }

  /**
   * 대상 칸을 판다.
   *
   * 기획서 5.1·5.2에 따라 인접 칸만 대상이며, 블록에 맞는 도구를 들고 있어야 한다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과. 성공하면 파낸 블록을 함께 돌려준다.
   */
  digAt(target: TilePos): ActionResult {
    if (!this.player.idle) return { ok: false, reason: 'busy' };
    if (!canInteract(this.terrain, this.player.position, target)) {
      return { ok: false, reason: 'notAdjacent' };
    }

    if (this.isOccupied(target)) return { ok: false, reason: 'blocked' };

    const surface = this.terrain.surfaceBlock(target.x, target.y);
    if (surface === BlockType.EMPTY) return { ok: false, reason: 'empty' };
    if (!canDigBlock(this.player.tool, surface)) return { ok: false, reason: 'wrongTool' };

    // 파낸 블록이 들어갈 자리가 없으면 파지 않는다 — 파고 나서 잃는 것보다 낫다.
    const expected = blockToItem(surface);
    if (expected !== null && this.inventory.freeSpaceFor(expected) < 1) {
      return { ok: false, reason: 'inventoryFull' };
    }

    const removed = this.terrain.dig(target.x, target.y);
    if (removed === null) return { ok: false, reason: 'empty' };

    this.player.trySwing();

    const item = blockToItem(removed);
    if (item !== null) this.inventory.add(item);

    return {
      ok: true,
      block: removed,
      ...(item !== null ? { gained: { item, amount: 1 } } : {}),
    };
  }

  /**
   * 대상 칸에 블록을 쌓는다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과.
   */
  placeAt(target: TilePos): ActionResult {
    if (!this.player.idle) return { ok: false, reason: 'busy' };
    if (!canInteract(this.terrain, this.player.position, target)) {
      return { ok: false, reason: 'notAdjacent' };
    }

    // 살아 있는 노드나 건물이 있는 칸에는 쌓을 수 없다.
    if (this.resources.isBlocked(target.x, target.y)) return { ok: false, reason: 'blocked' };
    if (this.isOccupied(target)) return { ok: false, reason: 'blocked' };

    const item = this.placePriority.find((candidate) => this.inventory.count(candidate) > 0);
    if (item === undefined) return { ok: false, reason: 'noMaterial' };

    const block = itemToBlock(item);
    if (block === null) return { ok: false, reason: 'noMaterial' };

    if (!this.terrain.place(target.x, target.y, block)) return { ok: false, reason: 'blocked' };

    this.inventory.remove(item);
    this.player.trySwing();

    return { ok: true, block };
  }

  /**
   * 그 칸이 건물로 점유돼 있는지 확인한다.
   *
   * 점유된 칸은 파거나 쌓을 수 없다 — 건물 아래 지형이 바뀌면 건물이 공중에
   * 뜨거나 묻힌다. Phase 6에서 건물이 늘어나면 이 함수가 그 목록까지 본다.
   *
   * @param target 대상 칸.
   * @returns 점유돼 있으면 true.
   */
  isOccupied(target: TilePos): boolean {
    // 건물은 지상에만 있다. 동굴에서 같은 좌표를 점유로 보면 파지도 쌓지도 못하는
    // 칸이 이유 없이 생긴다.
    if (!this.inVillage) return false;

    return this.buildings.isOccupied(target.x, target.y);
  }

  /** 지금 창고에 손이 닿는지 여부. 완공된 창고에 인접해야 한다. */
  get nearStorage(): boolean {
    if (!this.inVillage) return false;

    return this.buildings.adjacentCompleted(this.player.position, BlueprintId.WAREHOUSE) !== undefined;
  }

  /**
   * 인벤토리의 아이템을 창고로 옮긴다.
   *
   * 지형 재료(흙)는 **한 묶음만 남기고** 나머지를 맡긴다. 평탄화 중에 흙까지 전부
   * 예치되면 곧바로 다시 꺼내야 해서 번거롭지만, 반대로 흙을 통째로 제외하면
   * 인벤토리가 흙으로 막혀 다른 자원을 아예 받지 못한다 — 자동 플레이에서 채집이
   * 880번 거절되는 것으로 드러난 문제다.
   *
   * @returns 종류별로 옮긴 개수. 창고에 닿지 않으면 빈 Map.
   */
  depositAll(): Map<ItemType, number> {
    if (!this.nearStorage) return new Map();

    const moved = this.inventory.moveAllTo(this.storage, [ItemType.DIRT]);

    const keep = this.inventory.stackLimit;
    const dirt = this.inventory.count(ItemType.DIRT);
    if (dirt > keep) {
      const sent = this.inventory.moveTo(this.storage, ItemType.DIRT, dirt - keep);
      if (sent > 0) moved.set(ItemType.DIRT, sent);
    }

    if (moved.size > 0) this.guidance.markDeposited();

    return moved;
  }

  /**
   * 창고에서 아이템을 꺼내 인벤토리로 옮긴다.
   *
   * @param item 아이템 종류.
   * @param amount 꺼낼 개수.
   * @returns 실제로 옮긴 개수. 창고에 닿지 않으면 0.
   */
  withdraw(item: ItemType, amount: number): number {
    if (!this.nearStorage) return 0;

    return this.storage.moveTo(this.inventory, item, amount);
  }

  /**
   * 인벤토리와 창고를 합친 보유 수를 센다.
   *
   * 기획서 5.3이 "필요 자재가 인벤토리/창고에 있으면" 건축이 가능하다고 하므로
   * Phase 6의 자재 판정이 이 값을 쓴다.
   *
   * @param item 아이템 종류.
   * @returns 합계 개수.
   */
  totalHeld(item: ItemType): number {
    return this.inventory.count(item) + this.storage.count(item);
  }

  /**
   * 인벤토리를 먼저 쓰고 부족하면 창고에서 채워 자재를 소모한다.
   *
   * @param item 아이템 종류.
   * @param amount 소모할 개수.
   * @returns 소모했으면 true. 합계가 부족하면 아무것도 소모하지 않고 false.
   */
  consume(item: ItemType, amount: number): boolean {
    if (!Number.isInteger(amount) || amount < 1) return false;
    if (this.totalHeld(item) < amount) return false;

    const fromInventory = Math.min(this.inventory.count(item), amount);
    if (fromInventory > 0) this.inventory.remove(item, fromInventory);

    const rest = amount - fromInventory;
    if (rest > 0) this.storage.remove(item, rest);

    return true;
  }

  /**
   * 렌더러에 넘길 오브젝트 목록을 만든다.
   *
   * @returns 이번 프레임의 오브젝트 목록(내부 버퍼).
   */
  /**
   * 이번 타격으로 노드가 부서질지 미리 본다.
   *
   * @param target 대상 칸.
   * @returns 부서질 타격이면 true.
   */
  private willBreak(target: TilePos): boolean {
    const node = this.resources.nodeAt(target.x, target.y);
    if (!node || node.durability <= 0) return false;

    return (
      node.durability - tierSpeedMultiplier(this.player.tool.tier) * bonusMultiplier('harvest', this.level) <= 0
    );
  }

  entities(): readonly Entity[] {
    this.entityBuffer.length = 0;

    for (const node of this.resources.all) {
      // 부서진 노드는 리스폰될 때까지 화면에서 사라진다.
      if (node.durability <= 0) continue;

      const z = Math.max(0, this.terrain.columnHeight(node.x, node.y) - 1);
      const damage = this.resources.damageRatio(node);

      if (node.kind === 'tree') {
        this.entityBuffer.push({ kind: 'tree', x: node.x, y: node.y, z, damage });
      } else {
        // 광맥은 종류마다 다르게 그려야 멀리서도 구분된다. 특히 동굴의 수정은
        // 가장 귀한 자원이라 돌과 같은 모습이면 갈 이유가 보이지 않는다.
        this.entityBuffer.push({
          kind: 'oreVein',
          x: node.x,
          y: node.y,
          z,
          damage,
          ore: node.kind === 'ironVein' ? 'iron' : node.kind === 'crystalVein' ? 'crystal' : 'stone',
        });
      }
    }

    // 통로는 어느 맵에서나 보여야 한다. 보이지 않으면 나가는 길을 찾을 수 없다.
    const portal = this.portal;
    this.entityBuffer.push({
      kind: 'portal',
      x: portal.x,
      y: portal.y,
      z: Math.max(0, this.terrain.columnHeight(portal.x, portal.y) - 1),
      inward: this.inVillage,
    });

    for (const building of this.inVillage ? this.buildings.all : []) {
      const blueprint = blueprintById(building.blueprintId);
      this.entityBuffer.push({
        kind: 'building',
        x: building.x,
        y: building.y,
        z: Math.max(0, this.terrain.columnHeight(building.x, building.y) - 1),
        width: blueprint.width,
        depth: blueprint.depth,
        style: blueprint.style,
        progress: this.buildings.progressOf(building),
        damaged: building.damage > 0,
        look: building.look,
      });
    }

    for (const monster of this.inVillage ? this.raid.monsters : []) {
      this.entityBuffer.push({
        kind: 'monster',
        x: monster.x,
        y: monster.y,
        z: Math.max(0, this.terrain.columnHeight(monster.x, monster.y) - 1),
        health: monster.health,
      });
    }

    for (const npc of this.inVillage ? this.population.all : []) {
      const npcPose = npc.pose(this.terrain);
      this.entityBuffer.push({
        kind: 'npc',
        x: npcPose.x,
        y: npcPose.y,
        z: npcPose.z,
        hue: npc.hue,
      });
    }

    const pose = this.player.pose(this.terrain);
    this.entityBuffer.push({ kind: 'player', x: pose.x, y: pose.y, z: pose.z, swing: pose.swing });

    return this.entityBuffer;
  }

  /**
   * 대상 칸에 무엇이 있는지 한 줄로 설명한다. 커서 안내 문구에 쓴다.
   *
   * @param target 대상 칸.
   * @returns 설명 문자열. 아무것도 없으면 null.
   */
  describeTile(target: TilePos): string | null {
    if (this.inVillage && this.raid.occupies(target)) return '몬스터';

    const portal = this.portal;
    if (target.x === portal.x && target.y === portal.y) {
      return this.inVillage ? '동굴 입구' : '지상으로 나가는 길';
    }

    const building = this.inVillage ? this.buildings.buildingAt(target.x, target.y) : undefined;
    if (building) {
      const label = blueprintById(building.blueprintId).label;
      if (building.buildRemainingMs > 0) {
        return `${label} 건축 중 ${Math.round(this.buildings.progressOf(building) * 100)}%`;
      }
      return label;
    }

    const node = this.resources.nodeAt(target.x, target.y);
    if (node && node.durability > 0) {
      const definition = nodeDefinition(node.kind);
      const ratio = Math.round((1 - this.resources.damageRatio(node)) * 100);
      const locked = isZoneUnlocked(zoneAt(this.terrain, target.x, target.y), this.level)
        ? ''
        : ' (잠김)';
      return `${definition.label} ${ratio}%${locked}`;
    }

    return null;
  }
}

/**
 * 플레이어 시작 칸을 고른다. 맵 중앙에서 가장 가까운, 설 수 있고 비어 있는 칸이다.
 *
 * @param terrain 지형.
 * @param resources 자원 노드(나무 위에서 시작하지 않도록 확인한다).
 * @returns 시작 칸.
 */
function findStartTile(terrain: Terrain, resources: ResourceField): TilePos {
  const center = {
    x: Math.floor((terrain.width - 1) / 2),
    y: Math.floor((terrain.height - 1) / 2),
  };

  if (terrain.columnHeight(center.x, center.y) >= 1 && !resources.isBlocked(center.x, center.y)) {
    return center;
  }

  // 중앙이 뚫려 있으면 바깥으로 한 겹씩 넓히며 설 수 있는 칸을 찾는다.
  const maxRadius = Math.max(terrain.width, terrain.height);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (terrain.contains(x, y) && terrain.columnHeight(x, y) >= 1 && !resources.isBlocked(x, y)) {
          return { x, y };
        }
      }
    }
  }

  return center;
}

/**
 * 동굴로 통하는 칸을 고른다.
 *
 * **마을에서 가장 먼 곳**을 고른다. 기획서 5.2가 "초원 → 숲 → 산악 → 동굴" 순으로
 * 상위 자원이 나온다고 했고, 구역이 마을 중심에서의 거리로 나뉘어 있으므로(ADR 0005)
 * 가장 먼 칸은 곧 산악이다 — 별도 규칙 없이 동굴 입구가 제자리에 놓인다.
 *
 * 같은 거리의 칸이 여럿이면 먼저 만난 칸을 쓴다. 훑는 순서가 고정이라 결과도 고정이다.
 *
 * @param terrain 지형.
 * @param resources 자원 노드(나무나 광맥 위에 입구를 두지 않는다).
 * @returns 통로 칸.
 */
function findPortalTile(terrain: Terrain, resources: ResourceField): TilePos {
  let best: TilePos = { x: 0, y: 0 };
  let bestDistance = -1;
  let bestOpenness = -1;

  for (let y = 0; y < terrain.height; y += 1) {
    for (let x = 0; x < terrain.width; x += 1) {
      if (terrain.columnHeight(x, y) < 1) continue;
      if (resources.isBlocked(x, y)) continue;

      const distance = distanceFromCenter(terrain, x, y);
      if (distance < bestDistance) continue;

      // 같은 거리라면 **걸어 들어갈 길이 많은 칸**을 고른다. 맵 구석은 이웃이 둘뿐이라
      // 입구로는 답답하고, 지형에 따라 아예 닿지 못하는 자리가 될 수도 있다.
      const openness = walkableNeighbors(terrain, { x, y }).length;
      if (distance > bestDistance || openness > bestOpenness) {
        bestDistance = distance;
        bestOpenness = openness;
        best = { x, y };
      }
    }
  }

  return best;
}

/**
 * 동굴에서 지상으로 통하는 칸을 고른다.
 *
 * 동굴은 벽이 꽉 찬 암반이고 파낸 자리만 높이 1이다(`generateCave`). 그러므로
 * **바닥 높이인 칸 중 중앙에 가장 가까운 것**이 출구로 알맞다 — 방 한가운데에
 * 놓여 사방으로 길이 열린다.
 *
 * @param terrain 동굴 지형.
 * @param resources 그 맵의 자원 노드(광맥 위에 출구를 두지 않는다).
 * @returns 출구 칸.
 */
function findCaveExit(terrain: Terrain, resources: ResourceField): TilePos {
  const center = {
    x: Math.floor((terrain.width - 1) / 2),
    y: Math.floor((terrain.height - 1) / 2),
  };

  let best: TilePos = center;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y < terrain.height; y += 1) {
    for (let x = 0; x < terrain.width; x += 1) {
      // 벽(꽉 찬 기둥)이 아니라 파낸 바닥이어야 설 수 있다.
      if (terrain.columnHeight(x, y) !== 1) continue;
      // 광맥 위에는 설 수 없다. 출구가 막히면 나갈 길이 사라진다.
      if (resources.isBlocked(x, y)) continue;

      const distance = Math.max(Math.abs(x - center.x), Math.abs(y - center.y));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }

  return best;
}

/**
 * 시작 창고를 세운다.
 *
 * 창고 블루프린트는 2×2라 평탄한 자리가 필요하다. 시작 칸 주변을 넓혀 가며
 * 배치 가능한 곳을 찾고, 끝내 없으면 지형을 평탄화해서라도 세운다 — 창고가
 * 없으면 첫 채집부터 인벤토리가 막혀 게임이 시작되지 않는다.
 *
 * @param buildings 건물 모음.
 * @param resources 자원 노드.
 * @param terrain 지형.
 * @param start 플레이어 시작 칸.
 * @returns 세워진 창고 건물.
 */
function placeStartingStorage(
  buildings: Buildings,
  resources: ResourceField,
  terrain: Terrain,
  start: TilePos,
): Building {
  const blueprint = blueprintById(BlueprintId.WAREHOUSE);
  const maxRadius = Math.max(terrain.width, terrain.height);

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        // 플레이어가 선 칸을 건물이 덮으면 안 된다.
        const origin = { x: start.x + dx, y: start.y + dy };
        if (coversTile(blueprint.width, blueprint.depth, origin, start)) continue;

        const placed = buildings.place(blueprint, origin.x, origin.y, resources, true);
        if (placed) return placed;
      }
    }
  }

  // 평탄한 자리가 없으면 시작 칸 옆을 강제로 평탄화한다.
  const origin = { x: start.x + 1, y: start.y };
  const height = Math.max(1, terrain.columnHeight(start.x, start.y));
  for (let dy = 0; dy < blueprint.depth; dy += 1) {
    for (let dx = 0; dx < blueprint.width; dx += 1) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (terrain.contains(x, y)) terrain.fillColumn(x, y, height, BlockType.DIRT);
    }
  }

  const forced = buildings.place(blueprint, origin.x, origin.y, resources, true);
  if (!forced) throw new Error('시작 창고를 세울 자리를 찾지 못했다.');

  return forced;
}

/**
 * 점유 영역이 특정 칸을 덮는지 확인한다.
 *
 * @param width 영역 가로 칸수.
 * @param depth 영역 세로 칸수.
 * @param origin 영역 좌상단.
 * @param tile 확인할 칸.
 * @returns 덮으면 true.
 */
function coversTile(width: number, depth: number, origin: TilePos, tile: TilePos): boolean {
  return (
    tile.x >= origin.x && tile.x < origin.x + width && tile.y >= origin.y && tile.y < origin.y + depth
  );
}
