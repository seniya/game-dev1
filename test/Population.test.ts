import { describe, expect, it } from 'vitest';
import { BlueprintId, blueprintById, buildDurationMs } from '../src/core/blueprints';
import { BlockType } from '../src/core/blocks';
import { Terrain } from '../src/core/Terrain';
import { Buildings, type NodeBlocker } from '../src/sim/Buildings';
import { Population } from '../src/sim/Population';

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
 * 주민 집단을 준비한다.
 *
 * @param size 맵 크기.
 */
function setup(size = 14) {
  const terrain = flat(size);
  const buildings = new Buildings(terrain);
  const population = new Population(terrain, buildings);

  return { terrain, buildings, population };
}

/**
 * 주민 집단을 지정 시간만큼 진행하고 이주 목록을 모은다.
 *
 * @param population 대상 집단.
 * @param totalMs 진행할 시간(ms).
 */
function advance(population: Population, totalMs: number) {
  const stepMs = 1000 / 60;
  const migrations = [];
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    migrations.push(...population.update(stepMs));
  }
  return migrations;
}

const cottage = blueprintById(BlueprintId.COTTAGE);
const manor = blueprintById(BlueprintId.MANOR);

describe('Population 이주', () => {
  it('집이 없으면 주민이 오지 않는다', () => {
    const { population } = setup();

    expect(population.housingCapacity).toBe(0);
    expect(advance(population, 30_000)).toHaveLength(0);
    expect(population.count).toBe(0);
  });

  it('건축 중인 집으로는 이주하지 않는다', () => {
    const { buildings, population } = setup();
    buildings.place(cottage, 3, 3, noNodes);

    expect(advance(population, 10_000)).toHaveLength(0);
    expect(population.count).toBe(0);
  });

  it('집이 완공되면 잠시 뒤 이주한다 — 즉시가 아니다', () => {
    const { buildings, population } = setup();
    buildings.place(cottage, 3, 3, noNodes, true);

    expect(population.hasVacancy).toBe(true);
    // 이주 지연(2.5초)보다 짧게 진행하면 아직 오지 않는다.
    expect(advance(population, 1000)).toHaveLength(0);

    const migrations = advance(population, 4000);
    expect(migrations).toHaveLength(1);
    expect(population.count).toBe(1);
    expect(migrations[0]!.building.id).toBeDefined();
  });

  it('수용 인원을 넘겨 이주하지 않는다', () => {
    const { buildings, population } = setup();
    buildings.place(cottage, 3, 3, noNodes, true);

    advance(population, 60_000);

    expect(population.count).toBe(cottage.housing);
    expect(population.hasVacancy).toBe(false);
  });

  it('큰 집에는 두 명이 산다 — 한 번에 오지는 않는다', () => {
    const { buildings, population } = setup();
    buildings.place(manor, 3, 3, noNodes, true);

    const first = advance(population, 4000);
    expect(first).toHaveLength(1);

    advance(population, 4000);
    expect(population.count).toBe(manor.housing);
  });

  it('집을 더 지으면 다시 이주가 열린다', () => {
    const { buildings, population } = setup();
    buildings.place(cottage, 2, 2, noNodes, true);
    advance(population, 60_000);
    expect(population.count).toBe(1);

    buildings.place(cottage, 6, 6, noNodes, true);
    advance(population, 60_000);

    expect(population.count).toBe(2);
  });

  it('주민은 집 앞의 설 수 있는 칸에서 시작한다', () => {
    const { buildings, population } = setup();
    const home = buildings.place(cottage, 4, 4, noNodes, true)!;

    advance(population, 4000);
    const npc = population.all[0]!;

    // 건물이 점유한 칸에는 서지 않는다.
    expect(buildings.isOccupied(npc.position.x, npc.position.y)).toBe(false);
    expect(npc.homeBuildingId).toBe(home.id);
  });

  it('건축이 끝나는 순간부터 이주 시계가 돈다', () => {
    const { buildings, population } = setup();
    buildings.place(cottage, 3, 3, noNodes);

    // 건축 중에는 이주가 없다.
    advance(population, 10_000);
    expect(population.count).toBe(0);

    buildings.update(buildDurationMs(cottage) + 100);
    advance(population, 4000);

    expect(population.count).toBe(1);
  });

  it('주민들이 각자 배회한다', () => {
    const { buildings, population } = setup(20);
    buildings.place(manor, 8, 8, noNodes, true);
    advance(population, 10_000);
    expect(population.count).toBe(2);

    const before = population.all.map((npc) => `${npc.position.x},${npc.position.y}`);
    advance(population, 20_000);
    const after = population.all.map((npc) => `${npc.position.x},${npc.position.y}`);

    expect(after).not.toEqual(before);
  });
});

