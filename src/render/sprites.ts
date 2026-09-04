import { BlockType } from '../core/blocks';
import { LAYER_HEIGHT, TILE_HEIGHT, TILE_WIDTH } from '../core/coordinates';
import { lookById } from '../core/looks';
import { DEFAULT_ACTOR_FACING, quantizeStride, type ActorFacing } from '../core/actorMotion';
import type { BuildingStyle, OreKind } from './WorldRenderer';

/**
 * 스프라이트를 만들 때 쓰는 배율.
 *
 * 기본 크기(타일 64×32)로 만들면 확대했을 때 흐려진다. 2배로 만들어 두고 줄여 그리면
 * 축소는 브라우저가 부드럽게 처리하고 확대해도 3배까지는 뭉개지지 않는다.
 */
export const SPRITE_SCALE = 2;

/** 나무·광맥의 손상 단계 수. 단계마다 다른 그림을 만들어 둔다. */
export const DAMAGE_STAGES = 3;

/** 스프라이트 하나와 그릴 때 쓸 기준점. */
export interface Sprite {
  /** 그릴 이미지. */
  readonly image: CanvasImageSource;
  /** 이미지의 논리 폭(기본 배율 기준 px). */
  readonly width: number;
  /** 이미지의 논리 높이(기본 배율 기준 px). */
  readonly height: number;
  /** 기준점에서 이미지 좌상단까지의 x 오프셋(기본 배율 기준 px). */
  readonly offsetX: number;
  /** 기준점에서 이미지 좌상단까지의 y 오프셋(기본 배율 기준 px). */
  readonly offsetY: number;
}

/** 렌더러가 쓰는 스프라이트 모음. */
export interface SpriteSet {
  /**
   * 블록 윗면. 기준점은 윗면 마름모의 중심이다.
   *
   * @param block 블록 타입.
   */
  top(block: BlockType): Sprite;
  /**
   * +x 방향 측면. 기준점은 윗면 마름모의 중심이다.
   *
   * @param block 블록 타입.
   */
  sideX(block: BlockType): Sprite;
  /**
   * +y 방향 측면. 기준점은 윗면 마름모의 중심이다.
   *
   * @param block 블록 타입.
   */
  sideY(block: BlockType): Sprite;
  /**
   * 나무. 기준점은 선 칸의 윗면 중심이다.
   *
   * @param stage 손상 단계(0이 멀쩡).
   */
  tree(stage: number): Sprite;
  /**
   * 광맥. 기준점은 선 칸의 윗면 중심이다.
   *
   * @param iron 철광석 광맥이면 true.
   * @param stage 손상 단계.
   */
  oreVein(ore: OreKind, stage: number): Sprite;
  /**
   * 건물. 기준점은 점유 영역 중심 칸의 윗면 중심이다.
   *
   * @param style 외형.
   * @param width 가로 칸수.
   * @param depth 세로 칸수.
   */
  building(style: BuildingStyle, width: number, depth: number, look?: number): Sprite;
  /**
   * 캐릭터. 기준점은 발이 놓인 칸의 윗면 중심이다.
   *
   * @param hue 색상값(0~359). 플레이어는 고정 색을 쓰려면 -1을 넘긴다.
   */
  pawn(hue: number, stride?: number, facing?: ActorFacing): Sprite;
}

/** 2D 컨텍스트를 가진 오프스크린 캔버스. */
interface Surface {
  canvas: CanvasImageSource;
  ctx: CanvasRenderingContext2D;
}

/**
 * 절차적으로 그린 스프라이트 모음을 만든다.
 *
 * 외부 이미지 파일을 쓰지 않는 이유는 `docs/adr/0009-스프라이트-생성.md`에 있다.
 * 요약하면, 그림을 코드로 그려 오프스크린 캔버스에 캐시하면 파일 없이도 도형보다
 * 훨씬 세밀한 표현을 얻고 드로우 비용도 줄어든다.
 *
 * @returns 스프라이트 모음. 캔버스를 만들 수 없는 환경(테스트 등)이면 null.
 */
