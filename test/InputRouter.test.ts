import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { BlueprintId } from '../src/core/blueprints';
import { ItemType } from '../src/core/items';
import { Terrain } from '../src/core/Terrain';
import { MapId } from '../src/core/maps';
import { mapUnlockLevel } from '../src/core/village';
import type { ActionResult } from '../src/sim/Game';
import { Game } from '../src/sim/Game';
import { ResourceField } from '../src/sim/ResourceField';
import { InputRouter } from '../src/ui/InputRouter';
import { KeyboardControls } from '../src/ui/KeyboardControls';
import { FakeTarget } from './support/keyTarget';

/** 게임 루프와 같은 60Hz. */
const STEP_MS = 1000 / 60;

/**
 * 키보드만으로 조작하는 판을 차린다.
 *
 * 마우스 이벤트를 한 번도 보내지 않는다는 것이 이 파일의 핵심이다 — 지금까지
 * 봇 통과 플레이가 `Game` API를 직접 불러 입력 계층을 검증하지 않았고, 그 틈에
 * "고를 수 없는 설계도" 같은 결함이 오래 남았다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function setup(size = 11) {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 2, BlockType.DIRT);
  }

  const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
  const target = new FakeTarget();
  const keyboard = new KeyboardControls(target as unknown as EventTarget);

  const toasts: string[] = [];
  const zooms: number[] = [];
  const reports: ActionResult[] = [];
  const router = new InputRouter(game, keyboard, {
    report: (result) => reports.push(result),
    toast: (message) => toasts.push(message),
    zoomBy: (factor) => zooms.push(factor),
  });
  router.bind();
  keyboard.attach();

  /**
   * 게임을 몇 스텝 진행한다.
   *
   * @param steps 진행할 스텝 수.
   */
  function step(steps = 1): void {
    for (let i = 0; i < steps; i += 1) {
      router.update(STEP_MS);
      game.update(STEP_MS);
    }
  }

  /**
   * 키를 눌렀다 뗀다.
   *
   * @param code 키 코드.
   */
  function press(code: string): void {
    target.keyDown(code);
    target.keyUp(code);
  }

  /**
   * 커서를 목표 오프셋으로 옮긴다. IJKL만 쓴다.
   *
   * @param dx 목표 x 오프셋.
   * @param dy 목표 y 오프셋.
   */
  function aimTo(dx: number, dy: number): void {
    for (let guard = 0; guard < 40 && router.cursor.keyboardOffset.dx !== dx; guard += 1) {
      press(router.cursor.keyboardOffset.dx < dx ? 'KeyL' : 'KeyJ');
      step();
    }
    for (let guard = 0; guard < 40 && router.cursor.keyboardOffset.dy !== dy; guard += 1) {
      press(router.cursor.keyboardOffset.dy < dy ? 'KeyK' : 'KeyI');
      step();
    }
  }

  return { game, terrain, router, target, step, press, aimTo, toasts, zooms, reports };
}

/**
 * 플레이어 주변에서 건물도 없는 인접 칸의 오프셋을 고른다.
 *
 * 창고가 시작 칸 옆에 놓이므로 그 자리를 피해야 판정이 자원 쪽으로 간다.
 *
 * @param game 대상 게임.
 */
function freeNeighborOffset(game: Game): { dx: number; dy: number } {
  const { x, y } = game.player.position;
  const candidates = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  const found = candidates.find(
    (offset) =>
      game.terrain.contains(x + offset.dx, y + offset.dy) &&
      !game.isOccupied({ x: x + offset.dx, y: y + offset.dy }),
  );
  if (!found) throw new Error('인접한 빈 칸이 없다');

  return found;
}

describe('키보드 겨냥', () => {
  it('IJKL로 겨냥한 칸이 바뀐다', () => {
    const { router, game, press, step } = setup();
    const before = router.target;

    press('KeyI');
    step();

    expect(router.target).not.toEqual(before);
    expect(router.target).toEqual({
      x: game.player.position.x + router.cursor.keyboardOffset.dx,
      y: game.player.position.y + router.cursor.keyboardOffset.dy,
    });
  });

  it('걸으면 커서가 앞으로 되잡힌다', () => {
    const { router, target, step } = setup();

    // 뒤쪽을 겨냥해 두고 앞으로 걷는다.
    target.keyDown('KeyJ');
    step(20);
    target.keyUp('KeyJ');

    target.keyDown('KeyS');
    step(30);
    target.keyUp('KeyS');

    expect(router.cursor.keyboardOffset).toEqual({ dx: 0, dy: 1 });
  });

  it('마우스가 움직이면 마우스가 겨냥을 가져간다', () => {
    const { router } = setup();

    router.setPointerTile({ x: 0, y: 0 });

    expect(router.target).toEqual({ x: 0, y: 0 });
  });
});

