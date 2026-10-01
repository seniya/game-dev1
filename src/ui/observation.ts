import type { WorldState } from '../sim/types';
import { stocks } from '../sim/civilization';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function observationView(w: WorldState) {
  const v = w.civilization.settlements.find(v => v.id === w.civilization.focus)!;
  const pairs = new Set(w.npcs.flatMap(n => n.relationships.filter(r => r.familiarity >= 10).map(r => [n.id, r.npcId].sort().join(':'))));
  const tasks = [
    { title: '서로 돕는 마을', value: w.stats.shares, target: 3, unit: '번', hint: '식량을 나눈 주민을 따라가 관계의 변화를 살펴보세요.', kind: 'share' },
    { title: '이름을 아는 이웃', value: pairs.size, target: 3, unit: '쌍', hint: '친밀도 10 이상인 관계를 찾아보세요. 관계는 시간이 지나며 달라집니다.', kind: 'talk' },
    { title: '우리 손으로 차린 식탁', value: w.economy.totals.producedFood, target: 24, unit: '개', hint: '채집과 농사로 식량을 생산해 보세요. 외부 식량 투입은 세지 않습니다.', kind: 'production' },
  ];
  const stock = stocks(w, v.id);
  return `<div class="observation-heading"><div><span class="eyebrow">SMALL VILLAGE STORIES</span><h3>오늘은 어떤 이야기를 만나볼까요?</h3><p>전체 세계의 실제 기록과 현재 관계로 확인하는 관찰 과제 · ${tasks.filter(t => t.value >= t.target).length}/3 충족</p></div><button class="button" data-small-world>12명의 넓은 마을로 시작</button></div>
  <div class="observation-tasks">${tasks.map(t => {
    const event = [...w.events].reverse().find(e => e.kind === t.kind);
    return `<article class="observation-task ${t.value >= t.target ? 'complete' : ''}"><div><b>${t.title}</b><span>${t.value >= t.target ? '✓ 충족' : '관찰 중'}</span></div><p>${t.hint}</p><progress aria-label="${t.title}" value="${Math.min(t.value,t.target)}" max="${t.target}"></progress><footer><span>${t.value} / ${t.target}${t.unit}</span>${event ? `<button class="text-button" data-event="${esc(event.id)}">최근 장면 보기 ↗</button>` : '<span class="muted">아직 해당 장면이 없습니다</span>'}</footer></article>`;
  }).join('')}</div>
  <div class="village-projects"><div><b>${esc(v.name)}에 남기는 작은 변화</b><p>공동 목재 ${stock.wood}개 · 집은 4명의 주거 공간, 농장은 시간이 지나며 자라나는 식량 생산지입니다.</p></div><div><button class="button" data-build="home" ${stock.wood < 12 ? 'disabled' : ''}>새집 짓기 · 목재 12</button><button class="button" data-build="farm" ${stock.wood < 16 ? 'disabled' : ''}>농장 짓기 · 목재 16</button></div></div>
  <div><button class="button" id="build-position">위치를 골라 건설하기</button><button class="button" id="land-market">주택 부지 거래</button></div><p class="observation-footnote">건설은 공동 재고를 사용하고 기록에 남습니다. 새로 시작하면 현재 세계는 교체 전 백업에 보관됩니다.</p>`;
}
