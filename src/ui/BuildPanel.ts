import type { Blueprint } from '../core/blueprints';
import { itemLabel, type ItemType } from '../core/items';

/** 패널에 표시할 블루프린트 한 줄. */
export interface BlueprintRow {
  /** 블루프린트. */
  blueprint: Blueprint;
  /** 부족한 자재. 비어 있으면 지을 수 있다. */
  missing: ReadonlyArray<{ item: ItemType; short: number }>;
  /** 지금 고른 것인지. */
  selected: boolean;
}

/**
 * 건축 모드의 블루프린트 목록 패널.
 *
 * 기획서 7절이 "보유 자재 대비 부족분 빨간색 표시"를 요구하므로, 부족한 자재만
 * 빨간색으로 강조한다. 패널은 건축 모드가 아닐 때 숨긴다.
 *
 * DOM 갱신은 표시 내용이 실제로 바뀌었을 때만 한다 — 매 프레임 문자열을 만들어
 * 넣으면 레이아웃 비용이 그대로 프레임에 실린다.
 */
export class BuildPanel {
  private readonly root: HTMLElement;
  /** 마지막으로 그린 내용의 요약. 같으면 DOM을 건드리지 않는다. */
  private lastSignature = '';

  /**
   * @param root 패널 컨테이너.
   */
  constructor(root: HTMLElement) {
    this.root = root;
    this.root.hidden = true;
  }

  /**
   * 패널을 갱신한다.
   *
   * @param rows 표시할 블루프린트 목록.
   * @param visible 패널을 보일지 여부.
   */
  update(rows: readonly BlueprintRow[], visible: boolean): void {
    const signature = `${visible ? 1 : 0}|${rows
      .map(
        (row) =>
          `${row.blueprint.id}:${row.selected ? 1 : 0}:${row.missing
            .map((entry) => `${entry.item}${entry.short}`)
            .join(',')}`,
      )
      .join('|')}`;

    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.root.hidden = !visible;
    if (!visible) return;

    this.root.textContent = '';

    const title = document.createElement('div');
    title.className = 'panel__title';
    title.textContent = '건축 (B: 닫기)';
    this.root.appendChild(title);

    // 자재는 **고른 설계도만** 펼친다. 아홉 종이 모두 자재까지 늘어놓으면 패널이
    // 화면 오른쪽 절반을 덮었다 — 화면에서 보고 줄인 것이다(로드맵 04 Phase 3).

    for (const [index, row] of rows.entries()) {
      this.root.appendChild(this.renderRow(row, index));
    }

    const hint = document.createElement('div');
    hint.className = 'panel__hint';
    hint.textContent = '[ ]: 넘기기 · Space: 배치';
    this.root.appendChild(hint);
  }

  /**
   * 블루프린트 한 줄을 만든다.
   *
   * @param row 표시 정보.
   * @param index 목록에서의 위치. 선택 단축키 번호로 쓴다.
   * @returns 만든 엘리먼트.
   */
  private renderRow(row: BlueprintRow, index: number): HTMLElement {
    const element = document.createElement('div');
    element.className = 'panel__row';
    if (row.selected) element.classList.add('panel__row--selected');

    const name = document.createElement('span');
    name.className = 'panel__name';
    // 자재가 모자란 설계도는 이름 옆에 표시만 남긴다. 무엇이 모자란지는 고르면 보인다.
    const short = row.missing.length > 0 && !row.selected ? ' ·' : '';
    name.textContent =
      `${index + 1}. ${row.blueprint.label} ${row.blueprint.width}×${row.blueprint.depth}${short}`;
    if (row.missing.length > 0) name.classList.add('panel__name--short');
    element.appendChild(name);

    if (!row.selected) return element;

    for (const requirement of row.blueprint.materials) {
      const short = row.missing.find((entry) => entry.item === requirement.item);

      const material = document.createElement('span');
      material.className = 'panel__material';
      if (short) material.classList.add('panel__material--short');
      material.textContent = short
        ? `${itemLabel(requirement.item)} ${requirement.amount} (-${short.short})`
        : `${itemLabel(requirement.item)} ${requirement.amount}`;
      element.appendChild(material);
    }

    return element;
  }
}