describe('방향키 이동', () => {
  it('방향키를 누르면 WASD와 마찬가지로 플레이어가 걷는다', () => {
    const { game, target, step } = setup();
    const before = game.player.position;

    target.keyDown('ArrowRight');
    step(12);
    target.keyUp('ArrowRight');

    expect(game.player.position).toEqual({ x: before.x + 1, y: before.y });
  });

  it('이동 키를 누른 Space는 먼 커서 대신 그 방향 앞 칸에 행동한다', () => {
    const { game, terrain, target, aimTo, press, step } = setup();
    const position = game.player.position;
    const offset = freeNeighborOffset(game);
    const front = { x: position.x + offset.dx, y: position.y + offset.dy };
    const behind = { x: position.x - offset.dx, y: position.y - offset.dy };
    const frontHeight = terrain.columnHeight(front.x, front.y);
    const behindHeight = terrain.columnHeight(behind.x, behind.y);
    const moveKey = offset.dx > 0 ? 'ArrowRight' : offset.dx < 0 ? 'ArrowLeft' : offset.dy > 0 ? 'ArrowDown' : 'ArrowUp';

    // 커서를 반대쪽으로 멀리 옮겨도, 이동 키+Space는 앞 칸을 쓴다.
    aimTo(-offset.dx * 3, -offset.dy * 3);
    target.keyDown(moveKey);
    press('Space');
    target.keyUp('ArrowRight');
    step(20);

    expect(terrain.columnHeight(front.x, front.y)).toBe(frontHeight - 1);
    expect(terrain.columnHeight(behind.x, behind.y)).toBe(behindHeight);
  });

  it('건축 모드에서는 이동 키를 눌러도 멀리 고른 부지를 유지한다', () => {
    const { game, router, target, press, step } = setup();
    game.storage.add(ItemType.WOOD, 20);
    game.storage.add(ItemType.STONE, 10);
    press('KeyB');
    press('KeyJ');
    press('KeyJ');
    press('KeyJ');
    press('KeyI');
    press('KeyI');
    press('KeyI');
    const aimed = router.target!;

    target.keyDown('ArrowRight');
    press('Space');
    target.keyUp('ArrowRight');
    step();

    expect(game.buildings.buildingAt(aimed.x, aimed.y)).toBeDefined();
  });
});

