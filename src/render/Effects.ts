import { gridToWorld } from '../core/coordinates';
import type { Camera } from './Camera';

/** 튀는 파편 하나. */
interface Chip {
  /** 시작 지점의 그리드 좌표. */
  gridX: number;
  gridY: number;
  gridZ: number;
  /** 화면 기준 속도(px/초). */
  velocityX: number;
  velocityY: number;
  /** 시작 이후 흐른 시간(ms). */
  ageMs: number;
  /** 수명(ms). */
  lifeMs: number;
  /** 색. */
  color: string;
}

/** 떠오르는 글자 하나. */
interface Floater {
  gridX: number;
  gridY: number;
  gridZ: number;
  text: string;
  color: string;
  ageMs: number;
  lifeMs: number;
}

/** 파편이 사는 시간(ms). */
const CHIP_LIFE_MS = 520;

/** 글자가 떠 있는 시간(ms). */
const FLOATER_LIFE_MS = 1100;

/** 중력 가속도(px/초²). 화면 좌표 기준이다. */
const GRAVITY = 620;

/**
 * 채집·파기 같은 순간 연출을 모아 그린다.
 *
 * 게임 규칙과 분리해 두는 이유는, 연출이 상태를 바꾸지 않기 때문이다. `Game`은 무슨 일이
 * 일어났는지만 알리고, 무엇을 보여줄지는 이쪽에서 정한다.
 *
 * 파편과 글자는 **그리드 좌표에 매여 있다.** 화면 좌표로 들고 있으면 카메라를 움직이는
 * 동안 연출만 화면에 붙어 따라다녀 어색해진다.
 */
export class Effects {
  private readonly chips: Chip[] = [];
  private readonly floaters: Floater[] = [];

  /** 지금 살아 있는 연출 수. */
  get count(): number {
    return this.chips.length + this.floaters.length;
  }

  /**
   * 파편을 튀긴다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param z 레이어.
   * @param color 파편 색.
   * @param amount 개수.
   */
  burst(x: number, y: number, z: number, color: string, amount = 6): void {
    for (let i = 0; i < amount; i += 1) {
      const angle = -Math.PI / 2 + (i / amount - 0.5) * Math.PI * 1.1;
      const speed = 90 + (i % 3) * 45;

      this.chips.push({
        gridX: x,
        gridY: y,
        gridZ: z,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        ageMs: 0,
        lifeMs: CHIP_LIFE_MS,
        color,
      });
    }
  }

  /**
   * 글자를 띄운다. 자원 획득처럼 "무엇이 얼마나" 들어왔는지 알릴 때 쓴다.
   *
   * @param x 그리드 x.
   * @param y 그리드 y.
   * @param z 레이어.
   * @param text 표시할 글자.
   * @param color 글자 색.
   */
  float(x: number, y: number, z: number, text: string, color: string): void {
    this.floaters.push({
      gridX: x,
      gridY: y,
      gridZ: z,
      text,
      color,
      ageMs: 0,
      lifeMs: FLOATER_LIFE_MS,
    });
  }

  /**
   * 시간을 흘려보내고 수명이 다한 것을 지운다.
   *
   * @param stepMs 흐른 시간(ms).
   */
  update(stepMs: number): void {
    for (let i = this.chips.length - 1; i >= 0; i -= 1) {
      const chip = this.chips[i]!;
      chip.ageMs += stepMs;
      if (chip.ageMs >= chip.lifeMs) this.chips.splice(i, 1);
    }

    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const floater = this.floaters[i]!;
      floater.ageMs += stepMs;
      if (floater.ageMs >= floater.lifeMs) this.floaters.splice(i, 1);
    }
  }

  /** 모든 연출을 지운다. 저장을 되살릴 때처럼 화면이 통째로 바뀌는 경우에 쓴다. */
  clear(): void {
    this.chips.length = 0;
    this.floaters.length = 0;
  }

  /**
   * 연출을 그린다. 지형과 오브젝트를 모두 그린 뒤에 호출한다.
   *
   * @param ctx 그리기 컨텍스트.
   * @param camera 카메라.
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const zoom = camera.zoom;

    for (const chip of this.chips) {
      const seconds = chip.ageMs / 1000;
      const world = gridToWorld(chip.gridX, chip.gridY, chip.gridZ);
      const screen = camera.worldToScreen(world.x, world.y);

      const x = screen.x + chip.velocityX * seconds * zoom;
      const y = screen.y + (chip.velocityY * seconds + 0.5 * GRAVITY * seconds * seconds) * zoom;
      const fade = 1 - chip.ageMs / chip.lifeMs;

      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = chip.color;
      ctx.fillRect(x - 1.5 * zoom, y - 1.5 * zoom, 3 * zoom, 3 * zoom);
    }

    ctx.globalAlpha = 1;

    for (const floater of this.floaters) {
      const progress = floater.ageMs / floater.lifeMs;
      const world = gridToWorld(floater.gridX, floater.gridY, floater.gridZ);
      const screen = camera.worldToScreen(world.x, world.y);

      const y = screen.y - (18 + progress * 26) * zoom;
      // 끝의 3분의 1 동안만 옅어진다. 처음부터 흐리면 읽기 어렵다.
      ctx.globalAlpha = progress < 0.66 ? 1 : Math.max(0, (1 - progress) * 3);

      ctx.font = `${Math.max(10, 12 * zoom)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeText(floater.text, screen.x, y);
      ctx.fillStyle = floater.color;
      ctx.fillText(floater.text, screen.x, y);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
}
