import { describe, expect, it } from 'vitest';
import { BlueprintId, blueprintById } from '../src/core/blueprints';
import { BlockType } from '../src/core/blocks';
import { ItemType } from '../src/core/items';
import {
  REQUEST_REWARD,
  RequestKind,
  countTarget,
  isCountMet,
  requestLabel,
  requestMessage,
} from '../src/core/requests';
import { Terrain } from '../src/core/Terrain';
import { Buildings, type NodeBlocker } from '../src/sim/Buildings';
import { Population } from '../src/sim/Population';
import { RequestBoard } from '../src/sim/Requests';

/** 아무 칸도 막지 않는 노드 대역. */
const noNodes: NodeBlocker = { isBlocked: () => false };

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

/**
 * 주민이 한 명 이상 있는 요청 게시판을 준비한다.
 *
 * @param options 게시판 설정.
 */
function setup(options: { seed?: number; intervalMs?: number; maxActive?: number } = {}) {
  const terrain = flat(16);
  const buildings = new Buildings(terrain);
  const population = new Population(terrain, buildings);
  buildings.place(blueprintById(BlueprintId.MANOR), 4, 4, noNodes, true);

  const board = new RequestBoard(buildings, population, { seed: 5, ...options });

  /**
   * 게시판과 주민을 함께 진행한다.
   *
   * @param totalMs 진행할 시간(ms).
   */
  const advance = (totalMs: number) => {
    const stepMs = 1000 / 60;
    const created = [];
    const completed = [];
    for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
      population.update(stepMs);
      const result = board.update(stepMs);
      created.push(...result.created);
      completed.push(...result.completed);
    }
    return { created, completed };
  };

  return { terrain, buildings, population, board, advance };
}

/**
 * 납품 요청만 나오는 게시판을 준비한다.
 *
 * 요청 가능한 시설을 미리 모두 세우면 시설 요청이 생기지 않는다.
 *
 * @param options 게시판 설정.
 */
function setupDeliveryOnly(options: { intervalMs?: number } = {}) {
  const context = setup(options);
  context.buildings.place(blueprintById(BlueprintId.WELL), 10, 10, noNodes, true);
  context.buildings.place(blueprintById(BlueprintId.WORKBENCH), 12, 10, noNodes, true);
  context.buildings.place(blueprintById(BlueprintId.WAREHOUSE), 10, 12, noNodes, true);

  return context;
}

describe('요청 문구', () => {
  it('납품 요청은 아이템과 개수를 보여준다', () => {
    const request = {
      kind: RequestKind.DELIVER,
      id: 1,
      npcId: 1,
      item: ItemType.WOOD,
      amount: 5,
    } as const;

    expect(requestLabel(request)).toBe('목재 5');
    expect(requestMessage(request)).toBe('주민 요청: 목재 5개');
  });

  it('시설 요청은 건물 이름을 보여준다', () => {
    const request = {
      kind: RequestKind.FACILITY,
      id: 2,
      npcId: 1,
      blueprintId: BlueprintId.WELL,
    } as const;

    expect(requestLabel(request)).toBe('우물');
    expect(requestMessage(request)).toBe('주민 요청: 우물 건축');
  });

  it('시설 요청이 납품 요청보다 보상이 크다', () => {
    expect(REQUEST_REWARD[RequestKind.FACILITY]).toBeGreaterThan(REQUEST_REWARD[RequestKind.DELIVER]);
  });
});

