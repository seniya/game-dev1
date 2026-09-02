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

/** 동굴 생성 설정. */
export interface CaveGenOptions {
  /** 시드. 같은 시드는 항상 같은 동굴을 만든다. */
  seed?: number;
  /** 파낼 방의 수. */
  roomCount?: number;
  /** 방 한 변의 최소·최대 길이. */
  roomMin?: number;
  roomMax?: number;
}

/** 기본 방 개수. 통로로 이어 붙이므로 개수가 곧 동굴의 넓이다. */
const DEFAULT_ROOM_COUNT = 7;

/** 기본 방 크기. */
const DEFAULT_ROOM_MIN = 3;
const DEFAULT_ROOM_MAX = 6;

/** 동굴 바닥 높이. */
const CAVE_FLOOR_HEIGHT = 1;

/**
 * 동굴 벽 높이.
 *
 * 처음에는 최대 높이(5)로 채웠는데, 브라우저에서 보니 **벽이 플레이어를 통째로 가렸다.**
 * 통로를 걷는 동안 자기 캐릭터가 보이지 않아 어디 있는지 알 수 없었다.
 *
 * 3이면 바닥(1)과의 차가 2라 등반 한계 1칸(ADR 0004)을 여전히 넘지 못하므로 벽 노릇을
 * 그대로 하면서, 화면에서 앞 열이 뒤 칸의 캐릭터를 덮지 않는다.
 */
const CAVE_WALL_HEIGHT = 3;

/**
 * 동굴 맵을 생성한다.
 *
 * **높이맵은 천장을 표현할 수 없다**(ADR 0003). 그래서 동굴을 "위에서 내려다본 통로"로
 * 그린다 — 벽은 암반 기둥이고, 파낸 자리는 높이 1의 바닥이다.
 * 등반 한계가 1칸이므로(ADR 0004) 벽은 자연히 통행을 막는다. 자료구조를 바꾸지 않고
 * 동굴이 되는 셈이다.
 *
 * 방을 몇 개 파고 **직전 방과 L자 통로로 잇는다.** 노이즈로 뚫으면 닿을 수 없는 방이
 * 생기는데, 이어 붙이며 파면 연결이 생성 방식에서 보장된다 — 나중에 길찾기로 검사할
 * 필요가 없다.
 *
 * @param width x축 타일 수.
 * @param height y축 타일 수.
 * @param options 시드와 방 파라미터.
 * @returns 생성된 동굴 지형.
 */
export function generateCave(width: number, height: number, options: CaveGenOptions = {}): Terrain {
  const seed = options.seed ?? 1;
  const roomCount = Math.max(1, options.roomCount ?? DEFAULT_ROOM_COUNT);
  const roomMin = Math.max(1, options.roomMin ?? DEFAULT_ROOM_MIN);
  const roomMax = Math.max(roomMin, options.roomMax ?? DEFAULT_ROOM_MAX);

  const terrain = new Terrain(width, height);

  // 먼저 전부 암반으로 채운다. 파낸 자리만 길이 된다.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) terrain.fillColumn(x, y, CAVE_WALL_HEIGHT, BlockType.STONE);
  }

  let previous: { x: number; y: number } | null = null;

  for (let index = 0; index < roomCount; index += 1) {
    const room = pickRoom(index, seed, width, height, roomMin, roomMax);
    carveRect(terrain, room.x, room.y, room.width, room.depth);

    const center = {
      x: room.x + Math.floor(room.width / 2),
      y: room.y + Math.floor(room.depth / 2),
    };
    if (previous) carveCorridor(terrain, previous, center);
    previous = center;
  }

  return terrain;
}

/**
 * 방 하나의 위치와 크기를 고른다.
 *
 * @param index 방 번호. 시드에 섞어 방마다 다른 값을 얻는다.
 * @param seed 시드.
 * @param width 맵 가로.
 * @param height 맵 세로.
 * @param roomMin 최소 한 변.
 * @param roomMax 최대 한 변.
 * @returns 방 영역.
 */
function pickRoom(
  index: number,
  seed: number,
  width: number,
  height: number,
  roomMin: number,
  roomMax: number,
): { x: number; y: number; width: number; depth: number } {
  const span = roomMax - roomMin + 1;
  const roomWidth = roomMin + Math.floor(hashNoise(index, 1, seed) * span);
  const roomDepth = roomMin + Math.floor(hashNoise(index, 2, seed) * span);

  // 가장자리 한 칸은 늘 벽으로 남긴다 — 맵 경계가 곧 동굴 벽이어야 한다.
  const maxX = Math.max(1, width - roomWidth - 1);
  const maxY = Math.max(1, height - roomDepth - 1);

  return {
    x: 1 + Math.floor(hashNoise(index, 3, seed) * maxX),
    y: 1 + Math.floor(hashNoise(index, 4, seed) * maxY),
    width: roomWidth,
    depth: roomDepth,
  };
}

/**
 * 사각 영역을 바닥으로 파낸다.
 *
 * @param terrain 대상 지형.
 * @param x 좌상단 x.
 * @param y 좌상단 y.
 * @param areaWidth 가로 칸수.
 * @param areaDepth 세로 칸수.
 */
function carveRect(terrain: Terrain, x: number, y: number, areaWidth: number, areaDepth: number): void {
  for (let dy = 0; dy < areaDepth; dy += 1) {
    for (let dx = 0; dx < areaWidth; dx += 1) carveTile(terrain, x + dx, y + dy);
  }
}

/**
 * 두 지점을 L자 통로로 잇는다. 가로로 먼저 가고 세로로 내려간다.
 *
 * @param terrain 대상 지형.
 * @param from 출발 지점.
 * @param to 도착 지점.
 */
function carveCorridor(
  terrain: Terrain,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const stepX = Math.sign(to.x - from.x);
  for (let x = from.x; x !== to.x; x += stepX) carveTile(terrain, x, from.y);

  const stepY = Math.sign(to.y - from.y);
  for (let y = from.y; y !== to.y; y += stepY) carveTile(terrain, to.x, y);

  carveTile(terrain, to.x, to.y);
}

/**
 * 한 칸을 바닥으로 만든다. 맵 밖이면 아무것도 하지 않는다.
 *
 * @param terrain 대상 지형.
 * @param x 그리드 x.
 * @param y 그리드 y.
 */
function carveTile(terrain: Terrain, x: number, y: number): void {
  if (!terrain.contains(x, y)) return;
  // 가장자리는 벽으로 남긴다.
  if (x === 0 || y === 0 || x === terrain.width - 1 || y === terrain.height - 1) return;

  terrain.fillColumn(x, y, CAVE_FLOOR_HEIGHT, BlockType.STONE);
}
