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
