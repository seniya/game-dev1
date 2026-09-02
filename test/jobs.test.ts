import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import { BlueprintId, blueprintById } from '../src/core/blueprints';
import { DAY_LENGTH_MS } from '../src/core/daycycle';
import { ItemType } from '../src/core/items';
import {
  JOB_DEFINITION,
  JobKind,
  SLOTS_PER_WORKPLACE,
  isWorkplace,
  jobDefinition,
  jobForWorkplace,
} from '../src/core/jobs';
import { nodeDefinition, NodeKind } from '../src/core/resourceNodes';
import { Terrain } from '../src/core/Terrain';
import { Game } from '../src/sim/Game';
import { ResourceField } from '../src/sim/ResourceField';

/** 시뮬레이션 한 스텝(ms). */
const STEP_MS = 1000 / 60;

/**
 * 평평한 지형으로 게임을 만든다. 자재는 넉넉히 채워 둔다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function makeGame(size = 15): Game {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 3, BlockType.DIRT);
  }

  const game = new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
  game.setVillageLevel(5);
  game.storage.add(ItemType.WOOD, 90);
  game.storage.add(ItemType.STONE, 90);
  game.storage.add(ItemType.IRON_ORE, 30);
  game.storage.add(ItemType.CRYSTAL, 9);

  return game;
}

/**
 * 게임 시간을 흘린다.
 *
 * @param game 대상 게임.
 * @param totalMs 흘릴 시간(ms).
 */
function advance(game: Game, totalMs: number): void {
  for (let elapsed = 0; elapsed < totalMs; elapsed += STEP_MS) game.update(STEP_MS);
}

/**
 * 건물을 지어 완공까지 진행한다.
 *
 * @param game 대상 게임.
 * @param id 블루프린트 식별자.
 * @param at 놓을 칸.
 */
function build(game: Game, id: BlueprintId, at: { x: number; y: number }): void {
  game.selectBlueprint(id);
  const result = game.buildAt(at);
  if (!result.ok) throw new Error(`짓지 못했다: ${result.reason}`);
  game.selectBlueprint(null);
  advance(game, 6000);
}

/**
 * 주민이 들어올 때까지 집을 짓고 기다린다.
 *
 * @param game 대상 게임.
 * @param count 필요한 주민 수.
 */
function settleResidents(game: Game, count: number): void {
  let spot = 2;
  while (game.population.count < count) {
    build(game, BlueprintId.COTTAGE, { x: spot, y: 2 });
    spot += 3;
    advance(game, 8000);
    if (spot > 12) break;
  }
  if (game.population.count < count) throw new Error('주민이 들어오지 않았다');
}

describe('직업 정의', () => {
  it('일터마다 직업이 하나씩 있다', () => {
    expect(jobForWorkplace(BlueprintId.WORKBENCH)).toBe(JobKind.CARPENTER);
    expect(jobForWorkplace(BlueprintId.QUARRY)).toBe(JobKind.QUARRIER);
    expect(jobForWorkplace(BlueprintId.FORGE)).toBe(JobKind.SMITH);
  });

  it('집과 창고는 일터가 아니다', () => {
    expect(isWorkplace(BlueprintId.COTTAGE)).toBe(false);
    expect(isWorkplace(BlueprintId.WAREHOUSE)).toBe(false);
    expect(isWorkplace(BlueprintId.WELL)).toBe(false);
  });

  it('상위 자원일수록 느리게 나온다', () => {
    const wood = jobDefinition(JobKind.CARPENTER).intervalMs;
    const stone = jobDefinition(JobKind.QUARRIER).intervalMs;
    const iron = jobDefinition(JobKind.SMITH).intervalMs;

    expect(stone).toBeGreaterThan(wood);
    expect(iron).toBeGreaterThan(stone);
  });

  it('수정은 아무도 만들지 못한다 — 동굴은 직접 가야 한다', () => {
    const produced = Object.values(JOB_DEFINITION).map((job) => job.produces);

    expect(produced).not.toContain(ItemType.CRYSTAL);
  });

  it('생산은 손 채집보다 한참 느리다 — 보조지 대체가 아니다', () => {
    // 나무 한 그루는 몇 초 만에 목재 세 개를 준다. 목수는 같은 시간에 한 개도 못 낸다.
    const tree = nodeDefinition(NodeKind.TREE);
    const carpenter = jobDefinition(JobKind.CARPENTER);

    const handRate = tree.dropAmount / (tree.durability * 0.3);
    const jobRate = carpenter.amount / (carpenter.intervalMs / 1000);

    expect(jobRate * 10).toBeLessThan(handRate);
  });
});

