import { SoundId } from '../audio/sounds';
import { TargetCursor } from '../core/cursor';
import type { TilePos } from '../core/movement';
import type { ActionResult, Game } from '../sim/Game';
import type { KeyboardControls } from './KeyboardControls';

/**
 * 겨냥 키를 누르고 있을 때 커서가 한 칸씩 움직이는 간격(ms).
 *
 * 걷기와 마찬가지로 OS 키 반복에 맡기지 않는다. 기기 설정에 따라 커서 속도가
 * 달라지면 같은 조작이 사람마다 다르게 동작한다.
 */
export const AIM_REPEAT_MS = 110;

/**
 * 겨냥 키를 누르고 있을 때 반복이 시작되기까지의 시간(ms).
 *
 * 첫 한 칸은 키를 누른 순간 곧바로 움직인다. 곧장 반복까지 시작하면 한 칸만
 * 옮기려던 손짓이 두세 칸을 건너뛴다 — 문자 입력의 키 반복과 같은 이유다.
 */
export const AIM_DELAY_MS = 300;

/** 줌 키 한 번에 바뀌는 배율. */
export const ZOOM_STEP = 1.25;

/**
 * 입력이 일으킨 일을 화면과 소리로 옮기는 창구.
 *
 * 규칙(`Game`)은 무슨 일이 있었는지 값으로만 돌려주고, 그것을 무엇으로 보여줄지는
 * 바깥이 정한다. 테스트는 이 창구를 비워 두고 게임 상태만 본다 —
 * 그래서 오디오도 캔버스도 없는 환경에서 조작 전체를 돌려볼 수 있다.
 */
export interface InputHooks {
  /** 첫 입력에서 오디오 잠금을 푼다(브라우저 자동재생 정책). */
  unlock?(): void;
  /** 행동 결과를 알린다. */
  report?(result: ActionResult, target?: TilePos): void;
  /** 토스트를 띄운다. */
  toast?(message: string, tone: 'neutral' | 'good' | 'bad'): void;
  /** 소리를 낸다. */
  play?(sound: SoundId): void;
  /** 파편을 튀긴다. */
  burst?(x: number, y: number, color: string, count: number): void;
  /** 확대율을 곱한다. */
  zoomBy?(factor: number): void;
  /** 카메라를 플레이어 추적으로 되돌린다. */
  follow?(): void;
}

/**
 * 키보드 입력을 게임 행동으로 옮기는 라우터.
 *
 * `main.ts`에 흩어져 있던 키 연결을 한곳으로 모은 것이다. 캔버스도 DOM도 보지
 * 않으므로 **가짜 이벤트 대상만 있으면 조작 전체를 테스트할 수 있다** — 지금까지
 * 봇 통과 플레이가 `Game` API를 직접 불러 입력 계층을 한 번도 검증하지 않았고,
 * 그래서 "고를 수 없는 설계도" 같은 결함이 오래 남아 있었다.
 */
export class InputRouter {
  /** 조작할 게임. */
  private readonly game: Game;

  /** 키 입력원. */
  private readonly keyboard: KeyboardControls;

  /** 표현 창구. */
  private readonly hooks: InputHooks;

  /** 지금 겨냥한 칸을 들고 있는 커서. */
  readonly cursor = new TargetCursor();

  /** 겨냥 키를 누르고 있는 시간(ms). 반복 시작 판정에 쓴다. */
  private aimHeldMs = 0;

  /** 반복이 시작된 뒤 다음 한 칸까지 쌓이는 시간(ms). */
  private aimRepeatMs = 0;

  /**
   * @param game 조작할 게임.
   * @param keyboard 키 입력원.
   * @param hooks 표현 창구. 넘기지 않으면 아무것도 보여주지 않는다.
   */
  constructor(game: Game, keyboard: KeyboardControls, hooks: InputHooks = {}) {
    this.game = game;
    this.keyboard = keyboard;
    this.hooks = hooks;
  }

  /** 지금 겨냥한 칸. 마우스가 맵 밖을 가리키면 null이다. */
  get target(): TilePos | null {
    return this.cursor.tile(this.game.terrain, this.game.player.position);
  }

  /**
   * 마우스가 가리키는 칸을 알린다. 매 프레임 불러도 된다.
   *
   * @param tile 마우스가 가리키는 칸. 캔버스 밖이면 null.
   */
  setPointerTile(tile: TilePos | null): void {
    this.cursor.setPointer(tile);
  }

