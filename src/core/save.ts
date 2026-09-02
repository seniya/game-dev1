import type { BlockType } from './blocks';
import type { BlueprintId } from './blueprints';
import type { ItemType } from './items';
import { MapId, isMapId } from './maps';
import type { NodeKind } from './resourceNodes';
import type { ToolKind, ToolTier } from './tools';

/**
 * 저장 형식 버전.
 *
 * 블록 타입과 아이템 타입이 숫자·문자열 리터럴이라 값이 바뀌면 예전 저장이 **조용히**
 * 잘못 읽힌다. 버전이 다르면 읽지 않는다는 규칙을 첫 저장부터 넣어 그런 상황을 막는다.
 *
 * **2 — 맵이 여럿이 됐다.** 지형 한 벌(`terrain`/`nodes`)이 맵 배열(`maps`)로 바뀌었다.
 * 버전이 다르다고 거절하면 마을이 통째로 날아가므로 v1은 마이그레이션한다
 * (`migrateSave`, ADR 0008 개정).
 */
export const SAVE_VERSION = 2;

/** 저장된 지형. */
export interface TerrainSave {
  /** x축 타일 수. */
  width: number;
  /** y축 타일 수. */
  height: number;
  /** 열별 블록 수(base64). */
  heights: string;
  /** 칸별 블록 타입(base64). */
  types: string;
}

/** 저장된 자원 노드 하나. */
export interface NodeSave {
  x: number;
  y: number;
  kind: NodeKind;
  /** 남은 내구도. */
  durability: number;
  /** 리스폰까지 남은 시간(ms). */
  respawnRemainingMs: number;
}

/** 저장된 저장소(인벤토리·창고). */
export interface InventorySave {
  /** 슬롯 수. */
  slotCount: number;
  /** 한 슬롯 최대 개수. */
  stackLimit: number;
  /** 슬롯 내용. 빈 슬롯은 null. */
  slots: Array<{ item: ItemType; count: number } | null>;
}

/** 저장된 플레이어. */
export interface PlayerSave {
  x: number;
  y: number;
  /** 도구 슬롯. 순서가 슬롯 번호다. */
  tools: Array<{ kind: ToolKind; tier: ToolTier }>;
  /** 선택된 슬롯 번호. */
  selectedSlot: number;
}

/** 저장된 건물 하나. */
export interface BuildingSave {
  id: number;
  blueprintId: BlueprintId;
  x: number;
  y: number;
  /** 건축 남은 시간(ms). 0이면 완공. */
  buildRemainingMs: number;
}

/** 저장된 주민 하나. */
export interface NpcSave {
  id: number;
  homeBuildingId: number;
  /** 집 앞 칸. 배회 반경의 기준점이다. */
  homeX: number;
  homeY: number;
  /** 현재 칸. */
  x: number;
  y: number;
  /**
   * 배정된 일터 건물 번호.
   *
   * **선택적 필드다.** 새 필드를 더하는 것만으로는 버전을 올리지 않는다 — 예전 저장에
   * 없으면 "아직 아무 일도 맡지 않았다"로 읽히고, 그것이 맞는 해석이다.
   */
  jobBuildingId?: number;
}

/** 저장된 요청 하나. */
export type RequestSave =
  | { kind: 'deliver'; id: number; npcId: number; item: ItemType; amount: number }
  | { kind: 'facility'; id: number; npcId: number; blueprintId: BlueprintId };

/**
 * 저장된 맵 하나.
 *
 * 지형과 노드를 통째로 담는다. 배치는 시드에서 재현되지만 **파고 쌓은 변경분**은
 * 재현되지 않으므로 결과를 담아야 한다.
 */
export interface MapSave {
  /** 맵 종류. */
  id: MapId;
  /** 지형. */
  terrain: TerrainSave;
  /** 자원 노드. */
  nodes: NodeSave[];
}

