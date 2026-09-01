import { hashNoise } from '../core/random';
import { canStand, type TilePos } from '../core/movement';
import { NodeKind, nodeDefinition, type NodeDefinition } from '../core/resourceNodes';
import type { Terrain } from '../core/Terrain';
import { tierSpeedMultiplier, type Tool } from '../core/tools';
import { Zone, zoneAt } from '../core/zones';
import type { ItemType } from '../core/items';

/** 맵에 놓인 자원 노드 하나. */
export interface ResourceNode {
  /** 그리드 x. */
  readonly x: number;
  /** 그리드 y. */
  readonly y: number;
  /** 종류. */
  readonly kind: NodeKind;
  /** 남은 내구도. 0이면 부서진 상태다. */
  durability: number;
  /** 다시 자라기까지 남은 시간(ms). 0이면 살아 있다. */
  respawnRemainingMs: number;
}

/** 채집 시도 결과. */
export type HarvestResult =
  | { ok: true; kind: NodeKind; destroyed: boolean; drop?: { item: ItemType; amount: number } }
  | { ok: false; reason: 'noNode' | 'wrongTool' | 'depleted' };

/** 노드 배치 설정. */
export interface ResourceFieldOptions {
  /** 시드. 같은 시드는 항상 같은 배치를 만든다. */
  seed?: number;
  /** 구역별 노드 밀도 배수. 테스트에서 밀도를 0으로 만들 때 쓴다. */
  densityScale?: number;
}

/**
 * 구역별 노드 밀도. 값은 그 칸에 노드가 놓일 확률이다.
 *
 * 기획서 5.2의 "초원 → 숲 → 산악" 순서를 밀도와 종류로 표현한다.
 * 초원에는 나무만 드물게, 숲에는 나무가 빽빽하고 돌이 조금, 산악에는 돌과
 * 철광석이 나온다.
 */
const ZONE_DENSITY: Readonly<Record<Zone, ReadonlyArray<{ kind: NodeKind; chance: number }>>> = {
  [Zone.MEADOW]: [{ kind: NodeKind.TREE, chance: 0.05 }],
  [Zone.FOREST]: [
    { kind: NodeKind.TREE, chance: 0.22 },
    { kind: NodeKind.STONE_ROCK, chance: 0.05 },
  ],
  [Zone.MOUNTAIN]: [
    { kind: NodeKind.STONE_ROCK, chance: 0.16 },
    { kind: NodeKind.IRON_VEIN, chance: 0.07 },
    { kind: NodeKind.TREE, chance: 0.03 },
  ],
};

/**
 * 맵 위의 자원 노드 모음.
 *
 * 노드는 칸당 최대 하나이며 `y * width + x`를 키로 하는 Map에 담는다. 배열이
 * 아니라 Map을 쓴 이유는 노드가 맵 전체에 비해 희소하고, 특정 칸에 노드가
 * 있는지를 매 클릭·매 프레임 물어보기 때문이다.
 */
export class ResourceField {
  private readonly terrain: Terrain;
  /** 칸 키 → 노드. */
  private readonly nodes = new Map<number, ResourceNode>();

  /**
   * @param terrain 지형.
   * @param options 배치 설정.
   */
  constructor(terrain: Terrain, options: ResourceFieldOptions = {}) {
    this.terrain = terrain;
    this.populate(options.seed ?? 1, options.densityScale ?? 1);
  }

  /** 배치된 노드 총 개수(부서진 것 포함). */
  get nodeCount(): number {
    return this.nodes.size;
  }

  /** 모든 노드. 렌더링과 테스트에서 훑는다. */
  get all(): Iterable<ResourceNode> {
    return this.nodes.values();
  }

  /**
   * 노드를 하나 심는다.
   *
   * 설 수 있는 빈 칸에만 놓인다. 지형 생성 이후에 노드를 추가해야 하는 경우
   * (테스트, Phase 8의 구역 개방 등)에 쓴다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param kind 노드 종류.
   * @returns 심었으면 true. 맵 밖·뚫린 칸·이미 노드가 있는 칸이면 false.
   */
  addNode(x: number, y: number, kind: NodeKind): boolean {
    if (!canStand(this.terrain, x, y)) return false;
    if (this.nodes.has(this.key(x, y))) return false;

    this.nodes.set(this.key(x, y), {
      x,
      y,
      kind,
      durability: nodeDefinition(kind).durability,
      respawnRemainingMs: 0,
    });

    return true;
  }

  /**
   * 특정 칸의 노드를 돌려준다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 노드. 없으면 undefined.
   */
  nodeAt(x: number, y: number): ResourceNode | undefined {
    return this.nodes.get(this.key(x, y));
  }

  /**
   * 그 칸이 노드로 막혀 있는지 확인한다. 건축 배치와 쌓기 판정에 쓴다.
   * 부서져 리스폰을 기다리는 노드는 막지 않는다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 살아 있는 노드가 있으면 true.
   */
  isBlocked(x: number, y: number): boolean {
    const node = this.nodes.get(this.key(x, y));

    return node !== undefined && node.durability > 0;
  }

