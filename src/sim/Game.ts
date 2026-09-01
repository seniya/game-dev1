import { ItemStash } from '../core/ItemStash';
import { BlockType } from '../core/blocks';
import { ItemType, blockToItem, itemToBlock } from '../core/items';
import { canInteract, type TilePos } from '../core/movement';
import { nodeDefinition, type NodeKind } from '../core/resourceNodes';
import { Terrain } from '../core/Terrain';
import { canDigBlock } from '../core/tools';
import type { Entity } from '../render/WorldRenderer';
import { Player } from './Player';
import { ResourceField } from './ResourceField';

/** 행동이 거절된 이유. UI 안내 문구로 옮긴다. */
export type ActionFailure =
  /** 이동·휘두르기 중이라 새 행동을 받을 수 없다. */
  | 'busy'
  /** 대상이 인접 칸이 아니다. */
  | 'notAdjacent'
  /** 대상 칸에 팔 것이 없다. */
  | 'empty'
  /** 현재 도구로는 그 블록을 팔 수 없다. */
  | 'wrongTool'
  /** 놓을 블록을 갖고 있지 않다. */
  | 'noMaterial'
  /** 그 자리에는 놓을 수 없다(높이 상한, 노드가 막고 있음 등). */
  | 'blocked';

/** 행동 결과. 성공이면 무엇이 일어났는지 함께 알린다. */
export type ActionResult =
  | {
      ok: true;
      /** 파낸 블록. 지형을 팠을 때만 있다. */
      block?: BlockType;
      /** 얻은 아이템. 채집이나 파기로 손에 들어온 것이 있을 때만 있다. */
      gained?: { item: ItemType; amount: number };
      /** 타격한 자원 노드 종류. 채집이었을 때만 있다. */
      node?: NodeKind;
      /** 노드를 부쉈는지. 채집이었을 때만 의미가 있다. */
      destroyed?: boolean;
    }
  | { ok: false; reason: ActionFailure };

/**
 * 게임 진행 상태를 한데 모은 오케스트레이터.
 *
 * 지형·플레이어·보유 자원을 소유하고, 입력에서 들어온 의도를 규칙에 맞춰
 * 적용한다. DOM과 렌더링을 전혀 모르므로 단위 테스트가 가능하다 — 조작 규칙이
 * 늘어날수록 이 분리의 이득이 커진다.
 */
export class Game {
  /** 지형. */
  readonly terrain: Terrain;
  /** 플레이어. */
  readonly player: Player;
  /** 자원 노드. */
  readonly resources: ResourceField;
  /** 얻은 아이템 임시 저장소. Phase 5에서 인벤토리로 대체한다. */
  readonly stash = new ItemStash();

  /** 쌓기에 쓸 아이템의 우선순위. 흙을 먼저 쓰고 없으면 돌을 쓴다. */
  private readonly placePriority: readonly ItemType[] = [ItemType.DIRT, ItemType.STONE];

  /** 렌더러에 넘길 오브젝트 버퍼. 프레임마다 새 배열을 만들지 않는다. */
  private readonly entityBuffer: Entity[] = [];

  /**
   * @param terrain 지형.
   * @param resources 자원 노드. 생략하면 시드 1로 배치한다.
   */
  constructor(terrain: Terrain, resources?: ResourceField) {
    this.terrain = terrain;
    this.resources = resources ?? new ResourceField(terrain);

    const start = findStartTile(terrain, this.resources);
    this.player = new Player(start.x, start.y);
  }

  /**
   * 시뮬레이션을 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  update(stepMs: number): void {
    this.player.update(stepMs);
    this.resources.update(stepMs);
  }

  /**
   * 플레이어 이동을 시도한다.
   *
   * @param dx x 방향 델타.
   * @param dy y 방향 델타.
   * @returns 이동을 시작했으면 true.
   */
  movePlayer(dx: number, dy: number): boolean {
    return this.player.tryMove(this.terrain, dx, dy);
  }

  /**
   * 대상 칸에 주 행동을 한다.
   *
   * 그 칸에 살아 있는 자원 노드가 있으면 채집하고, 없으면 지형을 판다.
   * 노드가 지형 위에 서 있으므로 노드를 먼저 처리하는 것이 자연스럽다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과.
   */
  actAt(target: TilePos): ActionResult {
    if (this.resources.isBlocked(target.x, target.y)) return this.harvestAt(target);

    return this.digAt(target);
  }

  /**
   * 대상 칸의 자원 노드를 채집한다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과. 노드를 부수면 드롭을 함께 돌려준다.
   */
  harvestAt(target: TilePos): ActionResult {
    if (!this.player.idle) return { ok: false, reason: 'busy' };
    if (!canInteract(this.terrain, this.player.position, target)) {
      return { ok: false, reason: 'notAdjacent' };
    }

    const result = this.resources.harvest(target.x, target.y, this.player.tool);
    if (!result.ok) {
      if (result.reason === 'wrongTool') return { ok: false, reason: 'wrongTool' };
      return { ok: false, reason: 'empty' };
    }

    this.player.trySwing();

    if (!result.drop) return { ok: true, node: result.kind, destroyed: false };

    this.stash.add(result.drop.item, result.drop.amount);

    return { ok: true, node: result.kind, destroyed: true, gained: result.drop };
  }

