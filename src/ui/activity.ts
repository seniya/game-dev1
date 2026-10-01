import { ACTION_LABELS, type NPC, type WorldState } from '../sim/types';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function activity(w: WorldState, n: NPC) {
  const a = n.currentAction;
  if (!n.alive || !a) return { label: n.alive ? '다음 행동을 생각하는 중' : '세상을 떠남', progress: 0, moving: false };
  const gathering = a.kind === 'Attend' ? w.gatherings?.items.find(g => g.id === a.targetId) : undefined;
  const targetId = gathering ? gathering.buildingId : a.targetId?.startsWith('industry:') ? a.targetId.slice(9) : a.targetId?.split(':')[0];
  const building = w.buildings.find(b=>b.id===targetId), resource = w.resources.find(r=>r.id===targetId);
  const project = a.kind === 'Work' && !!a.targetId?.includes(':') && !a.targetId.startsWith('industry:');
  const label = project ? '시설 개선' : a.kind === 'Work' ? '생산' : ['StoreItem','TakeItem'].includes(a.kind) ? '자원 운반' : ACTION_LABELS[a.kind];
  return { label, progress: Math.min(100, Math.floor((gathering?.progress ?? a.progress) / Math.max(1,a.duration) * 100)), workTicks: gathering?.progress ?? a.progress, moving: !!a.path.length, steps: a.path.length, building, resource, a };
}
export function activityView(w: WorldState, n: NPC) {
  const a = activity(w,n);
  const recent = w.events.filter(e=>(e.actorId===n.id || e.kind === 'gathering' && e.participants.includes(n.id)) && ['gathering','production','industry','consumption','storage','project','request'].includes(e.kind) && (e.kind !== 'gathering' || e.data.phase === 'completed') && (e.kind !== 'request' || e.data.phase === 'supported')).slice(-2).reverse();
  return `<div class="activity-card" data-reading-key="activity-${esc(n.id)}"><b>${esc(a.label)}${a.a ? a.moving ? ' · 목적지로 이동' : ' · 진행 중' : ''}</b>${a.a ? `<p>${a.moving ? `남은 길 ${a.steps}칸 · 도착 후 작업 시작` : `작업 ${a.workTicks}/${a.a.duration}틱 · ${a.progress}%`}</p><progress max="100" value="${a.moving ? 0 : a.progress}" aria-label="${esc(a.label)} 작업 진행"></progress>` : ''}
  ${a.building ? `<button class="text-button" data-place="${esc(a.building.id)}">${esc(a.building.name)} 살펴보기 ↗</button>` : a.resource ? `<button class="text-button" data-resource="${esc(a.resource.id)}">채집 장소 살펴보기 ↗</button>` : ''}
  ${['StoreItem','Share','Trade'].includes(n.currentAction?.kind ?? '') ? `<p>현재 소지 식량 ${n.inventory.food}개 · 목재 ${n.inventory.wood}개</p>` : ''}
  ${recent.map(e=>`<button class="activity-result" data-event="${esc(e.id)}">완료 기록 · ${esc(e.description)}</button>`).join('')}
  </div>`;
}
