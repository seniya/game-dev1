/**
 * 블록 타입과 속성.
 *
 * MVP 자원은 목재/돌/철광석 3종(기획서 8절)이며, 이 중 지형에서 나오는 것은
 * 돌과 철광석이다. 흙은 자원이 아니라 지형을 다시 메우고 평탄화하는 재료다.
 */

/**
 * 블록 타입. 숫자 값을 그대로 `Uint8Array`에 담으므로 값이 바뀌면
 * 저장된 지형 해석이 달라진다 — 값을 재배치하지 말고 뒤에 추가한다.
 */
export const BlockType = {
  /** 블록 없음. 지형 배열에서 표면 위쪽 칸을 뜻한다. */
  EMPTY: 0,
  /** 흙. 지표면을 이루며 되메우기·평탄화 재료로 쓰인다. */
  DIRT: 1,
  /** 돌. 흙 아래 층. 채굴 자원. */
  STONE: 2,
  /** 철광석. 최하층에 광맥 형태로 섞인다. 채굴 자원. */
  IRON_ORE: 3,
} as const;

/** 블록 타입 값. */
export type BlockType = (typeof BlockType)[keyof typeof BlockType];

/** 블록 한 종류의 속성. */
export interface BlockInfo {
  /** UI에 표시할 이름. */
  readonly label: string;
  /** 윗면 색. */
  readonly topColor: string;
  /** +x 방향(화면 오른쪽-아래) 측면 색. 두 측면에 다른 명도를 줘 입체감을 만든다. */
  readonly sideColorX: string;
  /** +y 방향(화면 왼쪽-아래) 측면 색. 그늘진 쪽이라 더 어둡다. */
  readonly sideColorY: string;
  /** 파서 손에 넣을 수 있는지. 최하층 아래(빈칸)는 파지지 않는다. */
  readonly diggable: boolean;
  /** 지형에 다시 놓을 수 있는지. 기획서 5.1의 "흙/돌 블록"만 허용한다. */
  readonly placeable: boolean;
}

/** 블록 타입별 속성 표. */
export const BLOCK_INFO: Readonly<Record<BlockType, BlockInfo>> = {
  [BlockType.EMPTY]: {
    label: '빈칸',
    topColor: 'transparent',
    sideColorX: 'transparent',
    sideColorY: 'transparent',
    diggable: false,
    placeable: false,
  },
  [BlockType.DIRT]: {
    label: '흙',
    topColor: '#4a7a41',
    sideColorX: '#7a5636',
    sideColorY: '#5c4028',
    diggable: true,
    placeable: true,
  },
  [BlockType.STONE]: {
    label: '돌',
    topColor: '#8b8f96',
    sideColorX: '#6e727a',
    sideColorY: '#53575e',
    diggable: true,
    placeable: true,
  },
  [BlockType.IRON_ORE]: {
    label: '철광석',
    topColor: '#a98a72',
    sideColorX: '#8a6a52',
    sideColorY: '#69503d',
    diggable: true,
    placeable: false,
  },
};

/**
 * 블록 속성을 가져온다.
 *
 * @param type 블록 타입.
 * @returns 해당 타입의 속성.
 */
export function blockInfo(type: BlockType): BlockInfo {
  return BLOCK_INFO[type];
}

/**
 * 지형에 놓을 수 있는 블록인지 확인한다.
 *
 * @param type 블록 타입.
 * @returns 놓을 수 있으면 true.
 */
export function isPlaceable(type: BlockType): boolean {
  return BLOCK_INFO[type].placeable;
}
