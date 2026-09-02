import { describe, expect, it } from 'vitest';
import {
  BLUEPRINTS,
  BlueprintId,
  blueprintById,
  buildDurationMs,
  unlockedBlueprints,
} from '../src/core/blueprints';
import { ItemType } from '../src/core/items';

describe('블루프린트 정의', () => {
  it('MVP 5종에 대장간과 채석장을 더해 갖는다', () => {
    expect(BLUEPRINTS).toHaveLength(7);
    expect(BLUEPRINTS.map((blueprint) => blueprint.id).sort()).toEqual(
      [
        BlueprintId.COTTAGE,
        BlueprintId.MANOR,
        BlueprintId.WAREHOUSE,
        BlueprintId.WELL,
        BlueprintId.WORKBENCH,
        BlueprintId.FORGE,
        BlueprintId.QUARRY,
      ].sort(),
    );
  });

  it('대장간만 수정을 요구한다 — 동굴에 갈 이유다', () => {
    const needsCrystal = BLUEPRINTS.filter((blueprint) =>
      blueprint.materials.some((material) => material.item === ItemType.CRYSTAL),
    );

    expect(needsCrystal.map((blueprint) => blueprint.id)).toEqual([BlueprintId.FORGE]);
  });

  it('모든 블루프린트에 이름·면적·자재가 있다', () => {
    for (const blueprint of BLUEPRINTS) {
      expect(blueprint.label).toBeTruthy();
      expect(blueprint.width).toBeGreaterThanOrEqual(1);
      expect(blueprint.depth).toBeGreaterThanOrEqual(1);
      expect(blueprint.materials.length).toBeGreaterThan(0);
      for (const requirement of blueprint.materials) {
        expect(requirement.amount).toBeGreaterThan(0);
      }
    }
  });

  it('집만 주민을 수용하고 창고만 저장 공간을 늘린다', () => {
    const housing = BLUEPRINTS.filter((blueprint) => blueprint.housing > 0).map((b) => b.id);
    const storage = BLUEPRINTS.filter((blueprint) => blueprint.storageSlots > 0).map((b) => b.id);

    expect(housing.sort()).toEqual([BlueprintId.COTTAGE, BlueprintId.MANOR].sort());
    expect(storage).toEqual([BlueprintId.WAREHOUSE]);
  });

  it('큰 집이 작은 집보다 비싸고 더 많은 주민을 수용한다', () => {
    const cottage = blueprintById(BlueprintId.COTTAGE);
    const manor = blueprintById(BlueprintId.MANOR);

    const woodOf = (id: BlueprintId) =>
      blueprintById(id).materials.find((m) => m.item === ItemType.WOOD)?.amount ?? 0;

    expect(woodOf(BlueprintId.MANOR)).toBeGreaterThan(woodOf(BlueprintId.COTTAGE));
    expect(manor.housing).toBeGreaterThan(cottage.housing);
    expect(manor.unlockLevel).toBeGreaterThan(cottage.unlockLevel);
  });

  it('없는 식별자를 찾으면 예외를 던진다', () => {
    expect(() => blueprintById('없음' as BlueprintId)).toThrow(RangeError);
  });
});

describe('unlockedBlueprints', () => {
  it('레벨 1에서는 초기 블루프린트만 해금된다', () => {
    const unlocked = unlockedBlueprints(1);

    expect(unlocked.length).toBeGreaterThan(0);
    expect(unlocked.every((blueprint) => blueprint.unlockLevel === 1)).toBe(true);
  });

  it('레벨이 오르면 목록이 늘어난다', () => {
    expect(unlockedBlueprints(3).length).toBeGreaterThan(unlockedBlueprints(1).length);
  });

  it('최대 레벨에서는 전부 해금된다', () => {
    const maxLevel = Math.max(...BLUEPRINTS.map((blueprint) => blueprint.unlockLevel));

    expect(unlockedBlueprints(maxLevel)).toHaveLength(BLUEPRINTS.length);
  });

  it('정의 순서를 유지한다 — 목록 단축키 번호가 흔들리지 않게', () => {
    const unlocked = unlockedBlueprints(9);

    expect(unlocked.map((blueprint) => blueprint.id)).toEqual(BLUEPRINTS.map((b) => b.id));
  });
});

describe('buildDurationMs', () => {
  it('기획서 5.3의 3~5초 범위에 든다', () => {
    for (const blueprint of BLUEPRINTS) {
      const duration = buildDurationMs(blueprint);
      expect(duration).toBeGreaterThanOrEqual(3000);
      expect(duration).toBeLessThanOrEqual(5000);
    }
  });

  it('바닥 면적이 크면 더 오래 걸린다', () => {
    expect(buildDurationMs(blueprintById(BlueprintId.COTTAGE))).toBeGreaterThan(
      buildDurationMs(blueprintById(BlueprintId.WELL)),
    );
  });
});
