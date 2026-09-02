import {
  DELIVER_TABLE,
  FACILITY_TABLE,
  REQUEST_REWARD,
  RequestKind,
  countTarget,
  isCountMet,
  type VillageRequest,
} from '../core/requests';
import { SLOTS_PER_WORKPLACE, isWorkplace } from '../core/jobs';
import { hashNoise } from '../core/random';
import type { ItemType } from '../core/items';
import type { RequestSave } from '../core/save';
import type { Buildings } from './Buildings';
import type { Population } from './Population';

/** 요청 완료 결과. */
export interface RequestCompletion {
  /** 완료된 요청. */
  request: VillageRequest;
  /** 지급한 마을 경험치. */
  reward: number;
}

/** 요청 게시판 설정. */
export interface RequestBoardOptions {
  /** 시드. */
  seed?: number;
  /** 동시에 열려 있을 수 있는 최대 요청 수. */
  maxActive?: number;
  /** 새 요청이 나오는 간격(ms). */
  intervalMs?: number;
}

/** 동시에 열려 있을 수 있는 기본 최대 요청 수. 상단 아이콘 줄에 들어가는 수다. */
const DEFAULT_MAX_ACTIVE = 3;

/** 새 요청이 나오는 기본 간격(ms). */
const DEFAULT_INTERVAL_MS = 20_000;

/**
 * 주민 요청 게시판.
 *
 * 기획서 5.4의 요청 시스템이다. 스토리 없이 목표 의식을 주기 위한 장치이므로
 * 요청은 짧고 즉시 이해되는 두 종류뿐이다 — 자재 납품과 시설 건축.
 *
 * **시설 요청은 조건이 충족되면 자동으로 완료된다.** 건물이 이미 서 있는 것을
 * 플레이어가 다시 알려 줄 이유가 없다. 반면 **납품 요청은 명시적 행동을 요구한다** —
 * 자동으로 자재를 가져가면 건축용으로 모아 둔 자재가 사라져 버린다.
 */
/**
 * 달성형 요청이 나오기 시작하는 주민 수.
 *
 * 초반에는 주민 한둘이 전부라 "주민 다섯 명" 같은 요청이 곧 마을 전체의 목표가 된다.
 * 그것은 요청이 아니라 진행 그 자체다.
 */
const COUNT_REQUEST_MIN_RESIDENTS = 4;

export class RequestBoard {
  private readonly buildings: Buildings;
  private readonly population: Population;

  /** 열려 있는 요청. */
  private readonly active: VillageRequest[] = [];
  /** 지금까지 완료한 요청 수. 마을 레벨 산정에 쓴다(기획서 6절). */
  private completed = 0;

  /** 다음에 부여할 요청 번호. */
  private nextId = 1;
  /** 다음 요청까지 남은 시간(ms). */
  private timerMs: number;

  private readonly seed: number;
  private readonly maxActive: number;
  private readonly intervalMs: number;

  /**
   * @param buildings 마을 건물(시설 요청 판정에 쓴다).
   * @param population 주민(요청 주체).
   * @param options 시드와 간격.
   */
  constructor(buildings: Buildings, population: Population, options: RequestBoardOptions = {}) {
    this.buildings = buildings;
    this.population = population;
    this.seed = options.seed ?? 1;
    this.maxActive = options.maxActive ?? DEFAULT_MAX_ACTIVE;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    // 첫 요청은 조금 빨리 나오게 해 이주 직후 목표가 생기게 한다.
    this.timerMs = this.intervalMs / 2;
  }

  /** 열려 있는 요청 목록. */
  get requests(): readonly VillageRequest[] {
    return this.active;
  }

  /** 지금까지 완료한 요청 수. */
  get completedCount(): number {
    return this.completed;
  }

  /**
   * 저장용 표현으로 바꾼다.
   *
   * @returns 저장 데이터.
   */
  toSave(): { requests: RequestSave[]; nextId: number; completed: number; timerMs: number } {
    return {
      requests: this.active.map((request) => {
        if (request.kind === RequestKind.DELIVER) {
          return {
            kind: 'deliver' as const,
            id: request.id,
            npcId: request.npcId,
            item: request.item,
            amount: request.amount,
          };
        }
        if (request.kind === RequestKind.FACILITY) {
          return {
            kind: 'facility' as const,
            id: request.id,
            npcId: request.npcId,
            blueprintId: request.blueprintId,
          };
        }

        return { kind: request.kind, id: request.id, npcId: request.npcId, target: request.target };
      }),
      nextId: this.nextId,
      completed: this.completed,
      timerMs: this.timerMs,
    };
  }