describe('키보드만으로 플레이', () => {
  it('Space로 겨냥한 칸을 판다', () => {
    const { game, terrain, aimTo, press, step } = setup();
    const offset = freeNeighborOffset(game);
    aimTo(offset.dx, offset.dy);

    const tile = { x: game.player.position.x + offset.dx, y: game.player.position.y + offset.dy };
    const before = terrain.columnHeight(tile.x, tile.y);

    press('Space');
    step();

    expect(terrain.columnHeight(tile.x, tile.y)).toBe(before - 1);
    expect(game.inventory.count(ItemType.DIRT)).toBe(1);
  });

  it('Space를 누르고 있으면 이어서 판다', () => {
    const { game, terrain, aimTo, target, step } = setup();
    const offset = freeNeighborOffset(game);
    aimTo(offset.dx, offset.dy);

    const tile = { x: game.player.position.x + offset.dx, y: game.player.position.y + offset.dy };

    target.keyDown('Space');
    step(60);
    target.keyUp('Space');

    // 높이 2짜리 열이라 두 번 파면 바닥이다.
    expect(terrain.columnHeight(tile.x, tile.y)).toBe(0);
    expect(game.inventory.count(ItemType.DIRT)).toBe(2);
  });

  it('Q로 판 자리를 다시 쌓는다', () => {
    const { game, terrain, aimTo, press, step } = setup();
    const offset = freeNeighborOffset(game);
    aimTo(offset.dx, offset.dy);
    const tile = { x: game.player.position.x + offset.dx, y: game.player.position.y + offset.dy };

    press('Space');
    // 휘두르기 쿨다운이 끝나야 다음 행동을 받는다.
    step(20);
    const dug = terrain.columnHeight(tile.x, tile.y);

    press('KeyQ');
    step();

    expect(terrain.columnHeight(tile.x, tile.y)).toBe(dug + 1);
    expect(game.inventory.count(ItemType.DIRT)).toBe(0);
  });

  it('E로 창고에 맡긴다', () => {
    const { game, press, step } = setup();
    game.inventory.add(ItemType.WOOD, 5);

    press('KeyE');
    step();

    expect(game.storage.count(ItemType.WOOD)).toBe(5);
    expect(game.inventory.count(ItemType.WOOD)).toBe(0);
  });

  it('B로 건축 모드를 켜고 Esc로 끈다', () => {
    const { game, press, step } = setup();

    press('KeyB');
    step();
    expect(game.buildMode).toBe(true);

    press('Escape');
    step();
    expect(game.buildMode).toBe(false);
  });

  it('[ ]로 설계도를 순환한다 — 숫자 키는 아홉에서 상한에 닿는다', () => {
    const { game, press, step } = setup();
    game.setVillageLevel(5);

    press('BracketRight');
    step();
    const first = game.blueprint?.id;
    expect(first).toBeDefined();

    press('BracketRight');
    step();
    expect(game.blueprint?.id).not.toBe(first);

    press('BracketLeft');
    step();
    expect(game.blueprint?.id).toBe(first);
  });

  it('설계도 순환은 목록 끝에서 처음으로 돌아온다', () => {
    const { game, press, step } = setup();
    game.setVillageLevel(5);
    const count = game.availableBlueprints.length;

    press('BracketRight');
    step();
    const first = game.blueprint?.id;
    for (let i = 0; i < count; i += 1) {
      press('BracketRight');
      step();
    }

    expect(game.blueprint?.id).toBe(first);
  });

  it('숫자 키가 해금된 설계도를 끝까지 고른다', () => {
    // 이 테스트가 없어서 창고(4번)와 큰 집(5번)을 아무도 고를 수 없었다.
    const { game, press, step } = setup();
    game.setVillageLevel(3);

    press('KeyB');
    step();

    expect(game.availableBlueprints).toHaveLength(5);

    press('Digit4');
    step();
    expect(game.blueprint?.id).toBe(game.availableBlueprints[3]?.id);

    press('Digit5');
    step();
    expect(game.blueprint?.id).toBe(BlueprintId.MANOR);
  });

  it('키보드만으로 집을 짓는다', () => {
    const { game, router, press, aimTo, step } = setup();
    game.storage.add(ItemType.WOOD, 20);
    game.storage.add(ItemType.STONE, 10);

    // B는 첫 설계도를 골라 준다. 같은 번호를 다시 누르면 선택이 풀리므로 누르지 않는다.
    press('KeyB');
    step();
    expect(game.blueprint?.id).toBe(BlueprintId.COTTAGE);

    // 창고에서 떨어진 평지를 부지로 찍는다.
    aimTo(-3, -3);
    expect(game.ghost(router.target)?.valid).toBe(true);

    press('Space');
    step();

    // 시작 창고와 방금 지은 집.
    expect(Array.from(game.buildings.all)).toHaveLength(2);
    expect(game.totalHeld(ItemType.WOOD)).toBe(8);
  });

  it('건축 모드에서 걸어도 찍어 둔 부지를 지킨다', () => {
    const { router, press, aimTo, target, step } = setup();

    press('KeyB');
    step();
    aimTo(-3, -3);

    target.keyDown('KeyS');
    step(30);
    target.keyUp('KeyS');

    expect(router.cursor.keyboardOffset).toEqual({ dx: -3, dy: -3 });
  });

  it('F로 동굴에 들어갔다 나온다 — 맵 이동도 키보드로 된다', () => {
    const { game, press, step } = setup();
    // 동굴은 마을 레벨로 열린다.
    game.setVillageLevel(mapUnlockLevel(MapId.CAVE));
    game.player.placeAt(game.portal.x, game.portal.y);

    press('KeyF');
    step();
    expect(game.currentMap).toBe(MapId.CAVE);

    press('KeyF');
    step();
    expect(game.currentMap).toBe(MapId.SURFACE);
  });

  it('통로 위가 아니면 F가 이유를 알린다', () => {
    const { press, step, reports } = setup();

    press('KeyF');
    step();

    expect(reports.some((result) => !result.ok && result.reason === 'notPortal')).toBe(true);
  });

  it('G는 일터가 아니면 이유를 알린다 — 배정도 키보드로 한다', () => {
    const { game, press, step, reports } = setup();
    const storage = game.startingStorage;
    game.player.placeAt(storage.x + 1, storage.y);
    // 커서를 창고 쪽으로 돌린다.
    press('KeyJ');
    press('KeyJ');
    step();

    press('KeyG');
    step();

    expect(reports.some((result) => !result.ok && result.reason === 'noWorkplace')).toBe(true);
  });

  it('R은 낼 요청이 없으면 알린다', () => {
    const { press, step, toasts } = setup();

    press('KeyR');
    step();

    expect(toasts).toContain('낼 수 있는 요청이 없습니다');
  });

  it('+/- 키로 시야를 조절한다 — 마우스 휠이 없어도 된다', () => {
    const { press, step, zooms } = setup();

    press('Equal');
    press('Minus');
    step();

    expect(zooms).toHaveLength(2);
    expect(zooms[0]).toBeGreaterThan(1);
    expect(zooms[1]).toBeLessThan(1);
  });
});