describe('실내 생활 (ADR 0020)', () => {
  /**
   * 집 한 채와 일터 한 채가 선 마을을 만든다.
   *
   * @param size 정사각 맵의 한 변.
   */
  function village(size = 16) {
    const terrain = flat(size);
    const buildings = new Buildings(terrain);
    const population = new Population(terrain, buildings);

    const home = buildings.place(blueprintById(BlueprintId.COTTAGE), 3, 3, noNodes, true)!;
    const work = buildings.place(blueprintById(BlueprintId.WORKBENCH), 9, 3, noNodes, true)!;

    // 주민이 들어올 때까지 진행한다.
    for (let step = 0; step < 1200; step += 1) population.update(1000 / 60);

    return { terrain, buildings, population, home, work };
  }

  /**
   * 칸이 건물 점유 영역 안인지 본다.
   *
   * @param building 건물.
   * @param tile 확인할 칸.
   */
  function isInside(building: { x: number; y: number; blueprintId: BlueprintId }, tile: { x: number; y: number }) {
    const blueprint = blueprintById(building.blueprintId);

    return (
      tile.x >= building.x &&
      tile.x < building.x + blueprint.width &&
      tile.y >= building.y &&
      tile.y < building.y + blueprint.depth
    );
  }

  it('밤에는 집 안을 기준점으로 삼는다', () => {
    const { population, home } = village();
    expect(population.count).toBeGreaterThan(0);

    population.update(1000 / 60, false, true, 0);

    for (const npc of population.all) {
      expect(isInside(home, npc.anchor)).toBe(true);
      expect(npc.radius).toBeLessThanOrEqual(1);
    }
  });

  it('낮에 일자리가 있으면 일터 안을 기준점으로 삼는다', () => {
    const { population, work } = village();
    const npc = population.all[0]!;
    npc.setJob(work.id);

    population.update(1000 / 60, true, false, 0);

    expect(isInside(work, npc.anchor)).toBe(true);
    expect(npc.radius).toBeLessThanOrEqual(1);
  });

  it('일자리가 없는 주민은 시간 덩어리마다 집과 마을을 오간다', () => {
    const { population, home } = village();
    const npc = population.all[0]!;

    const insideBlocks = new Set<number>();
    const outsideBlocks = new Set<number>();
    for (let block = 0; block < 30; block += 1) {
      population.update(1000 / 60, true, false, block);
      if (isInside(home, npc.anchor)) insideBlocks.add(block);
      else outsideBlocks.add(block);
    }

    // 계속 안에만 있으면 마을이 죽고, 계속 밖에만 있으면 집이 빈다.
    expect(insideBlocks.size).toBeGreaterThan(0);
    expect(outsideBlocks.size).toBeGreaterThan(0);
  });

  it('같은 덩어리에서는 같은 판단이 나온다 — 매 프레임 들락거리지 않는다', () => {
    const { population, home } = village();
    const npc = population.all[0]!;

    population.update(1000 / 60, true, false, 7);
    const first = isInside(home, npc.anchor);
    for (let i = 0; i < 20; i += 1) population.update(1000 / 60, true, false, 7);

    expect(isInside(home, npc.anchor)).toBe(first);
  });
});