  /**
   * 저장에서 요청 게시판 상태를 되살린다.
   *
   * 게시판은 건물·주민 참조를 갖고 있어 새로 만들어야 하므로, 생성자로 만든 인스턴스에
   * 저장값을 채워 넣는 방식을 쓴다.
   *
   * @param saved 저장 데이터.
   */
  restore(saved: {
    requests: readonly RequestSave[];
    nextId: number;
    completed: number;
    timerMs: number;
  }): void {
    this.active.length = 0;

    for (const entry of saved.requests) {
      if (!Number.isInteger(entry.id)) continue;

      if (entry.kind === 'deliver') {
        if (typeof entry.item !== 'string') continue;
        if (!Number.isInteger(entry.amount) || entry.amount < 1) continue;
        this.active.push({
          kind: RequestKind.DELIVER,
          id: entry.id,
          npcId: entry.npcId,
          item: entry.item,
          amount: entry.amount,
        });
        continue;
      }

      if (entry.kind === 'settle' || entry.kind === 'workforce') {
        if (!Number.isInteger(entry.target) || entry.target < 1) continue;
        this.active.push({
          kind: entry.kind === 'settle' ? RequestKind.SETTLE : RequestKind.WORKFORCE,
          id: entry.id,
          npcId: entry.npcId,
          target: entry.target,
        });
        continue;
      }

      if (entry.kind !== 'facility' || typeof entry.blueprintId !== 'string') continue;
      this.active.push({
        kind: RequestKind.FACILITY,
        id: entry.id,
        npcId: entry.npcId,
        blueprintId: entry.blueprintId,
      });
    }

    this.nextId = Math.max(saved.nextId ?? 1, ...this.active.map((request) => request.id + 1), 1);
    this.completed = Math.max(0, Math.floor(saved.completed ?? 0));
    this.timerMs = Number.isFinite(saved.timerMs) ? saved.timerMs : this.intervalMs;
  }

  /**
   * 한 스텝 진행한다. 새 요청 생성과 시설 요청 자동 완료를 처리한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @returns 이번 스텝에 새로 생긴 요청과 완료된 요청.
   */
  update(stepMs: number): { created: VillageRequest[]; completed: RequestCompletion[] } {
    const created: VillageRequest[] = [];
    const completed: RequestCompletion[] = [];

    // 스스로 닫히는 요청들: 시설은 건물이 서면, 달성형은 수가 채워지면 닫힌다.
    const counts = { residents: this.population.count, employed: this.population.employed };
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const request = this.active[i]!;

      const met =
        request.kind === RequestKind.FACILITY
          ? this.buildings.hasCompleted(request.blueprintId)
          : request.kind !== RequestKind.DELIVER && isCountMet(request, counts);
      if (!met) continue;

      this.active.splice(i, 1);
      this.completed += 1;
      completed.push({ request, reward: REQUEST_REWARD[request.kind] });
    }

    if (this.population.count === 0) return { created, completed };

    this.timerMs -= stepMs;
    if (this.timerMs > 0) return { created, completed };

    this.timerMs = this.intervalMs;

    const request = this.generate();
    if (request) {
      this.active.push(request);
      created.push(request);
    }

