import { PLAN_LABELS } from '../sim/cognition';
import { GOAL_LABELS, type NPC, type WorldState } from '../sim/types';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const time = (tick: number) => `${String(Math.floor(tick / 6)).padStart(2, '0')}:${String(tick % 6 * 10).padStart(2, '0')}`;
export function dailyPlanView(w: WorldState, n: NPC) {
  const p = n.cognition?.plan;
  if (!p) return '<p class="inspector-footnote">다음 행동을 정할 때 하루 계획이 만들어집니다.</p>';
  const currentDay = Math.floor(w.tick / 144) === p.day;
  return `<details class="daily-plan" data-reading-key="daily-plan-${esc(n.id)}"><summary>${currentDay && n.alive ? '오늘의 계획' : '마지막 하루 계획'} · ${p.day + 1}일째</summary>
    <p>${esc(p.reason)}</p>${p.focus ? `<p>마음에 둔 일 · ${GOAL_LABELS[p.focus]}</p>` : ''}
    <ol class="plan-blocks">${p.blocks.map(b => `<li ${currentDay && n.alive && w.tick % 144 >= b.start && w.tick % 144 < b.end ? 'aria-current="step"' : ''}><span>${time(b.start)}–${time(b.end)}</span><b>${PLAN_LABELS[b.intent]}</b></li>`).join('')}</ol>
    <p class="inspector-footnote">상황에 따라 바뀌는 생활 계획 · 조정 ${p.revision - 1}회</p>
    ${p.evidence.map(id => `<button class="evidence-link" data-event="${esc(id)}">계획의 근거 ${esc(id)} ↗</button>`).join('')}</details>`;
}
export function cognitionMemoryView(n: NPC) {
  const c = n.cognition;
  return `<div class="section-label spaced">경험에서 얻은 생각 <span>${c?.reflections.length ?? 0}</span></div>
    ${c?.reflections.length ? [...c.reflections].reverse().map(r => `<article class="reflection-card" data-reading-key="reflection-${esc(r.eventId)}"><span class="memory-date">${Math.floor(r.tick / 144) + 1}일째 · 경험을 정리한 성찰</span><p>${esc(r.text)}</p><button class="evidence-link" data-event="${esc(r.eventId)}">성찰 기록 ↗</button>${r.evidence.map(id => `<button class="evidence-link" data-event="${esc(id)}">근거 ${esc(id)} ↗</button>`).join('')}</article>`).join('') : '<p class="inspector-footnote">의미 있는 경험이 반복되면 근거를 연결한 성찰이 남습니다.</p>'}
    <details class="memory-retrieval" data-reading-key="memory-retrieval-${esc(n.id)}"><summary>최근 판단에서 꺼낸 기억 · ${c?.retrieval?.items.length ?? 0}건</summary>
    <p class="inspector-footnote">최근성 + 중요도 + 상황 관련성으로 고른 기억입니다. 경험 정리와 하루 계획은 시뮬레이션 규칙으로 만들어집니다.</p>
    ${c?.retrieval?.items.map(h => `<button class="memory-card" data-event="${esc(h.eventId)}"><b>${esc(n.memories.find(m => m.sourceEventId === h.eventId)?.description ?? '지난 판단에서 참고한 사건')}</b><span class="memory-date">점수 ${h.score.toFixed(2)} · 최근성 ${h.recency.toFixed(2)} / 중요도 ${h.importance.toFixed(2)} / 관련성 ${h.relevance.toFixed(2)}</span></button>`).join('') ?? ''}</details>`;
}
