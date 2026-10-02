import type { ReturnChange } from '../sim/observation';
import { storyEvent } from './story-event';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function returnChanges(changes:ReturnChange[]) {
  return `<section class="return-changes"><h3>지난 방문 이후 달라진 일</h3><p>계기부터 기록된 후속 경과까지. 주제별 최근 두 변화이며, 계기는 선택 기간 이전 기록일 수 있습니다.</p>${changes.map(c=>`<section><h4>${esc(c.label)}</h4>${c.events.map(e=>{
    const thread=c.threads?.find(t=>t.eventId===e.id);
    const pending=['proposed','started','assigned','worked','accepted','arrived'].includes(String(e.data.phase));
    return `<article class="change-thread" data-reading-key="change-${esc(e.id)}">${thread?.cause?`<details><summary>계기가 된 일</summary>${storyEvent(thread.cause)}</details>`:'<p class="thread-empty">별도 계기 기록 없음</p>'}<div class="thread-change"><span class="thread-step">달라진 일</span>${storyEvent(e)}</div>${thread?.outcome?`<div class="thread-outcome"><span class="thread-step">이어진 기록</span>${storyEvent(thread.outcome)}</div>`:`<p class="thread-empty">${pending?'이 기록에서는 진행 중입니다.':'변화가 기록되었습니다.'} 조회 시점까지 연결된 후속 사건은 없습니다.</p>`}</article>`;
  }).join('')||'<p class="muted">이 기간에 기록된 주요 변화가 없습니다.</p>'}</section>`).join('')}</section>`;
}
