import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { BlueprintId } from '../src/core/blueprints';
import { ItemType } from '../src/core/items';
import { MILESTONE_ORDER, Milestone, summarize } from '../src/core/journal';
import { Terrain } from '../src/core/Terrain';
import { Game } from '../src/sim/Game';
import { Journal } from '../src/sim/Journal';
import { ResourceField } from '../src/sim/ResourceField';

/**
 * 평평한 지형으로 게임을 만든다.
 *
 * @param size 정사각 맵의 한 변.
 */
function makeGame(size = 13): Game {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 3, BlockType.DIRT);
  }

  return new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
}

describe('기록', () => {
  it('이정표는 처음 한 번만 적힌다 — 매번 덮으면 마지막 시각이 된다', () => {
    const journal = new Journal();

    journal.mark(Milestone.FIRST_HARVEST, 1_000);
    journal.mark(Milestone.FIRST_HARVEST, 9_000);

    expect(journal.data.milestones[Milestone.FIRST_HARVEST]).toBe(1_000);
  });

  it('거절을 사유별로 센다', () => {
    const journal = new Journal();

    journal.deny('noMaterial');
    journal.deny('noMaterial');
    journal.deny('notAdjacent');

    expect(journal.data.denials.noMaterial).toBe(2);
    expect(journal.data.denials.notAdjacent).toBe(1);
  });

  it('연타 중에 나오는 "바쁘다"는 막힘으로 세지 않는다', () => {
    const journal = new Journal();

    journal.deny('busy');

    expect(journal.data.denials.busy ?? 0).toBe(0);
  });

  it('요약에 이정표와 막힘이 모두 들어간다', () => {
    const journal = new Journal();
    journal.advance(65_000);
    journal.mark(Milestone.FIRST_HARVEST, 12_000);
    journal.markLevel(2, 40_000);
    journal.deny('badPlacement');

    const text = journal.summary;

    expect(text).toContain('1:05');
    expect(text).toContain('첫 채집: 0:12');
    expect(text).toContain('2=0:40');
    expect(text).toContain('놓을 자리가 아니어서: 1번');
  });

  it('겪지 않은 이정표는 "없음"으로 적힌다 — 빈칸이 곧 막힌 지점이다', () => {
    const text = summarize({ milestones: {}, levels: {}, denials: {}, playedMs: 0 });

    for (const milestone of MILESTONE_ORDER) {
      expect(text).toContain('없음');
      expect(milestone).toBeTruthy();
    }
  });

  it('개인을 식별할 것은 담지 않는다 — 시각·사건·횟수뿐이다', () => {
    const journal = new Journal();
    journal.advance(1_000);
    journal.mark(Milestone.FIRST_BUILD, 500);

    const keys = Object.keys(journal.toSave());

    expect(keys.sort()).toEqual(['denials', 'levels', 'milestones', 'playedMs']);
  });

  it('저장에 담기고 되살아난다', () => {
    const journal = new Journal();
    journal.advance(30_000);
    journal.mark(Milestone.FIRST_DEPOSIT, 20_000);
    journal.markLevel(3, 25_000);
    journal.deny('noMaterial');

    const restored = new Journal();
    restored.restore(journal.toSave());

    expect(restored.summary).toBe(journal.summary);
  });

  it('이상한 저장값은 버린다', () => {
    const journal = new Journal();

    journal.restore({
      milestones: { firstHarvest: Number.NaN },
      levels: { abc: 100 },
      denials: { noMaterial: Number.POSITIVE_INFINITY },
      playedMs: Number.NaN,
    } as never);

    expect(journal.data.playedMs).toBe(0);
    expect(journal.data.milestones[Milestone.FIRST_HARVEST]).toBeUndefined();
    expect(Object.keys(journal.data.levels)).toHaveLength(0);
  });
});

describe('게임이 남기는 기록', () => {
  it('첫 채집과 첫 예치가 적힌다', () => {
    const game = makeGame();
    const at = game.player.position;

    // 옆칸을 판다.
    for (const step of [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ]) {
      const target = { x: at.x + step.dx, y: at.y + step.dy };
      if (game.isOccupied(target)) continue;
      game.actAt(target);
      break;
    }

    expect(game.journal.data.milestones[Milestone.FIRST_HARVEST]).toBeDefined();

    game.inventory.add(ItemType.WOOD, 3);
    game.depositAll();

    expect(game.journal.data.milestones[Milestone.FIRST_DEPOSIT]).toBeDefined();
  });

  it('거절이 기록에 남는다 — 어디서 멈췄는지가 여기서 보인다', () => {
    const game = makeGame();
    // 우물은 레벨 1에 열려 있고 돌 열 개를 요구한다. 자재가 없으니 거절된다.
    game.selectBlueprint(BlueprintId.WELL);

    game.buildAt({ x: 5, y: 5 });

    expect(game.journal.data.denials.noMaterial).toBe(1);
  });

  it('첫 착공과 레벨 도달이 적힌다', () => {
    const game = makeGame();
    game.storage.add(ItemType.STONE, 20);
    game.selectBlueprint(BlueprintId.WELL);
    expect(game.buildAt({ x: 5, y: 5 }).ok).toBe(true);

    expect(game.journal.data.milestones[Milestone.FIRST_BUILD]).toBeDefined();

    game.setVillageLevel(1);
    for (let step = 0; step < 600; step += 1) game.update(1000 / 60);
  });

  it('기록이 저장 왕복을 견딘다', () => {
    const game = makeGame();
    game.storage.add(ItemType.STONE, 20);
    game.selectBlueprint(BlueprintId.WELL);
    game.buildAt({ x: 5, y: 5 });
    for (let step = 0; step < 120; step += 1) game.update(1000 / 60);

    const restored = Game.fromSave(game.toSave());

    expect(restored?.journal.summary).toBe(game.journal.summary);
  });

  it('기록이 없던 시절의 저장도 그대로 읽힌다 — 선택적 필드다', () => {
    const game = makeGame();
    const data = game.toSave();
    delete data.journal;

    const restored = Game.fromSave(data);

    expect(restored).not.toBeNull();
    expect(restored?.journal.data.playedMs).toBe(0);
  });
});
