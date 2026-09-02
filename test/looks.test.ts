import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { ItemType } from '../src/core/items';
import {
  BUILDING_LOOKS,
  isLookUnlocked,
  lookById,
  nextLook,
  unlockedLooks,
} from '../src/core/looks';
import { Terrain } from '../src/core/Terrain';
import { unlocksAtLevel } from '../src/core/village';
import { createSpriteSet } from '../src/render/sprites';
import { Game } from '../src/sim/Game';
import { ResourceField } from '../src/sim/ResourceField';

/**
 * 평평한 지형으로 게임을 만든다.
 *
 * @param level 시작 마을 레벨.
 */
function makeGame(level = 3): Game {
  const size = 13;
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 3, BlockType.DIRT);
  }

  const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
  game.setVillageLevel(level);
  game.storage.add(ItemType.WOOD, 60);
  game.storage.add(ItemType.STONE, 60);

  return game;
}

describe('외형 목록', () => {
  it('기본 외형은 처음부터 있다', () => {
    expect(unlockedLooks(1)).toHaveLength(1);
    expect(unlockedLooks(1)[0]?.id).toBe(0);
  });

  it('레벨이 오르면 늘어난다', () => {
    expect(unlockedLooks(20).length).toBe(BUILDING_LOOKS.length);
    expect(unlockedLooks(3).length).toBeGreaterThan(unlockedLooks(1).length);
  });

  it('열린 것들을 순환한다', () => {
    const first = nextLook(0, 3);
    expect(first).not.toBe(0);
    // 두 개만 열린 레벨에서는 다시 기본으로 돌아온다.
    expect(nextLook(first, 3)).toBe(0);
  });

  it('하나뿐이면 그대로 둔다', () => {
    expect(nextLook(0, 1)).toBe(0);
  });

  it('없는 번호는 기본으로 읽는다', () => {
    expect(lookById(999).id).toBe(0);
    expect(isLookUnlocked(999, 20)).toBe(false);
  });

  it('벽 색은 바꾸지 않는다 — 건물 종류를 알아보는 단서다', () => {
    for (const look of BUILDING_LOOKS) {
      expect(look).not.toHaveProperty('wallX');
    }
  });

  it('해금 목록에 외형이 들어간다', () => {
    const labels = unlocksAtLevel(3).map((unlock) => JSON.stringify(unlock));

    expect(labels.some((entry) => entry.includes('look'))).toBe(true);
  });
});

describe('외형 교체', () => {
  it('겨냥한 건물의 외형을 바꾼다', () => {
    const game = makeGame();
    const storage = game.startingStorage;

    const result = game.cycleLook({ x: storage.x, y: storage.y });

    expect(result.ok).toBe(true);
    expect(game.buildings.buildingById(storage.id)?.look).not.toBe(0);
  });

  it('열린 외형이 하나뿐이면 이유를 알린다 — 아무 일도 안 일어나면 고장으로 보인다', () => {
    const game = makeGame(1);

    const result = game.cycleLook({ x: game.startingStorage.x, y: game.startingStorage.y });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('noLook');
  });

  it('건물이 없으면 바꿀 것이 없다', () => {
    const game = makeGame();

    const result = game.cycleLook({ x: 0, y: 0 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('noBuilding');
  });

  it('규칙에는 영향이 없다 — 마을 점수도 기능도 그대로다', () => {
    const game = makeGame();
    const score = game.villageScore;
    const completed = game.buildings.completedCount;

    game.cycleLook({ x: game.startingStorage.x, y: game.startingStorage.y });

    expect(game.villageScore).toBe(score);
    expect(game.buildings.completedCount).toBe(completed);
  });

  it('외형이 저장에 남는다', () => {
    const game = makeGame();
    game.cycleLook({ x: game.startingStorage.x, y: game.startingStorage.y });
    const look = game.buildings.buildingById(game.startingStorage.id)?.look;

    const restored = Game.fromSave(game.toSave());

    expect(restored?.buildings.buildingById(game.startingStorage.id)?.look).toBe(look);
  });

  it('외형이 없던 시절의 저장은 기본으로 읽힌다', () => {
    const game = makeGame();
    const data = game.toSave();
    for (const building of data.buildings) delete building.look;

    const restored = Game.fromSave(data);

    expect(restored?.buildings.buildingById(game.startingStorage.id)?.look).toBe(0);
  });

  it('화면에 넘기는 값에 외형이 들어간다', () => {
    const game = makeGame();
    game.cycleLook({ x: game.startingStorage.x, y: game.startingStorage.y });

    const building = game.entities().find((entity) => entity.kind === 'building');

    expect(building && 'look' in building && building.look).not.toBe(0);
  });
});

describe('스프라이트 캐시', () => {
  it('외형마다 다른 그림을 만든다 — 캐시 키가 같으면 모두 마지막 외형이 된다', () => {
    const sprites = createSpriteSet();
    // 캔버스를 만들 수 없는 환경에서는 도형으로 그리므로 건너뛴다.
    if (!sprites) return;

    const plain = sprites.building('house', 2, 2, 0);
    const blue = sprites.building('house', 2, 2, 1);

    expect(plain).not.toBe(blue);
    expect(sprites.building('house', 2, 2, 1)).toBe(blue);
  });
});