/** 저장 데이터 전체. */
export interface SaveData {
  /** 저장 형식 버전. */
  version: number;
  /** 저장 시각(epoch ms). 표시에만 쓴다. */
  savedAt: number;
  /** 지형·자원 생성에 쓴 시드. 재현과 디버깅용이다. */
  seed: number;
  /**
   * 다녀온 맵들. 한 번도 가지 않은 맵은 담기지 않고, 갈 때 시드에서 만들어진다.
   *
   * 자원 노드는 배치까지 통째로 담는다 — 생성 규칙이 바뀌어도 저장이 어긋나지 않는다.
   */
  maps: MapSave[];
  /** 지금 있는 맵. */
  currentMap: MapId;
  /** 플레이어. */
  player: PlayerSave;
  /** 인벤토리. */
  inventory: InventorySave;
  /** 창고. */
  storage: InventorySave;
  /** 건물. */
  buildings: BuildingSave[];
  /** 다음에 부여할 건물 번호. */
  nextBuildingId: number;
  /** 주민. */
  npcs: NpcSave[];
  /** 다음에 부여할 주민 번호. */
  nextNpcId: number;
  /** 열린 요청. */
  requests: RequestSave[];
  /** 다음에 부여할 요청 번호. */
  nextRequestId: number;
  /** 완료한 요청 수. */
  completedRequests: number;
  /** 다음 요청까지 남은 시간(ms). */
  requestTimerMs: number;
  /** 마을 레벨. */
  level: number;
  /** 요청 완료로 누적된 경험치. */
  experience: number;
  /** 시뮬레이션 누적 시간(ms). */
  elapsedMs: number;
  /**
   * 이미 본 안내 힌트 목록.
   *
   * **선택적 필드다.** 새 필드를 더하는 것만으로는 버전을 올리지 않는다 — 기존 저장에
   * 없으면 "아직 아무것도 보지 않았다"로 읽히고, 그것이 맞는 해석이기 때문이다.
   * 버전을 올려야 하는 것은 **기존 필드의 의미가 바뀔 때**다.
   */
  seenHints?: string[];
  /** 창고에 한 번이라도 예치했는지. 선택적 필드다. */
  hasDeposited?: boolean;
}

/** base64 인코딩에 쓰는 문자표. */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 바이트 배열을 base64 문자열로 바꾼다.
 *
 * 지형 배열이 저장의 대부분을 차지하므로(32×32 맵에서 6KB) 숫자 배열 JSON 대신 base64를
 * 쓴다. 자동 저장이 반복되는 만큼 크기가 곧 비용이다. 브라우저 `btoa`를 쓰지 않는 이유는
 * 큰 배열을 문자열로 펼칠 때 인자 개수 제한에 걸리고, node 테스트에서도 같은 코드가
 * 돌아야 하기 때문이다.
 *
 * @param bytes 바이트 배열.
 * @returns base64 문자열.
 */
export function encodeBytes(bytes: Uint8Array): string {
  let result = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;

    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[b2 & 0x3f] : '=';
  }

  return result;
}

/**
 * base64 문자열을 바이트 배열로 되돌린다.
 *
 * @param text base64 문자열.
 * @param expectedLength 기대하는 길이. 다르면 null을 돌려준다.
 * @returns 바이트 배열. 형식이 잘못됐으면 null.
 */
export function decodeBytes(text: string, expectedLength: number): Uint8Array | null {
  if (typeof text !== 'string') return null;

  const clean = text.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const value = BASE64_CHARS.indexOf(char);
    if (value < 0) return null;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }

  if (byteIndex !== expectedLength) return null;

  return bytes.subarray(0, byteIndex);
}

/**
 * 저장 데이터가 읽을 수 있는 형태인지 확인한다.
 *
 * 필드를 하나하나 검사하는 이유는, 손상된 저장으로 게임이 죽는 것보다 **읽기를 거절하고
 * 새 게임으로 떨어지는 편**이 낫기 때문이다. 저장 자체는 지우지 않는다.
 *
 * @param value 검사할 값.
 * @returns 읽을 수 있으면 true.
 */
export function isSaveData(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;

  const data = value as Partial<SaveData>;
  if (data.version !== SAVE_VERSION) return false;
  if (!isMapId(data.currentMap)) return false;
  if (!Array.isArray(data.maps) || data.maps.length === 0) return false;
  if (!data.maps.every(isMapSave)) return false;
  // 지금 있는 맵이 저장에 없으면 되살릴 지형이 없다.
  if (!data.maps.some((map) => map.id === data.currentMap)) return false;
  if (!isPlayerSave(data.player)) return false;
  if (!isInventorySave(data.inventory) || !isInventorySave(data.storage)) return false;
  if (!Array.isArray(data.buildings) || !Array.isArray(data.npcs)) return false;
  if (!Array.isArray(data.requests)) return false;
  if (!Number.isFinite(data.level) || !Number.isFinite(data.experience)) return false;

  return true;
}