  /**
   * 대상 칸을 판다.
   *
   * 기획서 5.1·5.2에 따라 인접 칸만 대상이며, 블록에 맞는 도구를 들고 있어야 한다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과. 성공하면 파낸 블록을 함께 돌려준다.
   */
  digAt(target: TilePos): ActionResult {
    if (!this.player.idle) return { ok: false, reason: 'busy' };
    if (!canInteract(this.terrain, this.player.position, target)) {
      return { ok: false, reason: 'notAdjacent' };
    }

    const surface = this.terrain.surfaceBlock(target.x, target.y);
    if (surface === BlockType.EMPTY) return { ok: false, reason: 'empty' };
    if (!canDigBlock(this.player.tool, surface)) return { ok: false, reason: 'wrongTool' };

    const removed = this.terrain.dig(target.x, target.y);
    if (removed === null) return { ok: false, reason: 'empty' };

    this.player.trySwing();

    const item = blockToItem(removed);
    if (item !== null) this.stash.add(item);

    return {
      ok: true,
      block: removed,
      ...(item !== null ? { gained: { item, amount: 1 } } : {}),
    };
  }

  /**
   * 대상 칸에 블록을 쌓는다.
   *
   * @param target 대상 칸.
   * @returns 행동 결과.
   */
  placeAt(target: TilePos): ActionResult {
    if (!this.player.idle) return { ok: false, reason: 'busy' };
    if (!canInteract(this.terrain, this.player.position, target)) {
      return { ok: false, reason: 'notAdjacent' };
    }

    // 살아 있는 노드가 있는 칸에는 쌓을 수 없다 — 나무가 흙에 묻히면 안 된다.
    if (this.resources.isBlocked(target.x, target.y)) return { ok: false, reason: 'blocked' };

    const item = this.placePriority.find((candidate) => this.stash.count(candidate) > 0);
    if (item === undefined) return { ok: false, reason: 'noMaterial' };

    const block = itemToBlock(item);
    if (block === null) return { ok: false, reason: 'noMaterial' };

    if (!this.terrain.place(target.x, target.y, block)) return { ok: false, reason: 'blocked' };

    this.stash.take(item);
    this.player.trySwing();

    return { ok: true, block };
  }

  /**
   * 렌더러에 넘길 오브젝트 목록을 만든다.
   *
   * @returns 이번 프레임의 오브젝트 목록(내부 버퍼).
   */
  entities(): readonly Entity[] {
    this.entityBuffer.length = 0;

    for (const node of this.resources.all) {
      // 부서진 노드는 리스폰될 때까지 화면에서 사라진다.
      if (node.durability <= 0) continue;

      const z = Math.max(0, this.terrain.columnHeight(node.x, node.y) - 1);
      const damage = this.resources.damageRatio(node);

      if (node.kind === 'tree') {
        this.entityBuffer.push({ kind: 'tree', x: node.x, y: node.y, z, damage });
      } else {
        this.entityBuffer.push({ kind: 'oreVein', x: node.x, y: node.y, z, damage });
      }
    }

    const pose = this.player.pose(this.terrain);
    this.entityBuffer.push({ kind: 'player', x: pose.x, y: pose.y, z: pose.z, swing: pose.swing });

    return this.entityBuffer;
  }

  /**
   * 대상 칸에 무엇이 있는지 한 줄로 설명한다. 커서 안내 문구에 쓴다.
   *
   * @param target 대상 칸.
   * @returns 설명 문자열. 아무것도 없으면 null.
   */
  describeTile(target: TilePos): string | null {
    const node = this.resources.nodeAt(target.x, target.y);
    if (node && node.durability > 0) {
      const definition = nodeDefinition(node.kind);
      const ratio = Math.round((1 - this.resources.damageRatio(node)) * 100);
      return `${definition.label} ${ratio}%`;
    }

    return null;
  }
}

/**
 * 플레이어 시작 칸을 고른다. 맵 중앙에서 가장 가까운, 설 수 있고 비어 있는 칸이다.
 *
 * @param terrain 지형.
 * @param resources 자원 노드(나무 위에서 시작하지 않도록 확인한다).
 * @returns 시작 칸.
 */
function findStartTile(terrain: Terrain, resources: ResourceField): TilePos {
  const center = {
    x: Math.floor((terrain.width - 1) / 2),
    y: Math.floor((terrain.height - 1) / 2),
  };

  if (terrain.columnHeight(center.x, center.y) >= 1 && !resources.isBlocked(center.x, center.y)) {
    return center;
  }

  // 중앙이 뚫려 있으면 바깥으로 한 겹씩 넓히며 설 수 있는 칸을 찾는다.
  const maxRadius = Math.max(terrain.width, terrain.height);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (terrain.contains(x, y) && terrain.columnHeight(x, y) >= 1 && !resources.isBlocked(x, y)) {
          return { x, y };
        }
      }
    }
  }

  return center;
}