export function createSpriteSet(): SpriteSet | null {
  if (!canCreateSurface()) return null;

  const cache = new Map<string, Sprite>();

  /**
   * 캐시를 거쳐 스프라이트를 얻는다.
   *
   * @param key 캐시 키.
   * @param make 없을 때 만드는 함수.
   */
  const memo = (key: string, make: () => Sprite): Sprite => {
    const found = cache.get(key);
    if (found) return found;

    const made = make();
    cache.set(key, made);

    return made;
  };

  return {
    top: (block) => memo(`top:${block}`, () => makeTop(block)),
    sideX: (block) => memo(`sx:${block}`, () => makeSide(block, true)),
    sideY: (block) => memo(`sy:${block}`, () => makeSide(block, false)),
    tree: (stage) => memo(`tree:${stage}`, () => makeTree(stage)),
    oreVein: (ore, stage) => memo(`ore:${ore}:${stage}`, () => makeOreVein(ore, stage)),
    // 캐시 키에 외형을 넣지 않으면 같은 종류의 건물이 모두 마지막 외형으로 그려진다.
    building: (style, width, depth, look = 0) =>
      memo(`b:${style}:${width}:${depth}:${look}`, () => makeBuilding(style, width, depth, look)),
    // 색상은 30도 단위로 묶는다. 주민마다 캔버스를 만들면 수가 늘수록 메모리가 는다.
    pawn: (hue, stride = 0, facing = DEFAULT_ACTOR_FACING) => {
      const color = quantizeHue(hue);
      const frame = quantizeStride(stride);

      return memo(`pawn:${color}:${frame}:${facing}`, () => makePawn(color, frame, facing));
    },
  };
}

/**
 * 광맥 종류별 알갱이 표현.
 *
 * 색은 인벤토리 바의 아이템 색과 맞춘다 — 화면에서 캔 것과 손에 든 것이 같은 색이어야
 * 무엇을 캐고 있는지 알 수 있다.
 */
const ORE_LOOK: Readonly<
  Record<OreKind, { color: string; glint: string; alpha: number; count: number; radius: number; spread: number }>
> = {
  stone: { color: '#98a0a8', glint: '#b3bac1', alpha: 0.75, count: 4, radius: 0.07, spread: 0.04 },
  iron: { color: '#d0894f', glint: '#f0b985', alpha: 1, count: 7, radius: 0.09, spread: 0.05 },
  crystal: { color: '#9a86e0', glint: '#d6cbff', alpha: 1, count: 6, radius: 0.11, spread: 0.06 },
};

/**
 * 캔버스를 만들 수 있는 환경인지 확인한다.
 *
 * @returns 만들 수 있으면 true.
 */
function canCreateSurface(): boolean {
  try {
    return createSurface(1, 1) !== null;
  } catch {
    return false;
  }
}

/**
 * 오프스크린 캔버스를 만든다.
 *
 * @param width 논리 폭(기본 배율 기준).
 * @param height 논리 높이(기본 배율 기준).
 * @returns 캔버스와 컨텍스트. 만들 수 없으면 null.
 */
function createSurface(width: number, height: number): Surface | null {
  const pixelWidth = Math.max(1, Math.ceil(width * SPRITE_SCALE));
  const pixelHeight = Math.max(1, Math.ceil(height * SPRITE_SCALE));

  let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(pixelWidth, pixelHeight);
  } else if (typeof document !== 'undefined') {
    const element = document.createElement('canvas');
    element.width = pixelWidth;
    element.height = pixelHeight;
    canvas = element;
  }

  if (!canvas) return null;

  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return null;

  // 이후 그리기는 기본 배율 좌표로 한다. 배율은 여기서 한 번만 반영한다.
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);

  return { canvas, ctx };
}

/**
 * 색상값을 30도 단위로 묶는다.
 *
 * @param hue 색상값. 음수면 플레이어 색으로 본다.
 * @returns 묶인 색상값. 플레이어는 -1.
 */
function quantizeHue(hue: number): number {
  if (hue < 0) return -1;

  return Math.floor(((hue % 360) + 360) % 360 / 30) * 30;
}

/** 블록별 색 팔레트. 명암을 단계로 나눠 질감을 만든다. */
const PALETTE: Readonly<
  Record<BlockType, { top: string; topDark: string; topLight: string; sideX: string; sideY: string; line: string }>
> = {
  [BlockType.EMPTY]: {
    top: 'transparent',
    topDark: 'transparent',
    topLight: 'transparent',
    sideX: 'transparent',
    sideY: 'transparent',
    line: 'transparent',
  },
  [BlockType.DIRT]: {
    top: '#4a7a41',
    topDark: '#3d6836',
    topLight: '#5c8f4f',
    sideX: '#7a5636',
    sideY: '#5c4028',
    line: '#6a4a2e',
  },
  [BlockType.STONE]: {
    top: '#8b8f96',
    topDark: '#767a81',
    topLight: '#a2a6ad',
    sideX: '#6e727a',
    sideY: '#53575e',
    line: '#5f636a',
  },
  [BlockType.IRON_ORE]: {
    top: '#a98a72',
    topDark: '#8f7160',
    topLight: '#c0a189',
    sideX: '#8a6a52',
    sideY: '#69503d',
    line: '#7a5f4c',
  },
};