  /**
   * 노드를 한 번 타격한다.
   *
   * 도구 등급이 높으면 한 번에 더 많은 내구도를 깎는다(기획서 5.2의 "채집 속도").
   * 내구도가 0이 되면 자원을 드롭하고 리스폰 타이머가 돌기 시작한다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param tool 사용할 도구.
   * @returns 채집 결과.
   */
  harvest(x: number, y: number, tool: Tool): HarvestResult {
    const node = this.nodes.get(this.key(x, y));
    if (!node) return { ok: false, reason: 'noNode' };
    if (node.durability <= 0) return { ok: false, reason: 'depleted' };

    const definition = nodeDefinition(node.kind);
    if (tool.kind !== definition.toolKind || tool.tier < definition.minTier) {
      return { ok: false, reason: 'wrongTool' };
    }

    node.durability -= tierSpeedMultiplier(tool.tier);

    if (node.durability > 0) {
      return { ok: true, kind: node.kind, destroyed: false };
    }

    node.durability = 0;
    node.respawnRemainingMs = definition.respawnMs;

    return {
      ok: true,
      kind: node.kind,
      destroyed: true,
      drop: { item: definition.drop, amount: definition.dropAmount },
    };
  }

  /**
   * 리스폰 타이머를 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   * @returns 이번 스텝에 다시 자란 노드 수.
   */
  update(stepMs: number): number {
    let regrown = 0;

    for (const node of this.nodes.values()) {
      if (node.respawnRemainingMs <= 0) continue;

      node.respawnRemainingMs -= stepMs;
      if (node.respawnRemainingMs <= 0) {
        node.respawnRemainingMs = 0;
        node.durability = nodeDefinition(node.kind).durability;
        regrown += 1;
      }
    }

    return regrown;
  }

  /**
   * 노드의 손상 정도를 0~1로 돌려준다. 렌더링에서 모습을 바꾸는 데 쓴다.
   *
   * @param node 대상 노드.
   * @returns 0이면 멀쩡, 1이면 부서진 상태.
   */
  damageRatio(node: ResourceNode): number {
    const max = nodeDefinition(node.kind).durability;

    return Math.max(0, Math.min(1, 1 - node.durability / max));
  }

  /**
   * 살아 있는 노드 중 가장 가까운 것을 찾는다. 안내 UI와 테스트에서 쓴다.
   *
   * @param from 기준 칸.
   * @param kind 찾을 종류. 생략하면 종류를 가리지 않는다.
   * @returns 가장 가까운 노드. 없으면 undefined.
   */
  nearest(from: TilePos, kind?: NodeKind): ResourceNode | undefined {
    let best: ResourceNode | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of this.nodes.values()) {
      if (node.durability <= 0) continue;
      if (kind !== undefined && node.kind !== kind) continue;

      const distance = Math.abs(node.x - from.x) + Math.abs(node.y - from.y);
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }

    return best;
  }

  /**
   * 칸 좌표를 Map 키로 바꾼다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @returns 키.
   */
  private key(x: number, y: number): number {
    return y * this.terrain.width + x;
  }

  /**
   * 구역별 밀도에 따라 노드를 결정적으로 배치한다.
   *
   * 설 수 있는 칸에만 놓는다 — 뚫린 자리에 나무가 떠 있으면 안 되고,
   * 플레이어가 인접할 수 없는 노드는 채집이 불가능하기 때문이다.
   *
   * @param seed 시드.
   * @param densityScale 밀도 배수.
   */
  private populate(seed: number, densityScale: number): void {
    for (let y = 0; y < this.terrain.height; y += 1) {
      for (let x = 0; x < this.terrain.width; x += 1) {
        if (!canStand(this.terrain, x, y)) continue;

        const kind = this.pickKind(x, y, seed, densityScale);
        if (!kind) continue;

        this.nodes.set(this.key(x, y), {
          x,
          y,
          kind,
          durability: nodeDefinition(kind).durability,
          respawnRemainingMs: 0,
        });
      }
    }
  }

  /**
   * 그 칸에 놓을 노드 종류를 고른다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param seed 시드.
   * @param densityScale 밀도 배수.
   * @returns 노드 종류. 놓지 않으면 null.
   */
  private pickKind(x: number, y: number, seed: number, densityScale: number): NodeKind | null {
    const roll = hashNoise(x, y, seed + 5003);
    let threshold = 0;

    for (const entry of ZONE_DENSITY[zoneAt(this.terrain, x, y)]) {
      threshold += entry.chance * densityScale;
      if (roll < threshold) return entry.kind;
    }

    return null;
  }
}

/** 노드 정의 재수출. 호출부가 `resourceNodes`를 따로 import하지 않도록 둔다. */
export type { NodeDefinition };
