import { hashNoise } from './random';

/**
 * 맵 종류.
 *
 * ADR 0003이 "동굴은 별도 맵으로 다룬다"고 전제해 뒀다. 높이맵은 오버행과 천장을
 * 표현할 수 없으므로 동굴을 지형 지물로 만들 수 없고, 대신 맵을 나눈다.
 */
export const MapId = {
  /** 지상. 마을이 있는 곳이다. */
  SURFACE: 'surface',
  /** 동굴. 상위 자원이 나오는 곳이다. */
  CAVE: 'cave',
} as const;

/** 맵 종류 값. */
export type MapId = (typeof MapId)[keyof typeof MapId];

/** 맵별 표시 이름. */
const MAP_LABEL: Readonly<Record<MapId, string>> = {
  [MapId.SURFACE]: '지상',
  [MapId.CAVE]: '동굴',
};

/** 맵 순서. 저장과 목록 표시에서 쓴다. */
export const MAP_ORDER: readonly MapId[] = [MapId.SURFACE, MapId.CAVE];

/**
 * 맵 이름을 돌려준다.
 *
 * @param id 맵 종류.
 * @returns 표시 이름.
 */
export function mapLabel(id: MapId): string {
  return MAP_LABEL[id];
}

/**
 * 알려진 맵 종류인지 확인한다. 저장을 되읽을 때 쓴다.
 *
 * @param value 검사할 값.
 * @returns 알려진 맵이면 true.
 */
export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && (MAP_ORDER as readonly string[]).includes(value);
}

/**
 * 마을이 있는 맵인지 확인한다.
 *
 * 건축·주민 이주·요청은 지상에서만 일어난다. 규칙을 맵 속성으로 두면 맵이 늘어날 때
 * 조건문이 늘지 않는다 — "이 맵에 마을이 있는가"만 물으면 된다.
 *
 * @param id 맵 종류.
 * @returns 마을이 있으면 true.
 */
export function isVillageMap(id: MapId): boolean {
  return id === MapId.SURFACE;
}

/**
 * 맵마다 다른 시드를 만든다.
 *
 * 같은 시드로 두 맵을 만들면 동굴이 지상과 같은 모양이 된다. 맵 종류를 시드에 섞어
 * **한 세계 안에서 맵마다 다르되, 세계 시드가 같으면 늘 같은 맵**이 나오게 한다.
 * 결정적 생성은 저장 크기를 줄이는 근거이기도 하다(변경분만 저장한다).
 *
 * @param seed 세계 시드.
 * @param id 맵 종류.
 * @returns 그 맵의 시드.
 */
export function mapSeed(seed: number, id: MapId): number {
  const index = MAP_ORDER.indexOf(id);

  // hashNoise는 0~1을 주므로 큰 정수 범위로 펼쳐 시드로 쓴다.
  return Math.floor(hashNoise(index + 1, index + 7, seed) * 2 ** 31);
}
