import type { WorldState } from '../sim/types';
import { activeRequest, requestOptions, requestReason } from '../sim/requests';
import { REQUEST_LABELS, type ResidentRequest, type RequestMetrics } from '../sim/requests-types';
import { stocks } from '../sim/civilization';
import { dayOf, timeLabel } from '../sim/random';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const statuses: Record<ResidentRequest['status'], string> = { open:'결정을 기다려요', deferred:'잠시 미뤄 둔 부탁', observing:'생활의 변화를 관찰 중', completed:'관찰을 마쳤어요', declined:'이번에는 지원하지 않았어요', expired:'기한이 지난 부탁', resolved:'주민이 스스로 해결했어요', cancelled:'생애·거주 상황이 바뀌었어요' };
function measurements(r: ResidentRequest) {
  const fields: [keyof RequestMetrics, string][] = r.kind === 'food' ? [['food','소지 식량'],['hunger','배고픔 ↓']] : r.kind === 'clothing' ? [['clothing','옷 상태'],['warmth','온기']] : [['condition','집 내구도'],['capacity','집 정원']];
  fields.push(['trust','마을 신뢰']);
  return `<div class="request-table-wrap"><table class="request-table"><caption>선택 전과 이후의 실제 수치 · 배고픔은 낮을수록 좋습니다</caption><thead><tr><th scope="col">관찰 항목</th><th scope="col">선택 전</th><th scope="col">지원 직후</th><th scope="col">${r.status === 'completed' ? '2시간 뒤' : '관찰 결과'}</th></tr></thead><tbody>${fields.map(([k,l]) => `<tr><th scope="row">${l}</th><td>${Math.round(r.before[k])}</td><td>${r.immediate ? Math.round(r.immediate[k]) : '—'}</td><td>${r.after ? Math.round(r.after[k]) : '관찰 중'}</td></tr>`).join('')}</tbody></table></div>`;
}
function card(w: WorldState, r: ResidentRequest, busy: boolean) {
  const n = w.npcs.find(n => n.id === r.npcId)!, v = w.civilization.settlements.find(v => v.id === r.settlementId)!;
  const s = stocks(w, v.id), c = w.urban.cities.find(c => c.settlementId === v.id)!;
  const open = r.status === 'open', options = open ? requestOptions(w, r) : [];
  return `<article class="request-card" data-reading-key="${esc(r.id)}" data-request-card="${esc(r.id)}" data-status="${r.status}">
    <div class="request-card-heading"><div><span class="request-status">${statuses[r.status]}</span><h3>${REQUEST_LABELS[r.kind]}</h3><p><button class="text-button" data-npc="${esc(n.id)}">${esc(n.identity.name)} 살펴보기 ↗</button> · ${esc(v.name)} · ${dayOf(r.createdAt)}일 ${timeLabel(r.createdAt)}</p></div><button class="text-button" data-event="${esc(r.sourceEventId)}">발생 기록</button></div>
    ${open ? `<p class="request-reason">${esc(requestReason(w, r))}</p><p class="request-stock">이 마을의 공동 재고 · 식량 ${s.food} · 목재 ${s.wood} · 옷 ${c.goods.clothes} · 직물 ${c.goods.cloth}</p>
    <div class="request-options">${options.slice(0,2).map(o => `<div class="request-option"><button class="button" data-request="${esc(r.id)}" data-choice="${o.choice}" ${busy || o.disabled ? 'disabled' : ''}>${o.label}<strong>${o.cost}</strong></button><p>${o.effect}</p>${o.disabled ? `<span class="request-unavailable">${o.disabled}</span>` : ''}</div>`).join('')}</div>
    <div class="request-secondary">${options.slice(2).map(o => `<button class="text-button" data-request="${esc(r.id)}" data-choice="${o.choice}" title="${o.effect}" ${busy || o.disabled ? 'disabled' : ''}>${o.label}${o.disabled ? ' · 이미 미룸' : ''}</button>`).join('')}<span>미루기·거절은 자원을 쓰지 않습니다.</span></div>`
    : r.status === 'deferred' ? `<p>게임 ${dayOf(r.deferredUntil!)}일 ${timeLabel(r.deferredUntil!)}에 다시 보여 드립니다. 재생하면 시간이 흐릅니다.</p>`
    : `<p>${r.choice && r.choice !== 'decline' ? `선택: ${requestOptions(w,r).find(o => o.choice === r.choice)?.label} · ${requestOptions(w,r).find(o => o.choice === r.choice)?.cost}` : statuses[r.status]}</p>${r.immediate ? measurements(r) : ''}
      ${r.status === 'observing' ? `<button class="button" data-observe-request ${busy ? 'disabled' : ''}>게임 2시간 관찰하고 멈추기</button>` : ''}
      ${r.immediate ? '<p class="request-note">지원 직후에는 선택의 직접 효과를, 이후에는 주민의 활동과 날씨가 함께 반영된 상태를 보여 줍니다.</p>' : ''}
      ${r.resultEventId ? `<button class="text-button" data-event="${esc(r.resultEventId)}">결과와 이어진 기록 보기 ↗</button>` : ''}`}</article>`;
}
export function requestsView(w: WorldState, busy = false, playing = false) {
  const active = w.requests.items.filter(activeRequest), closed = w.requests.items.filter(r => !activeRequest(r)).reverse();
  const latest = closed[0];
  return `<div class="requests-heading"><div><span class="eyebrow">주민과 함께 만드는 이야기</span><h2>주민의 부탁 <span>${active.length}/2</span></h2><p>어려움을 발견하고, 도움을 선택하고, 달라진 생활을 지켜보세요.</p></div><div class="request-heading-actions"><span class="request-limit">새 부탁은 게임 하루 최대 2건</span>${playing ? `<button class="button" data-request-pause ${busy ? 'disabled' : ''}>부탁 읽으며 잠시 멈추기</button>` : '<span class="request-status">시간이 멈춰 있어요 · 천천히 선택하세요</span>'}</div></div>
    <ol class="request-steps" aria-label="부탁 진행 순서"><li>1. 주민의 사정 읽기</li><li>2. 비용을 보고 선택</li><li>3. 생활의 변화 확인</li></ol>
    <div class="request-active">${active.length ? active.map(r => card(w,r,busy)).join('') : '<p class="request-empty">지금 기다리는 부탁이 없습니다. 재생하면 식량·옷·집에 어려움이 있는 주민이 찾아옵니다. 부탁이 없어도 마을의 생활은 이어집니다.</p>'}</div>
    ${latest ? `<details class="request-results" id="request-latest" open><summary>최근 결과 · ${esc(w.npcs.find(n => n.id === latest.npcId)!.identity.name)} · ${statuses[latest.status]}</summary>${card(w, latest, busy)}</details>` : ''}
    ${closed.length > 1 ? `<details class="request-results" id="request-archive"><summary>이전 부탁 ${closed.length - 1}건</summary>${closed.slice(1).map(r => card(w,r,busy)).join('')}</details>` : ''}
    <p class="request-note">부탁은 게임 3일 동안 기다립니다. 같은 주민의 같은 부탁은 최소 3일 간격이며, 지난 기록은 세계의 기록에서도 볼 수 있습니다.</p>`;
}

export function requestPrompt(w: WorldState) {
  const r = w.requests.items.find(r => r.status === 'open') ?? w.requests.items.find(activeRequest) ?? w.requests.items.at(-1);
  const text = r ? `${w.npcs.find(n => n.id === r.npcId)!.identity.name} · ${r.status === 'open' ? REQUEST_LABELS[r.kind] : statuses[r.status]}` : '시간이 흐르면 도움이 필요한 주민의 사정을 만날 수 있어요.';
  return `<div><b>주민의 부탁</b><span>${esc(text)}</span></div><button class="button">부탁과 결과 살펴보기 ↓</button>`;
}