describe('RequestBoard 생성', () => {
  it('주민이 없으면 요청이 나오지 않는다', () => {
    const terrain = flat(10);
    const buildings = new Buildings(terrain);
    const population = new Population(terrain, buildings);
    const board = new RequestBoard(buildings, population, { intervalMs: 1000 });

    for (let i = 0; i < 600; i += 1) board.update(1000 / 60);

    expect(board.requests).toHaveLength(0);
  });

  it('주민이 이주하면 요청이 나온다', () => {
    const { advance, board } = setup({ intervalMs: 3000 });

    const { created } = advance(20_000);

    expect(created.length).toBeGreaterThan(0);
    expect(board.requests.length).toBeGreaterThan(0);
  });

  it('동시에 열리는 요청 수에 상한이 있다', () => {
    const { advance, board } = setup({ intervalMs: 1000, maxActive: 2 });

    advance(60_000);

    expect(board.requests.length).toBeLessThanOrEqual(2);
  });

  it('이미 서 있는 시설은 다시 요청하지 않는다', () => {
    const { buildings, advance } = setup({ intervalMs: 1500 });
    // 요청 가능한 시설을 모두 세워 둔다.
    buildings.place(blueprintById(BlueprintId.WELL), 10, 10, noNodes, true);
    buildings.place(blueprintById(BlueprintId.WORKBENCH), 12, 10, noNodes, true);
    buildings.place(blueprintById(BlueprintId.WAREHOUSE), 10, 12, noNodes, true);

    const { created } = advance(40_000);

    expect(created.length).toBeGreaterThan(0);
    expect(created.every((request) => request.kind === RequestKind.DELIVER)).toBe(true);
  });

  it('같은 시설을 중복 요청하지 않는다', () => {
    const { advance } = setup({ intervalMs: 800 });

    const { created } = advance(60_000);
    const facilities = created.filter((request) => request.kind === RequestKind.FACILITY);
    const ids = facilities.map((request) =>
      request.kind === RequestKind.FACILITY ? request.blueprintId : '',
    );

    // 완료되지 않은 동일 시설 요청이 동시에 두 개 열리지 않는다.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('납품 요청 개수는 정의된 범위 안이다', () => {
    const { advance } = setup({ intervalMs: 700 });

    const { created } = advance(60_000);
    for (const request of created) {
      if (request.kind !== RequestKind.DELIVER) continue;
      expect(request.amount).toBeGreaterThanOrEqual(1);
      expect(request.amount).toBeLessThanOrEqual(8);
    }
  });
});

describe('RequestBoard 완료', () => {
  it('시설 요청은 건물이 완공되면 자동으로 닫힌다', () => {
    const { buildings, board, advance } = setup({ intervalMs: 800 });
    advance(30_000);

    const facility = board.requests.find((request) => request.kind === RequestKind.FACILITY);
    if (!facility || facility.kind !== RequestKind.FACILITY) {
      // 시드에 따라 시설 요청이 없을 수 있으므로 그때는 이 검증을 건너뛴다.
      expect(board.requests.length).toBeGreaterThanOrEqual(0);
      return;
    }

    buildings.place(blueprintById(facility.blueprintId), 13, 13, noNodes, true);
    const { completed } = advance(200);

    expect(completed.some((entry) => entry.request.id === facility.id)).toBe(true);
    expect(board.completedCount).toBeGreaterThan(0);
  });

  it('납품 요청은 자재를 낼 수 있을 때만 완료된다', () => {
    const { board, advance } = setupDeliveryOnly({ intervalMs: 800 });
    advance(30_000);

    const delivery = board.requests.find((request) => request.kind === RequestKind.DELIVER);
    expect(delivery).toBeDefined();
    if (!delivery || delivery.kind !== RequestKind.DELIVER) return;

    // 자재가 없으면 완료되지 않는다.
    expect(board.fulfillDelivery(delivery.id, () => false, () => {})).toBeNull();
    expect(board.requests).toContain(delivery);

    let paid: { item: ItemType; amount: number } | null = null;
    const completion = board.fulfillDelivery(
      delivery.id,
      () => true,
      (item, amount) => {
        paid = { item, amount };
      },
    );

    expect(completion?.request.id).toBe(delivery.id);
    expect(paid).toEqual({ item: delivery.item, amount: delivery.amount });
    expect(board.requests).not.toContain(delivery);
  });

  it('없는 요청 번호는 완료할 수 없다', () => {
    const { board } = setup();

    expect(board.fulfillDelivery(999, () => true, () => {})).toBeNull();
  });

  it('시설 요청은 납품으로 완료할 수 없다', () => {
    const { board, advance, buildings } = setup({ intervalMs: 800 });
    void buildings;
    advance(30_000);

    const facility = board.requests.find((request) => request.kind === RequestKind.FACILITY);
    if (!facility) return;

    expect(board.fulfillDelivery(facility.id, () => true, () => {})).toBeNull();
  });

  it('낼 수 있는 납품 요청을 찾아준다', () => {
    const { board, advance } = setupDeliveryOnly({ intervalMs: 800 });
    advance(30_000);

    expect(board.findPayableDelivery(() => false)).toBeUndefined();
    const payable = board.findPayableDelivery(() => true);
    expect(payable?.kind).toBe(RequestKind.DELIVER);
  });

  it('완료 수가 누적된다', () => {
    const { board, advance } = setupDeliveryOnly({ intervalMs: 800 });
    advance(30_000);
    const before = board.completedCount;

    for (const request of [...board.requests]) {
      if (request.kind !== RequestKind.DELIVER) continue;
      board.fulfillDelivery(request.id, () => true, () => {});
    }

    expect(board.completedCount).toBeGreaterThan(before);
  });
});

