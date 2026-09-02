import { beforeEach, describe, expect, it } from 'vitest';
import { BlueprintId, blueprintById } from '../src/core/blueprints';
import { ItemType } from '../src/core/items';
import { RequestKind, type VillageRequest } from '../src/core/requests';
import { BuildPanel } from '../src/ui/BuildPanel';
import { HelpPanel } from '../src/ui/HelpPanel';
import { RequestList } from '../src/ui/RequestList';
import { FakeElement, installFakeDocument } from './support/fakeDom';

/**
 * 마우스만으로 게임을 끝까지 할 수 있는지 지킨다.
 *
 * 키보드 쪽은 `test/InputRouter.test.ts`가 지킨다. 그 파일이 생기기 전에는 "숫자 키가
 * 셋뿐이라 넷째 설계도를 고를 수 없는" 결함이 테스트 700개를 통과한 채 남아 있었다.
 * 반대편에도 같은 일이 있었다 — **마우스만 쥔 사람은 무엇을 지을지 고를 수 없었다.**
 */
beforeEach(() => {
  installFakeDocument();
});

describe('건축 패널 클릭', () => {
  /** 패널과 목록을 준비한다. */
  function setup() {
    const root = new FakeElement();
    const panel = new BuildPanel(root as unknown as HTMLElement);
    const picked: BlueprintId[] = [];
    panel.setSelectHandler((id) => picked.push(id));

    const rows = [BlueprintId.COTTAGE, BlueprintId.WELL, BlueprintId.WORKBENCH].map(
      (id, index) => ({
        blueprint: blueprintById(id),
        missing: [],
        selected: index === 0,
      }),
    );

    panel.update(rows, true);

    return { root, panel, picked };
  }

  it('목록을 눌러 설계도를 고른다', () => {
    const { root, picked } = setup();
    const lines = root.findAll('panel__row');

    expect(lines).toHaveLength(3);
    lines[1]!.emit('click');

    expect(picked).toEqual([BlueprintId.WELL]);
  });

  it('아홉 번째를 넘는 설계도도 눌러서 고른다 — 숫자 키에는 상한이 있다', () => {
    const root = new FakeElement();
    const panel = new BuildPanel(root as unknown as HTMLElement);
    const picked: BlueprintId[] = [];
    panel.setSelectHandler((id) => picked.push(id));

    const many = [
      BlueprintId.COTTAGE,
      BlueprintId.WELL,
      BlueprintId.WORKBENCH,
      BlueprintId.WAREHOUSE,
      BlueprintId.MANOR,
      BlueprintId.FENCE,
      BlueprintId.WATCHTOWER,
      BlueprintId.QUARRY,
      BlueprintId.FORGE,
      BlueprintId.BEACON,
    ].map((id) => ({ blueprint: blueprintById(id), missing: [], selected: false }));

    panel.update(many, true);
    const lines = root.findAll('panel__row');
    lines[9]!.emit('click');

    expect(picked).toEqual([BlueprintId.BEACON]);
  });

  it('건축 모드가 아니면 목록이 없다', () => {
    const root = new FakeElement();
    const panel = new BuildPanel(root as unknown as HTMLElement);
    panel.update([], false);

    expect(root.findAll('panel__row')).toHaveLength(0);
  });
});

describe('요청 아이콘 클릭', () => {
  /** 납품 요청 하나와 시설 요청 하나를 담은 목록을 만든다. */
  function setup(payable: boolean) {
    const root = new FakeElement();
    const list = new RequestList(root as unknown as HTMLElement);
    const fulfilled: VillageRequest[] = [];
    list.setFulfillHandler((request) => fulfilled.push(request));

    const deliver: VillageRequest = {
      kind: RequestKind.DELIVER,
      id: 1,
      npcId: 1,
      item: ItemType.WOOD,
      amount: 4,
    };
    list.update([{ request: deliver, payable }]);

    return { root, fulfilled, deliver };
  }

  it('낼 수 있는 요청을 눌러 낸다', () => {
    const { root, fulfilled, deliver } = setup(true);
    const rows = root.findAll('request--clickable');

    expect(rows).toHaveLength(1);
    rows[0]!.emit('click');

    expect(fulfilled).toEqual([deliver]);
  });

  it('낼 수 없는 요청은 눌리지 않는다 — 눌러도 아무 일이 없으면 고장으로 보인다', () => {
    const { root } = setup(false);

    expect(root.findAll('request--clickable')).toHaveLength(0);
  });
});

describe('도움말 버튼', () => {
  it('버튼을 눌러 열고 닫는다 — 키보드를 모르는 사람에게는 이것이 유일한 길이다', () => {
    const root = new FakeElement();
    const help = new HelpPanel(root as unknown as HTMLElement);
    const button = root.findAll('help__button')[0]!;

    expect(help.visible).toBe(false);

    button.emit('click');
    expect(help.visible).toBe(true);
    expect(root.classList.contains('help--open')).toBe(true);

    button.emit('click');
    expect(help.visible).toBe(false);
  });

  it('버튼은 닫혀 있을 때도 보인다', () => {
    const root = new FakeElement();
    new HelpPanel(root as unknown as HTMLElement);

    expect(root.findAll('help__button')).toHaveLength(1);
  });
});