/**
 * 결정적 의사 난수. 스프라이트의 얼룩 위치를 정하는 데 쓴다.
 *
 * 같은 입력이면 같은 그림이 나와야 한다 — 실행마다 지형 무늬가 달라지면
 * 스크린샷 비교가 불가능해진다.
 *
 * @param index 순번.
 * @param salt 구분값.
 * @returns 0 이상 1 미만의 값.
 */
function speckle(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;

  return value - Math.floor(value);
}

/**
 * 블록 윗면 스프라이트를 만든다.
 *
 * 평평한 마름모 하나가 아니라 얼룩과 가장자리 밝기를 넣어 질감을 준다.
 *
 * @param block 블록 타입.
 * @returns 스프라이트.
 */
function makeTop(block: BlockType): Sprite {
  const width = TILE_WIDTH;
  const height = TILE_HEIGHT;
  const surface = createSurface(width, height)!;
  const { ctx } = surface;
  const palette = PALETTE[block];

  const cx = width / 2;
  const cy = height / 2;

  // 마름모 안쪽만 그리도록 잘라 둔다.
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(width, cy);
  ctx.lineTo(cx, height);
  ctx.lineTo(0, cy);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = palette.top;
  ctx.fillRect(0, 0, width, height);

  // 얼룩. 작고 많이 찍어야 뭉툭한 반점이 아니라 질감으로 읽힌다.
  for (let i = 0; i < 70; i += 1) {
    const px = speckle(i, block * 3 + 1) * width;
    const py = speckle(i, block * 3 + 2) * height;
    const radius = 0.5 + speckle(i, block * 3 + 3) * 0.9;

    ctx.fillStyle = i % 2 === 0 ? palette.topDark : palette.topLight;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(px, py, radius, radius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 흙 표면(풀)에는 짧은 결을 더한다. 돌·광석은 결이 없어야 재질이 구분된다.
  if (block === BlockType.DIRT) {
    ctx.strokeStyle = palette.topLight;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 22; i += 1) {
      const px = speckle(i, 41) * width;
      const py = speckle(i, 42) * height;
      const length = 1.5 + speckle(i, 43) * 2;

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (speckle(i, 44) - 0.5) * 1.5, py - length);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 위쪽을 아주 옅게 밝힌다. 세게 주면 타일마다 테두리가 생겨 누비이불처럼 보인다.
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.07)');
  gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.06)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  return { image: surface.canvas, width, height, offsetX: -width / 2, offsetY: -height / 2 };
}

/**
 * 블록 측면 스프라이트를 만든다.
 *
 * 측면은 평행사변형이라 직사각 이미지 안에 투명 여백을 두고 그린다.
 *
 * @param block 블록 타입.
 * @param towardX +x 방향 면이면 true.
 * @returns 스프라이트.
 */
