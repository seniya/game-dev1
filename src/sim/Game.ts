import { BlockStash } from '../core/BlockStash';
import { BlockType, isPlaceable } from '../core/blocks';
import { canInteract, type TilePos } from '../core/movement';
import { Terrain } from '../core/Terrain';
import { canDigBlock } from '../core/tools';
import type { Entity } from '../render/WorldRenderer';
import { Player } from './Player';

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
  /** 그 자리에는 놓을 수 없다(높이 상한 등). */
  | 'blocked';

/** 행동 결과. 성공이면 무엇을 얻었는지 함께 알린다. */
export type ActionResult =
  | { ok: true; block?: BlockType }
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
  /** 파낸 블록 임시 저장소. Phase 5에서 인벤토리로 대체한다. */
  readonly stash = new BlockStash();

  /** 쌓기에 쓸 블록의 우선순위. 흙을 먼저 쓰고 없으면 돌을 쓴다. */
  private readonly placePriority: readonly BlockType[] = [BlockType.DIRT, BlockType.STONE];

  /** 렌더러에 넘길 오브젝트 버퍼. 프레임마다 새 배열을 만들지 않는다. */
  private readonly entityBuffer: Entity[] = [];

  /**
   * @param terrain 지형.
   */
  constructor(terrain: Terrain) {
    this.terrain = terrain;

    const start = findStartTile(terrain);
    this.player = new Player(start.x, start.y);
  }

  /**
   * 시뮬레이션을 한 스텝 진행한다.
   *
   * @param stepMs 스텝 길이(ms).
   */
  update(stepMs: number): void {
    this.player.update(stepMs);
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
    // 지형 재료로 쓸 수 있는 것만 손에 남긴다. 철광석은 자원이므로 되놓지 않는다.
    if (isPlaceable(removed)) this.stash.add(removed);

    return { ok: true, block: removed };
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

    const type = this.placePriority.find((candidate) => this.stash.count(candidate) > 0);
    if (type === undefined) return { ok: false, reason: 'noMaterial' };

    if (!this.terrain.place(target.x, target.y, type)) return { ok: false, reason: 'blocked' };

    this.stash.take(type);
    this.player.trySwing();

    return { ok: true, block: type };
  }

  /**
   * 렌더러에 넘길 오브젝트 목록을 만든다.
   *
   * @returns 이번 프레임의 오브젝트 목록(내부 버퍼).
   */
  entities(): readonly Entity[] {
    this.entityBuffer.length = 0;

    const pose = this.player.pose(this.terrain);
    this.entityBuffer.push({ kind: 'player', x: pose.x, y: pose.y, z: pose.z, swing: pose.swing });

    return this.entityBuffer;
  }
}

/**
 * 플레이어 시작 칸을 고른다. 맵 중앙에서 가장 가까운, 설 수 있는 칸이다.
 *
 * @param terrain 지형.
 * @returns 시작 칸.
 */
function findStartTile(terrain: Terrain): TilePos {
  const center = {
    x: Math.floor((terrain.width - 1) / 2),
    y: Math.floor((terrain.height - 1) / 2),
  };

  if (terrain.columnHeight(center.x, center.y) >= 1) return center;

  // 중앙이 뚫려 있으면 바깥으로 한 겹씩 넓히며 설 수 있는 칸을 찾는다.
  const maxRadius = Math.max(terrain.width, terrain.height);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = center.x + dx;
        const y = center.y + dy;
        if (terrain.contains(x, y) && terrain.columnHeight(x, y) >= 1) return { x, y };
      }
    }
  }

  return center;
}