describe('일터 배정', () => {
  it('일터가 아닌 건물에는 배정할 수 없다', () => {
    const game = makeGame();
    const storage = game.startingStorage;

    const result = game.toggleWorker({ x: storage.x, y: storage.y });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('noWorkplace');
  });

  it('주민이 없으면 배정할 수 없다', () => {
    const game = makeGame();
    build(game, BlueprintId.WORKBENCH, { x: 8, y: 8 });

    const result = game.toggleWorker({ x: 8, y: 8 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('noWorker');
  });

  it('같은 키로 배정하고 해제한다', () => {
    const game = makeGame();
    settleResidents(game, 1);
    build(game, BlueprintId.WORKBENCH, { x: 8, y: 8 });

    expect(game.toggleWorker({ x: 8, y: 8 }).ok).toBe(true);
    expect(game.jobSlots.assigned).toBe(1);

    expect(game.toggleWorker({ x: 8, y: 8 }).ok).toBe(true);
    expect(game.jobSlots.assigned).toBe(0);
  });

  it('일터 한 채는 자리 하나다 — 주민이 마흔이어도 일터가 없으면 아무도 일하지 않는다', () => {
    const game = makeGame();
    settleResidents(game, 2);
    build(game, BlueprintId.WORKBENCH, { x: 8, y: 8 });

    game.toggleWorker({ x: 8, y: 8 });

    expect(game.jobSlots.total).toBe(SLOTS_PER_WORKPLACE);
    expect(game.jobSlots.assigned).toBe(1);
    expect(game.population.idleWorkers.length).toBeGreaterThan(0);
  });

  it('철거하면 배정이 풀린다 — 없어진 일터로 출근하지 않는다', () => {
    const game = makeGame();
    settleResidents(game, 1);
    build(game, BlueprintId.WORKBENCH, { x: 8, y: 8 });
    game.toggleWorker({ x: 8, y: 8 });
    expect(game.jobSlots.assigned).toBe(1);

    game.demolishAt({ x: 8, y: 8 });

    expect(game.jobSlots.assigned).toBe(0);
    expect(game.jobSlots.total).toBe(0);
  });

  it('동굴에서는 배정할 수 없다', () => {
    const game = makeGame();
    settleResidents(game, 1);
    build(game, BlueprintId.WORKBENCH, { x: 8, y: 8 });

    game.player.placeAt(game.portal.x, game.portal.y);
    game.travel();

    const result = game.toggleWorker({ x: 8, y: 8 });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('notVillage');
  });
});

describe('자동 생산', () => {
  /**
   * 주민 하나를 작업대에 배정한 게임을 만든다.
   */
  function withCarpenter() {
    const game = makeGame();
    settleResidents(game, 1);
    build(game, BlueprintId.WORKBENCH, { x: 8, y: 8 });
    game.toggleWorker({ x: 8, y: 8 });

    return game;
  }

  it('낮 동안 창고에 자원이 쌓인다', () => {
    const game = withCarpenter();
    const before = game.storage.count(ItemType.WOOD);

    advance(game, jobDefinition(JobKind.CARPENTER).intervalMs * 2);

    expect(game.storage.count(ItemType.WOOD)).toBeGreaterThan(before);
  });

  it('배정하지 않으면 아무것도 나오지 않는다', () => {
    const game = makeGame();
    settleResidents(game, 1);
    build(game, BlueprintId.WORKBENCH, { x: 8, y: 8 });
    const before = game.storage.count(ItemType.WOOD);

    advance(game, jobDefinition(JobKind.CARPENTER).intervalMs * 2);

    expect(game.storage.count(ItemType.WOOD)).toBe(before);
  });

  it('밤에는 일하지 않는다 — 주민은 집으로 돌아간다', () => {
    const game = withCarpenter();

    // 밤이 될 때까지 흘린 뒤, 밤 동안의 생산만 잰다.
    advance(game, DAY_LENGTH_MS * 0.55);
    expect(game.isNight).toBe(true);

    const before = game.storage.count(ItemType.WOOD);
    advance(game, jobDefinition(JobKind.CARPENTER).intervalMs * 1.5);

    expect(game.storage.count(ItemType.WOOD)).toBe(before);
  });

  it('생산물은 인벤토리가 아니라 창고로 간다 — 짐이 늘면 채집이 막힌다', () => {
    const game = withCarpenter();
    const carried = game.inventory.total;

    advance(game, jobDefinition(JobKind.CARPENTER).intervalMs * 2);

    expect(game.inventory.total).toBe(carried);
  });

  it('배정을 풀면 생산이 멈춘다', () => {
    const game = withCarpenter();
    advance(game, jobDefinition(JobKind.CARPENTER).intervalMs);

    game.toggleWorker({ x: 8, y: 8 });
    const before = game.storage.count(ItemType.WOOD);
    advance(game, jobDefinition(JobKind.CARPENTER).intervalMs * 2);

    expect(game.storage.count(ItemType.WOOD)).toBe(before);
  });

  it('배정은 저장에 남는다', () => {
    const game = withCarpenter();

    const restored = Game.fromSave(game.toSave());

    expect(restored?.jobSlots.assigned).toBe(1);
    expect(restored?.jobSlots.total).toBe(1);
  });

  it('배정된 주민은 낮에 일터 쪽으로 모인다', () => {
    const game = withCarpenter();
    const worker = game.population.all.find((npc) => npc.jobBuildingId !== null);
    if (!worker) throw new Error('배정된 주민이 없다');

    advance(game, 1000);
    const workplace = blueprintById(BlueprintId.WORKBENCH);
    expect(workplace.width).toBeGreaterThan(0);

    // 기준점이 집이 아니라 일터 근처로 옮겨졌다.
    const anchor = worker.anchor;
    const distanceToWorkplace = Math.abs(anchor.x - 8) + Math.abs(anchor.y - 8);

    expect(distanceToWorkplace).toBeLessThanOrEqual(2);
  });
});
