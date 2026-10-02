import { conversationPromises } from '../sim/promises';
import { GATHERING_LABELS } from '../sim/gatherings-types';
import type { NPC, WorldState } from '../sim/types';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const date = (t: number) => `${Math.floor(t / 144) + 1}일 ${String(Math.floor(t % 144 / 6)).padStart(2, '0')}:${String(t % 6 * 10).padStart(2, '0')}`;
const statuses = { accepted: '참석 약속', declined: '거절', withdrawn: '참여 중단', attended: '함께 완료', missed: '미참여' };
export function gatheringsView(w: WorldState, n: NPC) {
  const name = (id: string) => esc(w.npcs.find(p => p.id === id)?.identity.name ?? id);
  const circles = (w.gatherings?.circles ?? []).filter(c => c.hostId === n.id);
  const items = (w.gatherings?.items ?? []).filter(g => g.hostId === n.id || g.invitations.some(i => i.npcId === n.id)).slice(-6).reverse();
  return `<details class="gatherings-panel" data-reading-key="gatherings-${esc(n.id)}"><summary>함께하는 약속 · ${items.filter(g => g.status === 'planned').length}건 예정</summary>
    <p class="inspector-footnote">초대 전달 경로·시간 조율·실제 참석 기록입니다. 급한 생활 필요로 참여를 중단할 수 있습니다.</p>
    ${circles.length ? `<section class="friendship-circles"><h4>반복해서 함께한 이웃</h4>${circles.map(c => `<p>${name(c.partnerId)} · ${GATHERING_LABELS[c.kind]} · 최근 공동 경험 ${c.meetings}회</p>${c.evidence.map(id => `<button class="evidence-link" data-event="${esc(id)}">함께한 근거</button>`).join('')}`).join('')}<p class="inspector-footnote">실제 공동 경험은 다음 초대 선호와 정기 모임 제안에 반영됩니다. 마지막 만남 3일 뒤부터 14일까지, 직접 만날 때 생활·자원·관계를 다시 확인합니다. 조건이 맞지 않으면 쉬어갑니다.</p></section>` : ''}
    ${items.length ? items.map(g => `<article class="gathering-card" data-reading-key="gathering-${esc(g.id)}"><b>${g.recurring ? '정기 모임 · ' : ''}${GATHERING_LABELS[g.kind]} · ${{ planned: '예정', completed: '완료', cancelled: '취소' }[g.status]}</b>
      <p>${esc(w.npcs.find(p => p.id === g.hostId)?.identity.name ?? g.hostId)}의 제안 · ${date(g.startsAt)}–${date(g.endsAt)}</p><p>${esc(g.reason)}</p>
      <button class="evidence-link" data-place="${esc(g.buildingId)}">${esc(w.buildings.find(b => b.id === g.buildingId)?.name ?? '약속 장소')} 지도에서 보기 ↗</button>
      <button class="evidence-link" data-event="${esc(g.sourceEventId)}">제안과 근거 ↗</button>
      ${g.schedule ? `<p>시간 조율: ${date(g.schedule.previousStart)}에서 ${date(g.startsAt)}로 변경</p><button class="evidence-link" data-event="${esc(g.schedule.requestEventId)}">조율 요청</button><button class="evidence-link" data-event="${esc(g.schedule.eventId)}">새 시간 제안</button>` : ''}
      <ul>${g.invitations.map(i => `<li>${esc(w.npcs.find(p => p.id === i.npcId)?.identity.name ?? i.npcId)} · ${statuses[i.status]}<p>${name(g.hostId)}${i.senderId && i.senderId !== g.hostId ? ` → ${name(i.senderId)}` : ''} → ${name(i.npcId)}</p><p>${esc(i.reason)}</p>${g.schedule ? i.scheduleEventId ? `<button class="evidence-link" data-event="${esc(i.scheduleEventId)}">변경 시간 전달</button><button class="evidence-link" data-event="${esc(i.scheduleResponseId!)}">새 시간 응답</button>` : '<p>새 시간 미전달 · 이전 약속만 알고 있음</p>' : ''}<button class="evidence-link" data-event="${esc(i.invitationEventId)}">직접 전달 ${date(i.deliveredAt)} ↗</button><button class="evidence-link" data-event="${esc(i.responseEventId)}">응답·결과 ↗</button></li>`).join('') || '<li>아직 직접 전달한 초대가 없습니다.</li>'}</ul>
      <p>함께 활동한 진행률 ${Math.round(g.progress / 6 * 100)}% · 활동 인원 ${g.attendance.length}명 · 실제 도착 ${g.arrivals.length}명</p>
      ${g.arrivals.map(a => `<button class="evidence-link" data-event="${esc(a.eventId)}">${esc(w.npcs.find(p => p.id === a.npcId)?.identity.name ?? a.npcId)} 도착 ${date(a.tick)} ↗</button>`).join('')}
      <button class="evidence-link" data-event="${esc(g.lastEventId)}">최근 기록과 이후 변화 ↗</button>
    </article>`).join('') : '<p>생활에 여유가 생기면 주민이 이웃에게 공동 활동을 제안합니다.</p>'}</details>`;
}

export function promisesView(w:WorldState,npcId:string) {
 const rows=conversationPromises(w,npcId);
 return `<section class="conversation-promises"><h3>대화 이후의 약속</h3><p>제안·수락·실제 활동을 구분합니다. 생활 조건 때문에 중단될 수 있습니다. 이전 약속은 주민의 ‘이어지는 일’에서 찾을 수 있습니다.</p>${rows.map(p=>`<article data-reading-key="promise-${esc(p.id)}"><b>${esc(p.title)} · ${esc(p.status)}</b><p>${esc(p.detail)}</p><button class="evidence-link" data-event="${esc(p.conversation)}">처음 나눈 대화</button><button class="evidence-link" data-event="${esc(p.latest)}">최근 결과와 이유</button><button class="text-button" data-biography="${esc(npcId)}" data-mode="threads" data-root="${esc(p.source)}">약속의 전체 경과</button></article>`).join('')||'<p>최근에 대화에서 제안한 약속이 없습니다.</p>'}</section>`;
}
