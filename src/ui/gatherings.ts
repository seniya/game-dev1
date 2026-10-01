import { GATHERING_LABELS } from '../sim/gatherings-types';
import type { NPC, WorldState } from '../sim/types';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const date = (t: number) => `${Math.floor(t / 144) + 1}일 ${String(Math.floor(t % 144 / 6)).padStart(2, '0')}:${String(t % 6 * 10).padStart(2, '0')}`;
const statuses = { accepted: '참석 약속', declined: '거절', withdrawn: '참여 중단', attended: '함께 완료', missed: '미참여' };
export function gatheringsView(w: WorldState, n: NPC) {
  const items = (w.gatherings?.items ?? []).filter(g => g.hostId === n.id || g.invitations.some(i => i.npcId === n.id)).slice(-6).reverse();
  return `<details class="gatherings-panel" data-reading-key="gatherings-${esc(n.id)}"><summary>함께하는 약속 · ${items.filter(g => g.status === 'planned').length}건 예정</summary>
    <p class="inspector-footnote">직접 전한 초대와 실제 참석 기록입니다. 급한 생활 필요로 참여를 중단할 수 있습니다.</p>
    ${items.length ? items.map(g => `<article class="gathering-card" data-reading-key="gathering-${esc(g.id)}"><b>${GATHERING_LABELS[g.kind]} · ${{ planned: '예정', completed: '완료', cancelled: '취소' }[g.status]}</b>
      <p>${esc(w.npcs.find(p => p.id === g.hostId)?.identity.name ?? g.hostId)}의 제안 · ${date(g.startsAt)}–${date(g.endsAt)}</p><p>${esc(g.reason)}</p>
      <button class="evidence-link" data-place="${esc(g.buildingId)}">${esc(w.buildings.find(b => b.id === g.buildingId)?.name ?? '약속 장소')} 지도에서 보기 ↗</button>
      <button class="evidence-link" data-event="${esc(g.sourceEventId)}">제안과 근거 ↗</button>
      <ul>${g.invitations.map(i => `<li>${esc(w.npcs.find(p => p.id === i.npcId)?.identity.name ?? i.npcId)} · ${statuses[i.status]}<p>${esc(i.reason)}</p><button class="evidence-link" data-event="${esc(i.invitationEventId)}">직접 전달 ${date(i.deliveredAt)} ↗</button><button class="evidence-link" data-event="${esc(i.responseEventId)}">응답·결과 ↗</button></li>`).join('') || '<li>아직 직접 전달한 초대가 없습니다.</li>'}</ul>
      <p>함께 활동한 진행률 ${Math.round(g.progress / 6 * 100)}% · 활동 인원 ${g.attendance.length}명 · 실제 도착 ${g.arrivals.length}명</p>
      ${g.arrivals.map(a => `<button class="evidence-link" data-event="${esc(a.eventId)}">${esc(w.npcs.find(p => p.id === a.npcId)?.identity.name ?? a.npcId)} 도착 ${date(a.tick)} ↗</button>`).join('')}
      <button class="evidence-link" data-event="${esc(g.lastEventId)}">최근 기록과 이후 변화 ↗</button>
    </article>`).join('') : '<p>생활에 여유가 생기면 주민이 이웃에게 공동 활동을 제안합니다.</p>'}</details>`;
}
