import { describe, expect, it } from 'vitest';
import { BlockType } from '../src/core/blocks';
import {
  DAY_LENGTH_MS,
  DayPhase,
  clockLabel,
  dayNumber,
  dayTint,
  isNight,
  nightAmount,
  phaseAt,
  phaseLabel,
  timeOfDay,
} from '../src/core/daycycle';
import { HintId, pickHint, type GuidanceState } from '../src/core/guidance';
import { Terrain } from '../src/core/Terrain';
import { Game } from '../src/sim/Game';
import { ResourceField } from '../src/sim/ResourceField';

/**
 * 평평한 지형으로 게임을 만든다.
 *
 * @param size 정사각 맵의 한 변 길이.
 */
function makeGame(size = 11): Game {
  const terrain = new Terrain(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) terrain.fillColumn(x, y, 3, BlockType.DIRT);
  }

  return new Game(terrain, new ResourceField(terrain, { densityScale: 0 }));
}

/**
 * 게임 시간을 흘린다.
 *
 * @param game 대상 게임.
 * @param totalMs 흘릴 시간(ms).
 */
function advance(game: Game, totalMs: number): void {
  const stepMs = 1000 / 60;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) game.update(stepMs);
}

/** 하루 안에서의 위치를 시간으로 나타내는 도우미. */
const at = (fraction: number) => fraction;

describe('하루의 흐름', () => {
  it('아침에 시작한다 — 처음 켠 화면이 어두우면 할 일을 찾기 어렵다', () => {
    expect(phaseAt(timeOfDay(0))).toBe(DayPhase.DAY);
  });

  it('하루가 지나면 같은 시각으로 돌아온다', () => {
    expect(timeOfDay(DAY_LENGTH_MS)).toBeCloseTo(timeOfDay(0), 10);
  });

  it('날짜가 하루마다 오른다', () => {
    expect(dayNumber(0)).toBe(1);
    expect(dayNumber(DAY_LENGTH_MS * 0.9)).toBe(2);
    expect(dayNumber(DAY_LENGTH_MS * 1.9)).toBe(3);
  });

  it('구간이 낮 → 해질녘 → 밤 → 새벽 순으로 이어진다', () => {
    expect(phaseAt(at(0.5))).toBe(DayPhase.DAY);
    expect(phaseAt(at(0.75))).toBe(DayPhase.DUSK);
    expect(phaseAt(at(0.9))).toBe(DayPhase.NIGHT);
    expect(phaseAt(at(0.05))).toBe(DayPhase.NIGHT);
    expect(phaseAt(at(0.25))).toBe(DayPhase.DAWN);
  });

  it('낮이 가장 길다 — 밤이 길면 기다리는 시간이 된다', () => {
    let day = 0;
    let night = 0;
    for (let step = 0; step < 1000; step += 1) {
      const phase = phaseAt(step / 1000);
      if (phase === DayPhase.DAY) day += 1;
      if (phase === DayPhase.NIGHT) night += 1;
    }

    expect(day).toBeGreaterThan(night);
  });

  it('구간마다 이름이 있다', () => {
    for (const phase of Object.values(DayPhase)) {
      expect(phaseLabel(phase)).toBeTruthy();
    }
  });

  it('이상한 값은 시작 시각으로 본다', () => {
    expect(timeOfDay(Number.NaN)).toBe(timeOfDay(0));
    expect(dayNumber(Number.NaN)).toBe(1);
  });
});

describe('어둠의 양', () => {
  it('대낮에는 0, 한밤에는 1이다', () => {
    expect(nightAmount(at(0.5))).toBe(0);
    expect(nightAmount(at(0.95))).toBe(1);
  });

  it('해질녘과 새벽은 이어서 변한다 — 해가 툭 꺼지면 사건처럼 보인다', () => {
    const early = nightAmount(at(0.73));
    const late = nightAmount(at(0.8));

    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(late);
    expect(late).toBeLessThan(1);

    // 새벽은 반대 방향이다.
    expect(nightAmount(at(0.22))).toBeGreaterThan(nightAmount(at(0.28)));
  });

  it('밤 판정과 어둠의 양이 어긋나지 않는다', () => {
    for (let step = 0; step < 200; step += 1) {
      const time = step / 200;
      if (isNight(time)) expect(nightAmount(time)).toBe(1);
    }
  });
});

describe('시간대 색조', () => {
  it('대낮에는 얹지 않는다', () => {
    expect(dayTint(at(0.5)).alpha).toBe(0);
  });

  it('한밤이 해질녘보다 짙다', () => {
    expect(dayTint(at(0.95)).alpha).toBeGreaterThan(dayTint(at(0.74)).alpha);
  });

  it('한밤에도 화면이 완전히 덮이지 않는다', () => {
    expect(dayTint(at(0.95)).alpha).toBeLessThan(1);
  });

  it('전환 구간에는 노을이 섞인다 — 한밤의 푸른색보다 붉다', () => {
    const twilight = dayTint(at(0.77)).color;
    const night = dayTint(at(0.95)).color;

    const red = (color: string) => Number(color.slice(color.indexOf('(') + 1).split(',')[0]);

    expect(red(twilight)).toBeGreaterThan(red(night));
  });
});

describe('시계 표시', () => {
  it('하루를 24시간으로 읽는다', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(0.5)).toBe('12:00');
    expect(clockLabel(0.25)).toBe('06:00');
  });
});

describe('게임 안의 시각', () => {
  it('시간이 흐르면 시각이 나아간다', () => {
    const game = makeGame();
    const before = game.timeOfDay;

    advance(game, DAY_LENGTH_MS * 0.3);

    expect(game.timeOfDay).toBeGreaterThan(before);
  });

  it('밤이 온다', () => {
    const game = makeGame();
    expect(game.isNight).toBe(false);

    advance(game, DAY_LENGTH_MS * 0.7);

    expect(game.isNight).toBe(true);
    expect(game.dayPhase).toBe(DayPhase.NIGHT);
  });

  it('시각은 저장하지 않아도 되살아난다 — 누적 시간에서 파생되기 때문이다', () => {
    const game = makeGame();
    advance(game, DAY_LENGTH_MS * 0.8);

    const restored = Game.fromSave(game.toSave());

    expect(restored?.timeOfDay).toBeCloseTo(game.timeOfDay, 6);
    expect(restored?.dayCount).toBe(game.dayCount);
    expect(restored?.isNight).toBe(game.isNight);
  });

  it('지상의 밤은 색조와 넓은 빛을, 동굴은 색조 없이 좁은 빛을 준다', () => {
    const game = makeGame();

    // 대낮 지상: 아무것도 얹지 않는다.
    expect(game.atmosphere().tint).toBeNull();
    expect(game.atmosphere().light).toBeNull();

    advance(game, DAY_LENGTH_MS * 0.7);
    const night = game.atmosphere();

    expect(night.tint?.alpha).toBeGreaterThan(0);
    expect(night.light).not.toBeNull();
  });

  it('첫 밤에 시야가 좁아지는 이유를 한 번 알린다', () => {
    const state = {
      wood: 0,
      stone: 0,
      carried: 0,
      nearStorage: false,
      houses: 0,
      residents: 0,
      buildings: 1,
      requests: 0,
      payableRequests: 0,
      level: 1,
      goalLevel: 5,
      buildMode: false,
      blueprintCount: 3,
      onPortal: false,
      night: true,
      hasDeposited: false,
    } satisfies GuidanceState;

    expect(pickHint(state, new Set())).toBe(HintId.NIGHT);
    expect(pickHint(state, new Set([HintId.NIGHT]))).toBeNull();
  });
});
