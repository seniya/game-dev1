import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { Terrain } from '../src/core/Terrain';
import { NPC_MOVE_DURATION_MS, Npc } from '../src/sim/Npc';

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
 * NPC를 지정 시간만큼 진행한다.
 *
 * @param npc 대상 NPC.
 * @param terrain 지형.
 * @param totalMs 진행할 시간(ms).
 */
function advance(npc: Npc, terrain: Terrain, totalMs: number): void {
  const stepMs = 1000 / 60;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) npc.update(stepMs, terrain);
}

describe('Npc 기본', () => {
  it('집 앞 칸에서 시작한다', () => {
    const npc = new Npc(1, 10, { x: 4, y: 5 });

    expect(npc.position).toEqual({ x: 4, y: 5 });
    expect(npc.homeBuildingId).toBe(10);
    expect(npc.moving).toBe(false);
  });

  it('번호마다 다른 색을 갖는다', () => {
    const hues = new Set([1, 2, 3, 4, 5].map((id) => new Npc(id, 1, { x: 0, y: 0 }).hue));

    expect(hues.size).toBeGreaterThan(1);
  });

  it('색은 0~359 범위다', () => {
    for (let id = 1; id <= 20; id += 1) {
      const { hue } = new Npc(id, 1, { x: 0, y: 0 });
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe('Npc 배회', () => {
  it('가만히 있다가 이동을 시작한다', () => {
    const terrain = flat(12);
    const npc = new Npc(1, 1, { x: 6, y: 6 });

    expect(npc.moving).toBe(false);
    advance(npc, terrain, 3000);

    // 대기 시간이 최대 2.6초이므로 3초 안에는 반드시 한 번은 움직인다.
    expect(npc.moving || npc.position.x !== 6 || npc.position.y !== 6).toBe(true);
  });

  it('이동이 끝나면 인접 칸으로 옮겨져 있다', () => {
    const terrain = flat(12);
    const npc = new Npc(2, 1, { x: 6, y: 6 });

    advance(npc, terrain, 3000 + NPC_MOVE_DURATION_MS);

    const distance = Math.abs(npc.position.x - 6) + Math.abs(npc.position.y - 6);
    expect(distance).toBeGreaterThanOrEqual(1);
  });

  it('집에서 너무 멀리 벗어나지 않는다', () => {
    const terrain = flat(40);
    const npc = new Npc(3, 1, { x: 20, y: 20 });

    advance(npc, terrain, 120_000);

    const distance = Math.abs(npc.position.x - 20) + Math.abs(npc.position.y - 20);
    expect(distance).toBeLessThanOrEqual(6);
  });

  it('갈 곳이 없으면 제자리에 머문다', () => {
    // 1×1 맵이라 인접 칸이 없다.
    const terrain = flat(1);
    const npc = new Npc(4, 1, { x: 0, y: 0 });

    advance(npc, terrain, 20_000);

    expect(npc.position).toEqual({ x: 0, y: 0 });
    expect(npc.moving).toBe(false);
  });

  it('벽에 막힌 방향으로는 가지 않는다', () => {
    const terrain = flat(9);
    // (4,4) 주위를 모두 3칸 높게 세워 오를 수 없게 만든다.
    for (const [x, y] of [
      [5, 4],
      [3, 4],
      [4, 5],
      [4, 3],
    ] as const) {
      for (let i = 0; i < 3; i += 1) terrain.place(x, y, BlockType.DIRT);
    }
    const npc = new Npc(5, 1, { x: 4, y: 4 });

    advance(npc, terrain, 30_000);

    expect(npc.position).toEqual({ x: 4, y: 4 });
  });

  it('같은 번호와 같은 지형이면 같은 경로를 따른다 — 결정적 무작위', () => {
    const a = new Npc(7, 1, { x: 6, y: 6 });
    const b = new Npc(7, 1, { x: 6, y: 6 });
    const terrainA = flat(14);
    const terrainB = flat(14);

    advance(a, terrainA, 30_000);
    advance(b, terrainB, 30_000);

    expect(a.position).toEqual(b.position);
  });

  it('이동 중 화면 위치는 두 칸 사이에 있다', () => {
    const terrain = flat(12);
    const npc = new Npc(8, 1, { x: 6, y: 6 });

    // 이동이 시작될 때까지 진행한다.
    for (let i = 0; i < 400 && !npc.moving; i += 1) npc.update(1000 / 60, terrain);
    expect(npc.moving).toBe(true);

    advance(npc, terrain, NPC_MOVE_DURATION_MS / 2);
    const pose = npc.pose(terrain);

    expect(Number.isInteger(pose.x) && Number.isInteger(pose.y)).toBe(false);
  });

  it('언덕 위에서는 발 높이가 반영된다', () => {
    const terrain = flat(9);
    const npc = new Npc(9, 1, { x: 4, y: 4 });

    expect(npc.pose(terrain).z).toBe(1);

    terrain.place(4, 4, BlockType.DIRT);
    expect(npc.pose(terrain).z).toBe(2);
  });
});