/**
 * 맵 저장이 온전한지 확인한다.
 *
 * @param value 검사할 값.
 */
function isMapSave(value: unknown): value is MapSave {
  if (typeof value !== 'object' || value === null) return false;

  const map = value as Partial<MapSave>;

  return isMapId(map.id) && isTerrainSave(map.terrain) && Array.isArray(map.nodes);
}

/**
 * 지형 저장이 온전한지 확인한다.
 *
 * @param value 검사할 값.
 */
function isTerrainSave(value: unknown): value is TerrainSave {
  if (typeof value !== 'object' || value === null) return false;

  const terrain = value as Partial<TerrainSave>;

  return (
    Number.isInteger(terrain.width) &&
    Number.isInteger(terrain.height) &&
    (terrain.width ?? 0) > 0 &&
    (terrain.height ?? 0) > 0 &&
    typeof terrain.heights === 'string' &&
    typeof terrain.types === 'string'
  );
}

/**
 * 플레이어 저장이 온전한지 확인한다.
 *
 * @param value 검사할 값.
 */
function isPlayerSave(value: unknown): value is PlayerSave {
  if (typeof value !== 'object' || value === null) return false;

  const player = value as Partial<PlayerSave>;

  return (
    Number.isInteger(player.x) &&
    Number.isInteger(player.y) &&
    Array.isArray(player.tools) &&
    player.tools.length > 0 &&
    Number.isInteger(player.selectedSlot)
  );
}

/**
 * 저장소 저장이 온전한지 확인한다.
 *
 * @param value 검사할 값.
 */
function isInventorySave(value: unknown): value is InventorySave {
  if (typeof value !== 'object' || value === null) return false;

  const inventory = value as Partial<InventorySave>;

  return (
    Number.isInteger(inventory.slotCount) &&
    Number.isInteger(inventory.stackLimit) &&
    Array.isArray(inventory.slots)
  );
}

/**
 * 블록 타입 값이 알려진 것인지 확인한다. 저장을 되읽을 때 쓴다.
 *
 * @param value 블록 값.
 * @param maxType 허용하는 최대 값.
 * @returns 알려진 값이면 true.
 */
export function isKnownBlock(value: number, maxType: number): value is BlockType {
  return Number.isInteger(value) && value >= 0 && value <= maxType;
}

/**
 * 예전 형식의 저장을 지금 형식으로 옮긴다.
 *
 * ADR 0008은 "버전이 다르면 읽지 않는다"로 시작했다. 그 규칙은 형식이 한 번도 바뀌지
 * 않는 동안에는 비용이 없었지만, 로드맵 03은 형식을 여러 번 바꾼다. 매번 거절하면
 * 플레이어의 마을이 그때마다 사라진다.
 *
 * **없어진 값을 시드에서 재현하거나 안전한 기본값으로 채울 수 있으면 옮긴다.**
 * v1 → v2가 정확히 그 경우다. v1은 맵이 하나뿐이었으므로 그 지형이 지상이고,
 * 동굴은 아직 가 보지 않은 것으로 두면 된다 — 갈 때 시드에서 만들어진다.
 *
 * @param value 읽어 들인 값.
 * @returns 지금 형식의 값. 옮길 수 없으면 받은 값을 그대로 돌려준다(검증에서 걸린다).
 */
export function migrateSave(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;

  const data = value as Record<string, unknown>;
  if (data.version !== 1) return value;

  const terrain = data.terrain;
  if (!isTerrainSave(terrain)) return value;

  const { terrain: _terrain, nodes, ...rest } = data;

  return {
    ...rest,
    version: 2,
    maps: [{ id: MapId.SURFACE, terrain, nodes: Array.isArray(nodes) ? nodes : [] }],
    currentMap: MapId.SURFACE,
  };
}
