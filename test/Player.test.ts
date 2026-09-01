import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { Terrain } from '../src/core/Terrain';
import { ToolKind, ToolTier } from '../src/core/tools';
import { MOVE_DURATION_MS, SWING_DURATION_MS, Player } from '../src/sim/Player';

/**
 * 모든 열이 같은 높이인 지형을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 * @param height 각 열의 블록 수.
 */
function flat(size: number, height: number): Terrain {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, height, BlockType.DIRT);
  }
  return terrain;
}

/**
 * 시뮬레이션을 지정한 시간만큼 진행한다.
 *
 * @param player 대상 플레이어.
 * @param totalMs 진행할 시간(ms).
 * @param stepMs 스텝 길이(ms).
 */
function advance(player: Player, totalMs: number, stepMs = 1000 / 60): void {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) player.update(stepMs);
}

describe('Player 이동', () => {
  it('시작 위치에 서 있고 아무 행동도 하지 않는다', () => {
    const player = new Player(2, 3);

    expect(player.position).toEqual({ x: 2, y: 3 });
    expect(player.idle).toBe(true);
    expect(player.moving).toBe(false);
  });

  it('이동을 시작하면 이동 중 상태가 되고, 끝나면 도착 칸의 주인이 된다', () => {
    const terrain = flat(5, 2);
    const player = new Player(2, 2);

    expect(player.tryMove(terrain, 1, 0)).toBe(true);
    expect(player.moving).toBe(true);
    // 논리 위치는 이동이 끝날 때까지 출발 칸을 유지한다.
    expect(player.position).toEqual({ x: 2, y: 2 });

    advance(player, MOVE_DURATION_MS);

    expect(player.moving).toBe(false);
    expect(player.position).toEqual({ x: 3, y: 2 });
  });

  it('이동 중에는 새 이동을 받지 않는다', () => {
    const terrain = flat(5, 2);
    const player = new Player(2, 2);

    player.tryMove(terrain, 1, 0);
    expect(player.tryMove(terrain, 0, 1)).toBe(false);
  });

  it('갈 수 없는 방향으로는 이동이 시작되지 않는다', () => {
    const terrain = flat(5, 1);
    for (let i = 0; i < 3; i += 1) terrain.place(3, 2, BlockType.DIRT);
    const player = new Player(2, 2);

    expect(player.tryMove(terrain, 1, 0)).toBe(false);
    expect(player.moving).toBe(false);
  });

  it('맵 밖으로는 나갈 수 없다', () => {
    const terrain = flat(5, 2);
    const player = new Player(0, 0);

    expect(player.tryMove(terrain, -1, 0)).toBe(false);
  });

  it('이동 중 위치는 출발과 도착 사이를 지나간다', () => {
    const terrain = flat(5, 2);
    const player = new Player(2, 2);
    player.tryMove(terrain, 1, 0);

    advance(player, MOVE_DURATION_MS / 2);
    const pose = player.pose(terrain);

    expect(pose.x).toBeGreaterThan(2);
    expect(pose.x).toBeLessThan(3);
    expect(pose.y).toBe(2);
  });

  it('언덕을 오를 때 발 높이도 함께 보간된다', () => {
    const terrain = flat(5, 2);
    terrain.place(3, 2, BlockType.DIRT);
    const player = new Player(2, 2);

    const before = player.pose(terrain).z;
    player.tryMove(terrain, 1, 0);
    advance(player, MOVE_DURATION_MS / 2);
    const middle = player.pose(terrain).z;
    advance(player, MOVE_DURATION_MS);
    const after = player.pose(terrain).z;

    expect(before).toBe(1);
    expect(after).toBe(2);
    expect(middle).toBeGreaterThan(before);
    expect(middle).toBeLessThan(after);
  });

  it('연속 이동으로 여러 칸을 갈 수 있다', () => {
    const terrain = flat(6, 2);
    const player = new Player(1, 1);

    for (let i = 0; i < 3; i += 1) {
      expect(player.tryMove(terrain, 1, 0)).toBe(true);
      advance(player, MOVE_DURATION_MS);
    }

    expect(player.position).toEqual({ x: 4, y: 1 });
  });
});

describe('Player 도구', () => {
  it('기본 슬롯은 삽·곡괭이·도끼 순이다', () => {
    const player = new Player(0, 0);

    expect(player.slotCount).toBe(3);
    expect(player.tool.kind).toBe(ToolKind.SHOVEL);

    player.selectTool(1);
    expect(player.tool.kind).toBe(ToolKind.PICKAXE);

    player.selectTool(2);
    expect(player.tool.kind).toBe(ToolKind.AXE);
  });

  it('범위를 벗어난 슬롯 번호는 무시한다', () => {
    const player = new Player(0, 0);
    player.selectTool(1);

    player.selectTool(9);
    player.selectTool(-1);
    player.selectTool(1.5);

    expect(player.selectedSlot).toBe(1);
  });

  it('도구 등급을 올릴 수 있고, 내리지는 못한다', () => {
    const player = new Player(0, 0);

    expect(player.upgradeTool(ToolKind.PICKAXE, ToolTier.MID)).toBe(true);
    player.selectTool(1);
    expect(player.tool.tier).toBe(ToolTier.MID);

    expect(player.upgradeTool(ToolKind.PICKAXE, ToolTier.BASIC)).toBe(false);
    expect(player.tool.tier).toBe(ToolTier.MID);
  });
});

describe('Player 휘두르기', () => {
  it('휘두르는 동안은 새 행동을 받지 않고, 끝나면 다시 받는다', () => {
    const terrain = flat(5, 2);
    const player = new Player(2, 2);

    expect(player.trySwing()).toBe(true);
    expect(player.swinging).toBe(true);
    expect(player.idle).toBe(false);
    expect(player.tryMove(terrain, 1, 0)).toBe(false);

    advance(player, SWING_DURATION_MS);

    expect(player.swinging).toBe(false);
    expect(player.idle).toBe(true);
  });

  it('휘두르기 진행도는 0에서 1로 올라간다', () => {
    const player = new Player(0, 0);
    player.trySwing();

    const start = player.pose(new Terrain(2, 2)).swing;
    advance(player, SWING_DURATION_MS * 0.6);
    const middle = player.pose(new Terrain(2, 2)).swing;

    expect(start).toBeLessThan(middle);
    expect(middle).toBeLessThan(1);
  });

  it('이동 중에는 휘두를 수 없다', () => {
    const terrain = flat(5, 2);
    const player = new Player(2, 2);
    player.tryMove(terrain, 1, 0);

    expect(player.trySwing()).toBe(false);
  });
});

describe('Player.settle', () => {
  it('발밑이 사라지면 설 수 있는 인접 칸으로 밀려난다', () => {
    const terrain = flat(5, 1);
    const player = new Player(2, 2);

    terrain.dig(2, 2);
    expect(player.settle(terrain)).toBe(true);
    expect(player.position).not.toEqual({ x: 2, y: 2 });
    expect(terrain.columnHeight(player.position.x, player.position.y)).toBeGreaterThanOrEqual(1);
  });

  it('발밑이 멀쩡하면 아무것도 하지 않는다', () => {
    const terrain = flat(5, 2);
    const player = new Player(2, 2);

    expect(player.settle(terrain)).toBe(false);
    expect(player.position).toEqual({ x: 2, y: 2 });
  });
});