    return { created, completed };
  }

  /**
   * 납품 요청을 완료한다. 자재를 실제로 소모하는 것은 호출부다.
   *
   * @param id 요청 번호.
   * @param canPay 자재를 낼 수 있는지 확인하는 함수.
   * @param pay 자재를 소모하는 함수.
   * @returns 완료 결과. 조건이 안 맞으면 null.
   */
  fulfillDelivery(
    id: number,
    canPay: (item: ItemType, amount: number) => boolean,
    pay: (item: ItemType, amount: number) => void,
  ): RequestCompletion | null {
    const index = this.active.findIndex((request) => request.id === id);
    if (index < 0) return null;

    const request = this.active[index]!;
    if (request.kind !== RequestKind.DELIVER) return null;
    if (!canPay(request.item, request.amount)) return null;

    pay(request.item, request.amount);
    this.active.splice(index, 1);
    this.completed += 1;

    return { request, reward: REQUEST_REWARD[request.kind] };
  }

  /**
   * 지금 낼 수 있는 납품 요청을 찾는다. 단축키 하나로 처리하기 위한 것이다.
   *
   * @param canPay 자재를 낼 수 있는지 확인하는 함수.
   * @returns 낼 수 있는 첫 요청. 없으면 undefined.
   */
  findPayableDelivery(
    canPay: (item: ItemType, amount: number) => boolean,
  ): VillageRequest | undefined {
    return this.active.find(
      (request) => request.kind === RequestKind.DELIVER && canPay(request.item, request.amount),
    );
  }

  /**
   * 지금 마을에 있는 일터 자리 수를 센다.
   *
   * 자리보다 많은 일꾼을 요구하면 채울 수 없는 요청이 된다.
   *
   * @returns 일터 자리 수.
   */
  private jobSlots(): number {
    let slots = 0;
    for (const building of this.buildings.all) {
      if (building.buildRemainingMs > 0 || building.damage > 0) continue;
      if (isWorkplace(building.blueprintId)) slots += SLOTS_PER_WORKPLACE;
    }

    return slots;
  }

  /**
   * 새 요청을 만든다.
   *
   * 이미 서 있는 시설을 다시 요청하지 않고, 같은 요청이 중복되지도 않게 한다 —
   * "우물이 필요해요"가 우물 옆에서 나오면 규칙이 고장 난 것처럼 보인다.
   *
   * @returns 만든 요청. 만들 수 없으면 null.
   */
  private generate(): VillageRequest | null {
    if (this.active.length >= this.maxActive) return null;

    const npc = this.population.all[Math.floor(this.roll(1) * this.population.count)];
    if (!npc) return null;

    // 시설 요청을 먼저 시도한다. 마을에 없는 시설이 있으면 그것이 더 명확한 목표다.
    const wanted = FACILITY_TABLE.filter(
      (blueprintId) =>
        !this.buildings.hasCompleted(blueprintId) &&
        !this.active.some(
          (request) => request.kind === RequestKind.FACILITY && request.blueprintId === blueprintId,
        ),
    );

    if (wanted.length > 0 && this.roll(2) < 0.5) {
      const pick = wanted[Math.min(Math.floor(this.roll(3) * wanted.length), wanted.length - 1)]!;

      return {
        kind: RequestKind.FACILITY,
        id: this.takeId(),
        npcId: npc.id,
        blueprintId: pick,
      };
    }

    // 마을이 어느 정도 자라면 달성형 요청을 섞는다. 후반에는 자재 납품이 시시해지고
    // 지을 시설도 다 서 버려, 요청이 같은 모양으로 반복되기 때문이다(로드맵 04 Phase 4).
    const residents = this.population.count;
    const employed = this.population.employed;
    if (residents >= COUNT_REQUEST_MIN_RESIDENTS && this.roll(6) < 0.45) {
      const wantsWorkers = this.jobSlots() > employed && this.roll(7) < 0.5;
      const kind = wantsWorkers ? RequestKind.WORKFORCE : RequestKind.SETTLE;
      const have = wantsWorkers ? employed : residents;
      const step = wantsWorkers ? 1 : 2;

      // 같은 종류가 이미 열려 있으면 겹치지 않게 둔다.
      if (!this.active.some((request) => request.kind === kind)) {
        return { kind, id: this.takeId(), npcId: npc.id, target: countTarget(have, step) };
      }
    }

    const entry =
      DELIVER_TABLE[Math.min(Math.floor(this.roll(4) * DELIVER_TABLE.length), DELIVER_TABLE.length - 1)]!;
    const span = entry.max - entry.min;
    const amount = entry.min + Math.floor(this.roll(5) * (span + 1));

    return {
      kind: RequestKind.DELIVER,
      id: this.takeId(),
      npcId: npc.id,
      item: entry.item,
      amount: Math.min(entry.max, amount),
    };
  }

  /**
   * 요청 번호를 하나 소비한다.
   *
   * @returns 새 요청 번호.
   */
  private takeId(): number {
    const id = this.nextId;
    this.nextId += 1;

    return id;
  }

  /**
   * 결정적 무작위 값을 뽑는다.
   *
   * @param salt 같은 요청 생성 안에서 값을 가르는 값.
   * @returns 0 이상 1 미만의 값.
   */
  private roll(salt: number): number {
    return hashNoise(this.nextId * 31 + salt, this.completed + this.active.length, this.seed);
  }
}