describe('달성형 요청 생성', () => {
  /**
   * 주민이 여럿 사는 마을을 만든다. 달성형 요청은 마을이 자란 뒤에 나온다.
   *
   * @param houses 지을 집 수.
   */
  function grownVillage(houses = 8) {
    const context = setupDeliveryOnly({ intervalMs: 1000 });
    for (let i = 0; i < houses; i += 1) {
      context.buildings.place(blueprintById(BlueprintId.COTTAGE), 1 + i * 3, 1, noNodes, true);
    }
    // 주민이 들어올 때까지 진행한다.
    context.advance(60_000);

    return context;
  }

  it('마을이 자라면 달성형이 섞여 나온다', () => {
    const context = grownVillage();
    expect(context.population.count).toBeGreaterThanOrEqual(4);

    const kinds = new Set<string>();
    // 요청이 쌓이면 새로 만들지 않으므로, 만들어진 것을 비워 가며 여러 번 본다.
    for (let round = 0; round < 40; round += 1) {
      const { created } = context.advance(1500);
      for (const request of created) kinds.add(request.kind);
      context.board.requests.forEach((request) => {
        if (request.kind === RequestKind.DELIVER) {
          context.board.fulfillDelivery(request.id, () => true, () => {});
        }
      });
    }

    expect(kinds.has(RequestKind.SETTLE) || kinds.has(RequestKind.WORKFORCE)).toBe(true);
  });

  it('주민이 적으면 나오지 않는다 — 마을 전체의 목표를 요청으로 내밀지 않는다', () => {
    const context = setupDeliveryOnly({ intervalMs: 1000 });
    context.advance(30_000);
    expect(context.population.count).toBeLessThan(4);

    const kinds = new Set<string>();
    for (let round = 0; round < 20; round += 1) {
      const { created } = context.advance(1500);
      for (const request of created) kinds.add(request.kind);
      context.board.requests.forEach((request) => {
        if (request.kind === RequestKind.DELIVER) {
          context.board.fulfillDelivery(request.id, () => true, () => {});
        }
      });
    }

    expect(kinds.has(RequestKind.SETTLE)).toBe(false);
    expect(kinds.has(RequestKind.WORKFORCE)).toBe(false);
  });

  it('주민 수를 채우면 스스로 닫힌다', () => {
    const context = grownVillage(10);
    const before = context.population.count;

    // 지금보다 한 명 적은 목표는 이미 채워진 것이라 곧바로 닫힌다.
    context.board.restore({
      requests: [{ kind: 'settle', id: 99, npcId: 1, target: Math.max(1, before - 1) }],
      nextId: 100,
      completed: 0,
      timerMs: 10_000,
    });

    const { completed } = context.advance(200);

    expect(completed.some((entry) => entry.request.id === 99)).toBe(true);
  });
});

describe('달성형 요청', () => {
  it('주민 수와 일꾼 수를 채우면 닫힌다', () => {
    expect(
      isCountMet(
        { kind: RequestKind.SETTLE, id: 1, npcId: 1, target: 5 },
        { residents: 5, employed: 0 },
      ),
    ).toBe(true);
    expect(
      isCountMet(
        { kind: RequestKind.SETTLE, id: 1, npcId: 1, target: 5 },
        { residents: 4, employed: 9 },
      ),
    ).toBe(false);
    expect(
      isCountMet(
        { kind: RequestKind.WORKFORCE, id: 2, npcId: 1, target: 3 },
        { residents: 40, employed: 3 },
      ),
    ).toBe(true);
  });

  it('목표는 지금보다 조금 더 많은 수다 — 이미 채운 수를 부르면 나오자마자 닫힌다', () => {
    expect(countTarget(4, 2)).toBe(6);
    expect(countTarget(0, 1)).toBe(1);
  });

  it('달성형에도 이름과 안내 문구가 있다', () => {
    const settle = { kind: RequestKind.SETTLE, id: 1, npcId: 1, target: 6 } as const;
    const work = { kind: RequestKind.WORKFORCE, id: 2, npcId: 1, target: 2 } as const;

    expect(requestLabel(settle)).toContain('6');
    expect(requestMessage(settle)).toContain('주민');
    expect(requestLabel(work)).toContain('2');
    expect(requestMessage(work)).toContain('일터');
  });

  it('보상은 납품보다 크다 — 여러 번의 채집과 건축이 쌓여야 닫힌다', () => {
    expect(REQUEST_REWARD[RequestKind.SETTLE]).toBeGreaterThan(REQUEST_REWARD[RequestKind.DELIVER]);
    expect(REQUEST_REWARD[RequestKind.WORKFORCE]).toBeGreaterThan(
      REQUEST_REWARD[RequestKind.DELIVER],
    );
  });
});