  /** 키 연결을 건다. `KeyboardControls.attach`는 바깥에서 부른다. */
  bind(): void {
    this.keyboard.setSlotHandler((index) => this.selectSlot(index));
    this.keyboard.setActionHandler(() => this.act());
    // 첫 한 칸은 누른 순간 움직이고, 누르고 있으면 `updateAim`이 이어 간다.
    this.keyboard.setAimHandler((dx, dy) => this.cursor.aimBy(dx, dy));

    // 쌓기는 마우스에서 우클릭이었다. 키보드에도 자리가 있어야 평탄화를 할 수 있다.
    this.keyboard.bind('KeyQ', () => this.place());
    this.keyboard.bind('KeyE', () => this.deposit());
    this.keyboard.bind('KeyB', () => this.toggleBuildMode());
    this.keyboard.bind('Escape', () => {
      this.game.selectBlueprint(null);
    });
    this.keyboard.bind('KeyX', () => this.demolish());
    // 맵 이동. 통로 위에 서서 누른다.
    this.keyboard.bind('KeyF', () => this.travel());
    // 일터 배정. 겨냥한 건물에 주민을 넣거나 뺀다.
    this.keyboard.bind('KeyG', () => this.toggleWorker());
    // 외형 바꾸기. 규칙에는 영향이 없는 꾸미기다.
    this.keyboard.bind('KeyV', () => this.cycleLook());
    // 설계도 넘기기. 숫자 키는 아홉에서 상한에 닿는다.
    this.keyboard.bind('BracketRight', () => this.cycleBlueprint(1));
    this.keyboard.bind('BracketLeft', () => this.cycleBlueprint(-1));
    this.keyboard.bind('KeyR', () => this.fulfill());

    // 시야 조작. 마우스의 휠·드래그를 대신한다.
    this.keyboard.bind('Equal', () => this.hooks.zoomBy?.(ZOOM_STEP));
    this.keyboard.bind('NumpadAdd', () => this.hooks.zoomBy?.(ZOOM_STEP));
    this.keyboard.bind('Minus', () => this.hooks.zoomBy?.(1 / ZOOM_STEP));
    this.keyboard.bind('NumpadSubtract', () => this.hooks.zoomBy?.(1 / ZOOM_STEP));
    this.keyboard.bind('KeyC', () => this.hooks.follow?.());
  }

  /**
   * 고정 간격으로 부른다. 겨냥 반복·걷기·연속 채집을 처리한다.
   *
   * @param stepMs 이번 스텝 길이(ms).
   * @param heldTile 마우스를 누르고 있는 칸. 없으면 null.
   */
  update(stepMs: number, heldTile: TilePos | null = null): void {
    this.updateAim(stepMs);
    this.updateWalk();
    this.updateHarvest(heldTile);
  }

  /**
   * 겨냥 키를 누르고 있으면 커서를 일정 간격으로 옮긴다.
   *
   * @param stepMs 이번 스텝 길이(ms).
   */
  private updateAim(stepMs: number): void {
    const aim = this.keyboard.aimIntent;
    if (!aim) {
      this.aimHeldMs = 0;
      this.aimRepeatMs = 0;
      return;
    }

    // 첫 한 칸은 키를 누른 순간 이미 움직였다(`bind`의 겨냥 콜백).
    this.aimHeldMs += stepMs;
    if (this.aimHeldMs < AIM_DELAY_MS) return;

    this.aimRepeatMs += stepMs;
    if (this.aimRepeatMs < AIM_REPEAT_MS) return;

    this.aimRepeatMs = 0;
    this.cursor.aimBy(aim.dx, aim.dy);
  }

  /** 걷기 키를 보고 한 걸음 옮긴다. 커서도 함께 따라간다. */
  private updateWalk(): void {
    const intent = this.keyboard.moveIntent;
    if (!intent) return;

    if (!this.game.movePlayer(intent.dx, intent.dy)) return;

    // 건축 모드에서는 찍어 둔 부지를 지킨다(`TargetCursor.faceTowards` 주석 참고).
    this.cursor.faceTowards(intent.dx, intent.dy, this.game.buildMode);
    this.hooks.follow?.();
  }

  /**
   * 누르고 있는 동안 이어서 때린다. 반복 속도는 휘두르기 쿨다운이 정한다.
   *
   * 건축 모드에서는 하지 않는다 — 누르고 있는 동안 건물이 줄줄이 세워지면
   * 자재가 순식간에 사라진다.
   *
   * @param heldTile 마우스를 누르고 있는 칸.
   */
  private updateHarvest(heldTile: TilePos | null): void {
    if (this.game.buildMode || !this.game.player.idle) return;

    const held = heldTile ?? (this.keyboard.actionHeld ? this.actionTarget() : null);
    if (!held) return;

    // 행동을 먼저 하고 결과를 넘긴다. `hooks.report?.(game.actAt(...))`처럼 쓰면
    // 옵셔널 호출이 인자 계산까지 건너뛰어, 창구가 없을 때 행동 자체가 사라진다.
    const result = this.game.actAt(held);
    this.hooks.report?.(result, held);
  }

  /**
   * 숫자 키를 처리한다. 건축 모드에서는 설계도, 아니면 도구다.
   *
   * @param index 고른 번호.
   */
  private selectSlot(index: number): void {
    if (this.game.buildMode) {
      const blueprint = this.game.availableBlueprints[index];
      if (blueprint) this.game.selectBlueprint(blueprint.id);
      return;
    }

    this.game.player.selectTool(index);
  }