function makeSide(block: BlockType, towardX: boolean): Sprite {
  const width = TILE_WIDTH / 2;
  const height = TILE_HEIGHT / 2 + LAYER_HEIGHT;
  const surface = createSurface(width, height)!;
  const { ctx } = surface;
  const palette = PALETTE[block];

  // 기준점(윗면 중심)에서 본 네 꼭짓점. towardX면 동→남, 아니면 남→서 변을 늘인다.
  const top = towardX
    ? [
        { x: width, y: 0 },
        { x: 0, y: TILE_HEIGHT / 2 },
      ]
    : [
        { x: width, y: TILE_HEIGHT / 2 },
        { x: 0, y: 0 },
      ];

  ctx.beginPath();
  ctx.moveTo(top[0]!.x, top[0]!.y);
  ctx.lineTo(top[1]!.x, top[1]!.y);
  ctx.lineTo(top[1]!.x, top[1]!.y + LAYER_HEIGHT);
  ctx.lineTo(top[0]!.x, top[0]!.y + LAYER_HEIGHT);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = towardX ? palette.sideX : palette.sideY;
  ctx.fillRect(0, 0, width, height);

  // 지층처럼 보이도록 가로 선을 옅게 긋는다.
  ctx.strokeStyle = palette.line;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i += 1) {
    const offset = (LAYER_HEIGHT / 3) * i;
    ctx.beginPath();
    ctx.moveTo(top[0]!.x, top[0]!.y + offset);
    ctx.lineTo(top[1]!.x, top[1]!.y + offset);
    ctx.stroke();
  }

  // 얼룩으로 돌·흙의 거친 느낌을 준다.
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 12; i += 1) {
    const px = speckle(i, block * 5 + (towardX ? 7 : 11)) * width;
    const py = speckle(i, block * 5 + 13) * height;

    ctx.fillStyle = palette.line;
    ctx.beginPath();
    ctx.ellipse(px, py, 1.4, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 아래로 갈수록 어둡게 해 깊이를 준다.
  ctx.globalAlpha = 1;
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  const offsetX = towardX ? 0 : -width;

  return { image: surface.canvas, width, height, offsetX, offsetY: 0 };
}

/**
 * 나무 스프라이트를 만든다.
 *
 * @param stage 손상 단계(0이 멀쩡).
 * @returns 스프라이트.
 */
function makeTree(stage: number): Sprite {
  const unit = TILE_HEIGHT;
  const width = unit * 1.6;
  const height = unit * 2.2;
  const surface = createSurface(width, height)!;
  const { ctx } = surface;

  const damage = stage / Math.max(1, DAMAGE_STAGES - 1);
  const baseX = width / 2;
  const baseY = height;
  const lean = damage * unit * 0.3;

  // 그림자.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
  ctx.beginPath();
  ctx.ellipse(baseX, baseY - 2, unit * 0.42, unit * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // 줄기. 아래가 굵고 위가 가늘다.
  const trunkTop = baseY - unit * 0.85;
  ctx.fillStyle = '#6b4a2b';
  ctx.beginPath();
  ctx.moveTo(baseX - unit * 0.13, baseY);
  ctx.lineTo(baseX - unit * 0.07 + lean, trunkTop);
  ctx.lineTo(baseX + unit * 0.07 + lean, trunkTop);
  ctx.lineTo(baseX + unit * 0.13, baseY);
  ctx.closePath();
  ctx.fill();

  // 줄기 밝은 면.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.moveTo(baseX - unit * 0.13, baseY);
  ctx.lineTo(baseX - unit * 0.07 + lean, trunkTop);
  ctx.lineTo(baseX - unit * 0.01 + lean, trunkTop);
  ctx.lineTo(baseX - unit * 0.05, baseY);
  ctx.closePath();
  ctx.fill();

  // 잎. 크기가 다른 덩어리 셋을 겹쳐 부피를 만든다.
  const canopyX = baseX + lean;
  const canopyY = trunkTop - unit * (0.42 - damage * 0.1);
  const radius = unit * (0.62 - damage * 0.2);

  const blobs = [
    { dx: -radius * 0.5, dy: radius * 0.18, r: radius * 0.72, color: '#2a5f30' },
    { dx: radius * 0.5, dy: radius * 0.12, r: radius * 0.7, color: '#2f6b34' },
    { dx: 0, dy: -radius * 0.3, r: radius * 0.85, color: '#38793c' },
  ];

  for (const blob of blobs) {
    ctx.fillStyle = blob.color;
    ctx.beginPath();
    ctx.arc(canopyX + blob.dx, canopyY + blob.dy, blob.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 위쪽 잎에 빛을 준다.
  ctx.fillStyle = 'rgba(180, 230, 150, 0.35)';
  ctx.beginPath();
  ctx.arc(canopyX - radius * 0.25, canopyY - radius * 0.5, radius * 0.36, 0, Math.PI * 2);
  ctx.fill();

  return { image: surface.canvas, width, height, offsetX: -width / 2, offsetY: -height };
}

/**
 * 광맥 스프라이트를 만든다.
 *
 * @param iron 철광석이면 true.
 * @param stage 손상 단계.
 * @returns 스프라이트.
 */
function makeOreVein(ore: OreKind, stage: number): Sprite {
  const unit = TILE_HEIGHT;
  const width = unit * 1.7;
  const height = unit * 1.3;
  const surface = createSurface(width, height)!;
  const { ctx } = surface;

  const damage = stage / Math.max(1, DAMAGE_STAGES - 1);
  const size = unit * (0.62 - damage * 0.18);
  const baseX = width / 2;
  const baseY = height - 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
  ctx.beginPath();
  ctx.ellipse(baseX, baseY, size * 0.95, size * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();

  // 바위 덩어리. 면을 나눠 칠해 각진 느낌을 준다.
  const facets = [
    { points: [[-1, 0], [-0.45, -0.95], [0.15, -0.75], [-0.2, 0]], color: '#7d828a' },
    { points: [[-0.2, 0], [0.15, -0.75], [0.55, -0.82], [0.35, 0]], color: '#6b7078' },
    { points: [[0.35, 0], [0.55, -0.82], [1, 0]], color: '#5c6068' },
  ];

  for (const facet of facets) {
    ctx.fillStyle = facet.color;
    ctx.beginPath();
    facet.points.forEach(([px, py], index) => {
      const x = baseX + px! * size;
      const y = baseY + py! * size;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }

  // 광석 알갱이.
  //
  // 상위 자원일수록 또렷하게 박아 멀리서도 알아보게 하고, 돌 광맥은 바위와 비슷한 회색을
  // 옅게만 넣는다. 처음에는 둘 다 밝은 알갱이로 그렸더니 돌 광맥이 눈덩이처럼 보였다.
  // 수정은 동굴에서 가장 귀한 것이라 가장 밝고 크게 둔다 — 예전에는 돌과 같은 모습이라
  // 어두운 동굴에서 무엇이 수정인지 알 수 없었다.
  const look = ORE_LOOK[ore];
  const oreColor = look.color;
  const glint = look.glint;

  ctx.globalAlpha = look.alpha;
  for (let i = 0; i < look.count; i += 1) {
    const px = baseX + (speckle(i, ore === 'stone' ? 22 : 21) - 0.5) * size * 1.25;
    const py = baseY - size * (0.18 + speckle(i, 23) * 0.6);
    const radius = size * (look.radius + speckle(i, 24) * look.spread);

    ctx.fillStyle = oreColor;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.arc(px - radius * 0.3, py - radius * 0.3, radius * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  return { image: surface.canvas, width, height, offsetX: -width / 2, offsetY: -height + 2 };
}

/** 건물 외형별 색과 높이(타일 높이 배수). */
const BUILDING_LOOK: Readonly<
  Record<
    BuildingStyle,
    { floor: string; floorDark: string; wallX: string; wallY: string; height: number; door: boolean }
  >
> = {
  house: { floor: '#a8776a', floorDark: '#96422f', wallX: '#d9c39a', wallY: '#b8a37e', height: 1.5, door: true },
  bigHouse: { floor: '#916b83', floorDark: '#743a56', wallX: '#dcc7a4', wallY: '#b9a482', height: 2, door: true },
  warehouse: { floor: '#79909b', floorDark: '#4c6673', wallX: '#c9b592', wallY: '#a89877', height: 1.6, door: true },
  well: { floor: '#6f8798', floorDark: '#615343', wallX: '#9aa0a6', wallY: '#7e848a', height: 0.8, door: false },
  workbench: { floor: '#9a8560', floorDark: '#6f5939', wallX: '#b39566', wallY: '#957b54', height: 0.7, door: false },
  forge: { floor: '#b8794f', floorDark: '#9c5330', wallX: '#6f6a68', wallY: '#575250', height: 1.3, door: true },
  quarry: { floor: '#8a929b', floorDark: '#666e77', wallX: '#9aa0a6', wallY: '#7e848a', height: 0.9, door: false },
  fence: { floor: '#8a6f47', floorDark: '#6f5939', wallX: '#a4835a', wallY: '#87694a', height: 0.5, door: false },
  watchtower: { floor: '#7c8d72', floorDark: '#55664c', wallX: '#c0ab86', wallY: '#9d8b6c', height: 2.4, door: true },
  beacon: { floor: '#a094d6', floorDark: '#9184cc', wallX: '#8d8698', wallY: '#6f6a7c', height: 2, door: false },
};

/**
 * 건물 스프라이트를 만든다.
 *
 * @param style 건물 종류.
 * @param width 가로 칸수.
 * @param depth 세로 칸수.
 * @returns 스프라이트.
 */
function makeBuilding(
  style: BuildingStyle,
  width: number,
  depth: number,
  variantId = 0,
): Sprite {
  const base = BUILDING_LOOK[style];
  const variant = lookById(variantId);
  // 외형은 바닥 색을 바꾼다. 지붕이 없어졌으므로 꾸밀 자리가 바닥으로 옮겨 왔다(ADR 0020).
  const floorColor = variant.roof ?? base.floor;
  const floorDark = variant.roofDark ?? base.floorDark;

  const halfW = (TILE_WIDTH / 2) * (width + depth) * 0.5;
  const halfH = (TILE_HEIGHT / 2) * (width + depth) * 0.5;
  // 벽만 남았으므로 예전 몸통 높이를 조금 낮춘다 — 안에 선 주민의 머리가 보여야 한다.
  const body = TILE_HEIGHT * Math.min(base.height, 0.8);
  const lip = body * 0.28;

  const spriteWidth = halfW * 2;
  const spriteHeight = halfH * 2 + body;
  const surface = createSurface(spriteWidth, spriteHeight)!;
  const { ctx } = surface;

  // 스프라이트 안에서 밑면 마름모의 중심.
  const cx = spriteWidth / 2;
  const cy = body + halfH;

  const north = { x: cx, y: cy - halfH };
  const east = { x: cx + halfW, y: cy };
  const south = { x: cx, y: cy + halfH };
  const west = { x: cx - halfW, y: cy };

  /** 네 점을 잇는 면을 채운다. */
  const quad = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    d: { x: number; y: number },
    color: string,
  ): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  };

  // 뒤쪽 벽 두 장. 카메라를 향하는 면(E-S, S-W)의 반대편이다.
  quad({ x: north.x, y: north.y - body }, { x: east.x, y: east.y - body }, east, north, base.wallX);
  paintPlanks(ctx, cx, cx + halfW, north.y - body, east.y - body, body, 'rgba(0, 0, 0, 0.09)');

  quad({ x: west.x, y: west.y - body }, { x: north.x, y: north.y - body }, north, west, base.wallY);
  paintPlanks(ctx, cx - halfW, cx, west.y - body, north.y - body, body, 'rgba(0, 0, 0, 0.13)');

  // 바닥. 벽 밑동을 덮으며 건물 안을 채운다.
  ctx.fillStyle = floorColor;
  ctx.beginPath();
  ctx.moveTo(north.x, north.y);
  ctx.lineTo(east.x, east.y);
  ctx.lineTo(south.x, south.y);
  ctx.lineTo(west.x, west.y);
  ctx.closePath();
  ctx.fill();

  // 바닥 결. 마름모를 따라 선을 그어 널을 깐 것처럼 보이게 한다.
  ctx.strokeStyle = floorDark;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const t = i / 5;
    ctx.beginPath();
    ctx.moveTo(cx - halfW * (1 - t), cy - halfH * t);
    ctx.lineTo(cx + halfW * t, cy - halfH * (1 - t));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 앞쪽 턱. 낮게 남겨 테두리는 알리되 안을 들여다볼 수 있게 한다.
  quad({ x: east.x, y: east.y - lip }, { x: south.x, y: south.y - lip }, south, east, base.wallX);
  quad({ x: south.x, y: south.y - lip }, { x: west.x, y: west.y - lip }, west, south, base.wallY);

  // 문턱. 앞쪽 모서리를 조금 비워 드나드는 자리를 보인다.
  if (base.door) {
    const doorWidth = Math.min(halfW * 0.34, TILE_WIDTH * 0.3);
    ctx.fillStyle = floorColor;
    ctx.beginPath();
    ctx.moveTo(south.x, south.y);
    ctx.lineTo(south.x + doorWidth, south.y - doorWidth / 2 - lip);
    ctx.lineTo(south.x + doorWidth, south.y - doorWidth / 2);
    ctx.closePath();
    ctx.fill();
  }

  paintBuildingDetails(ctx, style, cx, cy, halfW, halfH, body);

  // 테두리로 형태를 또렷하게 한다.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.moveTo(north.x, north.y - body);
  ctx.lineTo(east.x, east.y - body);
  ctx.lineTo(east.x, east.y);
  ctx.lineTo(south.x, south.y);
  ctx.lineTo(west.x, west.y);
  ctx.lineTo(west.x, west.y - body);
  ctx.closePath();
  ctx.stroke();

  return {
    image: surface.canvas,
    width: spriteWidth,
    height: spriteHeight,
    offsetX: -cx,
    offsetY: -cy,
  };
}

/**
 * 건물 종류를 그림만으로 알아보게 하는 구조·소품을 그린다.
 *
 * 지붕을 걷어낸 마을에서는 벽 색만으로 시설을 구분하기 어렵다. 각 소품은 바닥 안에
 * 머물러 주민과 겹치지 않고, 외부 에셋 없이도 역할을 읽히게 한다.
 *
 * @param ctx 스프라이트를 그릴 캔버스 컨텍스트.
 * @param style 건물 종류.
 * @param cx 바닥 중심 x.
 * @param cy 바닥 중심 y.
 * @param halfW 바닥 반폭.
 * @param halfH 바닥 반높이.
 * @param body 벽 높이.
 */
function paintBuildingDetails(
  ctx: CanvasRenderingContext2D,
  style: BuildingStyle,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  body: number,
): void {
  const unit = Math.max(4, Math.min(halfH, TILE_HEIGHT));

  switch (style) {
    case 'house':
    case 'bigHouse': {
      ctx.fillStyle = '#6ca8c7';
      const count = style === 'bigHouse' ? 3 : 2;
      for (let i = 0; i < count; i += 1) {
        ctx.fillRect(cx - halfW * 0.45 + i * unit * 1.25, cy - body * 0.58, unit * 0.56, unit * 0.42);
      }
      break;
    }
    case 'warehouse':
      ctx.fillStyle = '#8d5f36';
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(cx - unit * 1.25 + i * unit * 0.84, cy + halfH * 0.08 + (i % 2) * unit * 0.24, unit * 0.68, unit * 0.58);
      }
      break;
    case 'well':
      ctx.fillStyle = '#6f7883';
      ctx.beginPath();
      ctx.ellipse(cx, cy, unit * 1.05, unit * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4d9ac2';
      ctx.beginPath();
      ctx.ellipse(cx, cy - unit * 0.04, unit * 0.67, unit * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'workbench':
      ctx.fillStyle = '#704a2b';
      ctx.fillRect(cx - unit * 1.15, cy - unit * 0.22, unit * 2.3, unit * 0.36);
      ctx.strokeStyle = '#c8d0d6';
      ctx.lineWidth = Math.max(1, unit * 0.1);
      ctx.beginPath();
      ctx.moveTo(cx - unit * 0.35, cy - unit * 0.65);
      ctx.lineTo(cx + unit * 0.35, cy - unit * 0.05);
      ctx.stroke();
      break;
    case 'forge':
      ctx.fillStyle = '#303139';
      ctx.fillRect(cx - unit, cy - unit * 0.6, unit * 2, unit * 1.1);
      ctx.fillStyle = '#f0a14b';
      ctx.beginPath();
      ctx.arc(cx, cy - unit * 0.08, unit * 0.38, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'quarry':
      ctx.fillStyle = '#b5bbc0';
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(cx - unit + i * unit * 0.48, cy + ((i % 2) - 0.5) * unit * 0.5, unit * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'fence':
      ctx.strokeStyle = '#6f4e30';
      ctx.lineWidth = Math.max(1, unit * 0.14);
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + i * unit * 0.48, cy + unit * 0.34);
        ctx.lineTo(cx + i * unit * 0.48, cy - unit * 0.72);
        ctx.stroke();
      }
      break;
    case 'watchtower':
      ctx.strokeStyle = '#6f4e30';
      ctx.lineWidth = Math.max(1, unit * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx - unit * 0.8, cy + unit * 0.6);
      ctx.lineTo(cx + unit * 0.8, cy - body - unit * 0.1);
      ctx.stroke();
      ctx.fillStyle = '#c8524d';
      ctx.beginPath();
      ctx.moveTo(cx + unit * 0.78, cy - body - unit * 0.12);
      ctx.lineTo(cx + unit * 1.45, cy - body + unit * 0.1);
      ctx.lineTo(cx + unit * 0.78, cy - body + unit * 0.28);
      ctx.closePath();
      ctx.fill();
      break;
    case 'beacon':
      ctx.fillStyle = '#b9aaff';
      ctx.beginPath();
      ctx.moveTo(cx, cy - body - unit * 0.75);
      ctx.lineTo(cx + unit * 0.48, cy - body);
      ctx.lineTo(cx, cy - body + unit * 0.58);
      ctx.lineTo(cx - unit * 0.48, cy - body);
      ctx.closePath();
      ctx.fill();
      break;
  }
}

/**
 * 벽면에 판자 결을 그린다.
 *
 * @param ctx 컨텍스트.
 * @param leftX 왼쪽 x.
 * @param rightX 오른쪽 x.
 * @param leftTopY 왼쪽 위 y.
 * @param rightTopY 오른쪽 위 y.
 * @param bodyHeight 벽 높이.
 * @param color 선 색.
 */
function paintPlanks(
  ctx: CanvasRenderingContext2D,
  leftX: number,
  rightX: number,
  leftTopY: number,
  rightTopY: number,
  bodyHeight: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  for (let i = 1; i < 4; i += 1) {
    const offset = (bodyHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(leftX, leftTopY + offset);
    ctx.lineTo(rightX, rightTopY + offset);
    ctx.stroke();
  }
}

/**
 * 캐릭터 스프라이트를 만든다.
 *
 * @param hue 색상값. -1이면 플레이어 색을 쓴다.
 * @param stride 한 걸음 안의 진행도(0~1). 다리와 팔 포즈를 정한다.
 * @param facing 캐릭터가 바라보는 방향. 얼굴과 앞팔 위치를 정한다.
 * @returns 스프라이트.
 */
function makePawn(hue: number, stride: number, facing: ActorFacing): Sprite {
  const isBigger = hue < 0;
  // 플레이어는 주민보다 조금 크게 그린다. 화면에서 보니 겨냥 커서보다 작아
  // 어두운 동굴과 밤에는 자기 캐릭터를 찾기 어려웠다.
  const unit = TILE_HEIGHT * (isBigger ? 1.15 : 1);
  const width = unit * 0.9;
  const height = unit * 1.5;
  const surface = createSurface(width, height)!;
  const { ctx } = surface;

  const isPlayer = isBigger;
  const body = isPlayer ? '#4a86c8' : `hsl(${hue}, 45%, 62%)`;
  const bodyDark = isPlayer ? '#35699e' : `hsl(${hue}, 40%, 48%)`;
  const pants = isPlayer ? '#263c57' : `hsl(${hue}, 26%, 35%)`;
  const skin = isPlayer ? '#f0bd93' : `hsl(${hue}, 34%, 72%)`;
  const hair = isPlayer ? '#20303f' : `hsl(${hue}, 24%, 27%)`;

  const cx = width / 2;
  const feet = height - 2;

  // 그림자.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, feet, unit * 0.3, unit * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyWidth = unit * 0.44;
  const bodyHeight = unit * 0.72;
  const bob = Math.sin(stride * Math.PI) * unit * 0.075;
  const bodyBottom = feet - bob;
  const bodyTop = bodyBottom - bodyHeight;
  const step = Math.sin(stride * Math.PI * 2) * unit * 0.13;
  const faceOffset = facing === 'east' ? unit * 0.08 : facing === 'west' ? -unit * 0.08 : 0;

  // 다리. 발은 지면에 남기고 몸통만 한 걸음의 중간에 살짝 올라간다. 이 둘이 있어야
  // 위치만 바뀌는 미끄러짐이 아니라 실제로 발을 옮기는 모습으로 읽힌다.
  ctx.strokeStyle = pants;
  ctx.lineCap = 'round';
  ctx.lineWidth = unit * 0.12;
  ctx.beginPath();
  ctx.moveTo(cx - bodyWidth * 0.16, bodyBottom - unit * 0.05);
  ctx.lineTo(cx - bodyWidth * 0.18 - step, feet - unit * 0.03);
  ctx.moveTo(cx + bodyWidth * 0.16, bodyBottom - unit * 0.05);
  ctx.lineTo(cx + bodyWidth * 0.18 + step, feet - unit * 0.03);
  ctx.stroke();

  // 뒷팔. 몸통보다 먼저 그려야 팔이 등에 붙은 것처럼 보인다.
  ctx.strokeStyle = bodyDark;
  ctx.lineWidth = unit * 0.105;
  ctx.beginPath();
  ctx.moveTo(cx - bodyWidth * 0.46, bodyTop + bodyHeight * 0.32);
  ctx.lineTo(cx - bodyWidth * 0.56 + step * 0.45, bodyTop + bodyHeight * 0.72);
  ctx.stroke();

  // 몸통. 어깨가 둥근 형태로 그린다.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx - bodyWidth / 2, bodyBottom);
  ctx.lineTo(cx - bodyWidth / 2, bodyTop + bodyWidth * 0.3);
  ctx.quadraticCurveTo(cx - bodyWidth / 2, bodyTop, cx, bodyTop);
  ctx.quadraticCurveTo(cx + bodyWidth / 2, bodyTop, cx + bodyWidth / 2, bodyTop + bodyWidth * 0.3);
  ctx.lineTo(cx + bodyWidth / 2, bodyBottom);
  ctx.closePath();
  ctx.fill();

  // 오른쪽에 그늘을 넣어 부피를 준다.
  ctx.fillStyle = bodyDark;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(cx + bodyWidth * 0.12, bodyBottom);
  ctx.lineTo(cx + bodyWidth * 0.12, bodyTop + bodyWidth * 0.2);
  ctx.lineTo(cx + bodyWidth / 2, bodyTop + bodyWidth * 0.3);
  ctx.lineTo(cx + bodyWidth / 2, bodyBottom);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // 앞팔. 방향에 따라 눈에 더 보이는 쪽을 앞에 둬서 이동 방향을 읽게 한다.
  const armSide = facing === 'west' ? -1 : 1;
  ctx.strokeStyle = body;
  ctx.lineWidth = unit * 0.11;
  ctx.beginPath();
  ctx.moveTo(cx + armSide * bodyWidth * 0.44, bodyTop + bodyHeight * 0.3);
  ctx.lineTo(cx + armSide * (bodyWidth * 0.56 + step * 0.45), bodyTop + bodyHeight * 0.7);
  ctx.stroke();

  // 머리와 머리카락. 기존의 어두운 원 하나 대신 피부와 머리카락을 나눠 사람의 얼굴로 읽힌다.
  const headRadius = unit * 0.22;
  const headX = cx + faceOffset;
  const headY = bodyTop - headRadius * 0.75;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(headX, headY - headRadius * 0.26, headRadius * 0.9, Math.PI, Math.PI * 2);
  ctx.fill();

  // 얼굴의 밝은 점 하나로 앞을 알린다. 정면·북쪽은 가운데, 동서 방향은 바라보는 쪽으로 옮긴다.
  const eyeShift = facing === 'east' ? headRadius * 0.42 : facing === 'west' ? -headRadius * 0.42 : 0;
  ctx.fillStyle = '#2b3544';
  ctx.beginPath();
  ctx.arc(headX + eyeShift, headY - headRadius * 0.04, Math.max(0.8, unit * 0.035), 0, Math.PI * 2);
  ctx.fill();

  return { image: surface.canvas, width, height, offsetX: -cx, offsetY: -feet };
}
