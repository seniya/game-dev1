import type { BlockType } from './blocks';
import type { BlueprintId } from './blueprints';
import type { ItemType } from './items';
import type { NodeKind } from './resourceNodes';
import type { ToolKind, ToolTier } from './tools';

/**
 * 저장 형식 버전.
 *
 * 블록 타입과 아이템 타입이 숫자·문자열 리터럴이라 값이 바뀌면 예전 저장이 **조용히**
 * 잘못 읽힌다. 버전이 다르면 읽지 않는다는 규칙을 첫 저장부터 넣어 그런 상황을 막는다.
 * 형식을 바꿀 때는 이 값을 올리고, 필요하면 마이그레이션을 붙인다.
 */
export const SAVE_VERSION = 1;

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
}

/** 저장된 요청 하나. */
export type RequestSave =
  | { kind: 'deliver'; id: number; npcId: number; item: ItemType; amount: number }
  | { kind: 'facility'; id: number; npcId: number; blueprintId: BlueprintId };

/** 저장 데이터 전체. */
export interface SaveData {
  /** 저장 형식 버전. */
  version: number;
  /** 저장 시각(epoch ms). 표시에만 쓴다. */
  savedAt: number;
  /** 지형·자원 생성에 쓴 시드. 재현과 디버깅용이다. */
  seed: number;
  /** 지형. */
  terrain: TerrainSave;
  /** 자원 노드. 배치까지 통째로 담는다 — 생성 규칙이 바뀌어도 저장이 어긋나지 않는다. */
  nodes: NodeSave[];
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
  if (!isTerrainSave(data.terrain)) return false;
  if (!Array.isArray(data.nodes)) return false;
  if (!isPlayerSave(data.player)) return false;
  if (!isInventorySave(data.inventory) || !isInventorySave(data.storage)) return false;
  if (!Array.isArray(data.buildings) || !Array.isArray(data.npcs)) return false;
  if (!Array.isArray(data.requests)) return false;
  if (!Number.isFinite(data.level) || !Number.isFinite(data.experience)) return false;

  return true;
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