  /** 겨냥한 칸에 주 행동을 한다. 건축 모드에서는 배치 확정이다. */
  private act(): void {
    this.hooks.unlock?.();

    const target = this.actionTarget();
    if (!target) return;

    const result = this.game.buildMode ? this.game.buildAt(target) : this.game.actAt(target);
    this.hooks.report?.(result, target);
  }

  /**
   * 지금 Space가 행동할 칸을 고른다.
   *
   * 이동 키를 누른 손짓은 "그쪽 앞을 행동한다"는 뜻이다. 커서가 이전 대상이나 먼
   * 건축 부지에 남아 있어도 일반 채집·수리·전투는 이동 방향 인접 칸을 우선한다.
   * 건축 모드는 부지를 멀리 고르는 흐름이므로 기존 커서를 그대로 쓴다(ADR 0024).
   *
   * @returns 행동 대상. 커서도 대상도 없으면 null.
   */
  private actionTarget(): TilePos | null {
    const intent = this.keyboard.moveIntent;
    if (!this.game.buildMode && intent) {
      const position = this.game.player.position;
      const x = position.x + intent.dx;
      const y = position.y + intent.dy;

      return this.game.terrain.contains(x, y) ? { x, y } : null;
    }

    return this.target;
  }

  /** 겨냥한 칸에 들고 있는 블록을 쌓는다. */
  place(): void {
    this.hooks.unlock?.();

    const target = this.target;
    if (!target) return;

    const placed = this.game.placeAt(target);
    if (placed.ok) this.hooks.play?.(SoundId.PLACE);
    this.hooks.report?.(placed, target);
  }

  /** 창고에 가진 것을 맡긴다. */
  private deposit(): void {
    this.hooks.unlock?.();

    const moved = this.game.depositAll();
    if (moved.size === 0) {
      this.hooks.toast?.(
        this.game.nearStorage ? '예치할 자원이 없습니다' : '창고 옆으로 가세요',
        'bad',
      );
      this.hooks.play?.(SoundId.DENY);
      return;
    }

    this.hooks.play?.(SoundId.DEPOSIT);
  }

  /** 건축 모드를 켜고 끈다. 켤 때는 첫 번째 설계도를 고른다. */
  toggleBuildMode(): void {
    this.hooks.unlock?.();

    if (this.game.buildMode) {
      this.game.selectBlueprint(null);
      return;
    }

    const first = this.game.availableBlueprints[0];
    if (first) this.game.selectBlueprint(first.id);
  }

  /** 겨냥한 칸의 건물을 철거한다. */
  private demolish(): void {
    const target = this.target;
    if (!target) return;

    const result = this.game.demolishAt(target);
    if (!result.ok) {
      this.hooks.report?.(result, target);
      return;
    }

    this.hooks.toast?.('철거 — 자재 절반을 돌려받았습니다', 'neutral');
    this.hooks.play?.(SoundId.DEMOLISH);
    this.hooks.burst?.(target.x, target.y, '#c9b592', 8);
  }

  /** 통로를 타고 반대편 맵으로 간다. */
  private travel(): void {
    this.hooks.unlock?.();

    const result = this.game.travel();
    this.hooks.report?.(result);
    if (result.ok) {
      this.hooks.play?.(SoundId.MIGRATION);
      // 새 맵에서는 곧바로 앞을 보게 한다. 커서가 옛 오프셋을 유지하면
      // 도착하자마자 벽 너머를 겨냥하고 있을 수 있다.
      this.cursor.faceTowards(1, 0);
      this.hooks.follow?.();
    }
  }

  /** 겨냥한 일터에 주민을 배정하거나 뺀다. */
  private toggleWorker(): void {
    this.hooks.unlock?.();

    const target = this.target;
    if (!target) return;

    const result = this.game.toggleWorker(target);
    this.hooks.report?.(result, target);
    if (result.ok) this.hooks.play?.(SoundId.BUILD_DONE);
  }

  /**
   * 설계도를 넘긴다. 건축 모드가 아니면 켜면서 첫 설계도를 고른다.
   *
   * @param step 넘길 방향.
   */
  private cycleBlueprint(step: number): void {
    this.hooks.unlock?.();
    this.game.cycleBlueprint(step);
  }

  /** 겨냥한 건물의 외형을 바꾼다. */
  private cycleLook(): void {
    const target = this.target;
    if (!target) return;

    const result = this.game.cycleLook(target);
    this.hooks.report?.(result, target);
    if (result.ok) this.hooks.play?.(SoundId.PLACE);
  }

  /** 낼 수 있는 요청을 낸다. */
  private fulfill(): void {
    this.hooks.unlock?.();

    if (this.game.fulfillRequest()) return;

    this.hooks.toast?.('낼 수 있는 요청이 없습니다', 'bad');
    this.hooks.play?.(SoundId.DENY);
  }
}
