import { BlockType } from './blocks';
import { MAX_LAYERS } from './coordinates';
import { hashNoise } from './random';
import { Terrain } from './Terrain';

/** 지형 생성 설정. */
export interface TerrainGenOptions {
  /** 시드. 같은 시드는 항상 같은 지형을 만든다. */
  seed?: number;
  /** 기준 지면 높이(블록 수). */
  baseHeight?: number;
  /** 기준 높이에서 위아래로 흔들리는 폭(블록 수). */
  reliefRange?: number;
  /** 최하층에 철광석이 박힐 확률(0~1). */
  oreChance?: number;
}

/**
 * 기본 지면 높이. 아래로 팔 여유(2칸)와 위로 쌓을 여유(2칸)를 함께 남기려고
 * 5레이어 중 3을 기본값으로 잡았다.
 */
const DEFAULT_BASE_HEIGHT = 3;

/** 기본 기복. ±1이면 높이가 2~4로 흔들려 측면 벽이 눈에 보인다. */
const DEFAULT_RELIEF_RANGE = 1;

/** 기본 철광석 분포 확률. */
const DEFAULT_ORE_CHANCE = 0.12;

/** 철광석이 박히는 최소 열 높이. 이보다 얕으면 지표에 광석이 드러나 버린다. */
const MIN_HEIGHT_FOR_ORE = 3;

/**
 * 지형을 생성한다.
 *
 * Phase 2 확인용 배치이며 밸런싱 대상이 아니다. 층 구성 규칙은 단순하다.
 * 맨 위 한 칸은 흙, 그 아래는 모두 돌, 최하층(z = 0)에는 확률적으로 철광석이
 * 박힌다 — 파고 내려갈 이유를 만드는 최소 구성이다.
 *
 * @param width x축 타일 수.
 * @param height y축 타일 수.
 * @param options 시드와 지형 파라미터.
 * @returns 생성된 지형.
 */
export function generateTerrain(width: number, height: number, options: TerrainGenOptions = {}): Terrain {
  const seed = options.seed ?? 1;
  const baseHeight = options.baseHeight ?? DEFAULT_BASE_HEIGHT;
  const reliefRange = options.reliefRange ?? DEFAULT_RELIEF_RANGE;
  const oreChance = options.oreChance ?? DEFAULT_ORE_CHANCE;

  const terrain = new Terrain(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const columnHeight = pickColumnHeight(x, y, seed, baseHeight, reliefRange);

      // 먼저 돌로 채우고 표면 한 칸만 흙으로 덮는다.
      terrain.fillColumn(x, y, columnHeight, BlockType.STONE);
      if (columnHeight >= 1) {
        terrain.setBlock(x, y, columnHeight - 1, BlockType.DIRT);
      }

      // 최하층 광맥. 지표에 드러나지 않을 만큼 두꺼운 열에만 심는다.
      if (columnHeight >= MIN_HEIGHT_FOR_ORE && hashNoise(x, y, seed + 7919) < oreChance) {
        terrain.setBlock(x, y, 0, BlockType.IRON_ORE);
      }
    }
  }

  return terrain;
}

/**
 * 한 열의 높이를 고른다.
 *
 * 이웃한 두 축의 해시를 더해 완만한 기복을 만든다. 진짜 지형 노이즈는 아니지만,
 * 측면 벽과 높낮이 렌더링을 확인하기에는 충분하다.
 *
 * @param x 그리드 x.
 * @param y 그리드 y.
 * @param seed 시드.
 * @param baseHeight 기준 높이.
 * @param reliefRange 기복 폭.
 * @returns 1 이상 MAX_LAYERS 이하의 높이.
 */
function pickColumnHeight(
  x: number,
  y: number,
  seed: number,
  baseHeight: number,
  reliefRange: number,
): number {
  // 넓은 파장과 좁은 파장을 섞어 계단 하나짜리 언덕이 뭉치게 만든다.
  const coarse = hashNoise(Math.floor(x / 6), Math.floor(y / 6), seed);
  const fine = hashNoise(Math.floor(x / 2), Math.floor(y / 2), seed + 101);
  const blended = coarse * 0.7 + fine * 0.3;

  const offset = Math.round((blended * 2 - 1) * reliefRange);

  // 최소 1칸은 남긴다 — 시작부터 바닥이 뚫린 구멍이 있으면 이동/건축 판정이 지저분해진다.
  return Math.min(MAX_LAYERS, Math.max(1, baseHeight + offset));
}
