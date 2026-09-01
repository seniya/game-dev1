import { RequestKind, requestLabel, type VillageRequest } from '../core/requests';
import { itemColor } from '../core/items';

/** 요청 한 건의 표시 정보. */
export interface RequestRow {
  /** 요청. */
  request: VillageRequest;
  /** 지금 낼 수 있는지. 납품 요청에서만 의미가 있다. */
  payable: boolean;
}

/**
 * 화면 상단의 미완료 요청 목록.
 *
 * 기획서 7절의 "미완료 NPC 요청 아이콘 리스트"다. 아이콘 이미지가 없는 단계이므로
 * 색 점 + 짧은 문구로 대신한다. 낼 수 있는 납품 요청은 강조해 다음 행동을 알려준다.
 */
export class RequestList {
  private readonly root: HTMLElement;
  /** 마지막으로 그린 내용 요약. 같으면 DOM을 건드리지 않는다. */
  private lastSignature = '';

  /**
   * @param root 목록 컨테이너.
   */
  constructor(root: HTMLElement) {
    this.root = root;
  }

  /**
   * 목록을 갱신한다.
   *
   * @param rows 표시할 요청 목록.
   */
  update(rows: readonly RequestRow[]): void {
    const signature = rows
      .map((row) => `${row.request.id}:${requestLabel(row.request)}:${row.payable ? 1 : 0}`)
      .join('|');

    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.root.textContent = '';
    this.root.hidden = rows.length === 0;
    if (rows.length === 0) return;

    for (const row of rows) {
      this.root.appendChild(this.renderRow(row));
    }
  }

  /**
   * 요청 한 줄을 만든다.
   *
   * @param row 표시 정보.
   * @returns 만든 엘리먼트.
   */
  private renderRow(row: RequestRow): HTMLElement {
    const element = document.createElement('span');
    element.className = 'request';
    if (row.payable) element.classList.add('request--payable');

    const dot = document.createElement('span');
    dot.className = 'request__dot';
    dot.style.background =
      row.request.kind === RequestKind.DELIVER ? itemColor(row.request.item) : '#7aa7d8';
    element.appendChild(dot);

    const text = document.createElement('span');
    text.textContent = requestLabel(row.request);
    element.appendChild(text);

    if (row.payable) {
      const hint = document.createElement('span');
      hint.className = 'request__hint';
      hint.textContent = 'R';
      element.appendChild(hint);
    }

    return element;
  }
}
