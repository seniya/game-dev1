import { familyObservation, FAMILY_KINDS, type FamilyVisit } from '../sim/family-observation';
import { INDUSTRY_LABELS } from '../sim/urban-types';
import { familyDashboard } from './family-dashboard';
import { AMBITION_LABELS, AMBITION_HINTS } from '../sim/ambition';
import { dynastyStats, descendants, deedsFromEvents, successorIds, succeed, type Dynasty, type DynastyView } from '../sim/dynasty';
import type { WorldState } from '../sim/types';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const num = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const deedText = (d: NonNullable<DynastyView['deeds']>) => `나눔 ${num(d.shares)}회 · 교육 ${num(d.teaching)}회 · 시설 개선 ${num(d.improvements)}회 · 건설 노동 ${num(d.labor)}회`;
export function dynastyView(v: DynastyView, owner: boolean): string {
  const d = v.dynasty, stats = v.stats, a = v.active;
  const rootPicker = `<form id="dynasty-found"><label>내가 만든 주민의 가문<select name="root" required>${v.roots.map(r => `<option value="${esc(r.id)}" ${r.id === d?.root ? 'selected' : ''}>${esc(r.name)}${r.alive ? '' : ' · 생애 종료'}</option>`).join('')}</select></label><button class="button" type="submit">이 가문 이어보기</button></form>`;
  const intro = `<div id="dynasty-panel" data-epoch="${esc(v.epoch)}"><div class="eyebrow">A LIFE, A LEGACY</div><h2>내 아바타가 남긴 삶</h2><p>자손은 어디까지 이어지고, 어떤 재산과 변화를 남길까요?</p>${v.roots.length ? rootPicker : '<div class="empty-state"><p>나만의 아바타로 가문의 첫 장을 시작하세요.</p><button class="button dark" data-dynasty-create>첫 아바타 만들기</button></div>'}`;
  if (!d || !stats || !a) return intro + '<p class="muted">내가 만든 주민을 시조로 선택하면 가문·부·영향력을 따로 기록합니다. 가족 형성과 상속은 세계의 실제 규칙을 따릅니다.</p><p id="dynasty-status" role="status"></p></div>';
  const focus = a.life.ambition ?? 'balanced', totalDeeds = Object.values(v.deeds!).reduce((sum, n) => sum + n, 0);
  const milestone = (value: number, steps: number[], label: string) => {
    const next = steps.find(n => n > value);
    return next ? `<p class="dynasty-next">다음 목표 · ${label} ${num(next)}<progress max="${next}" value="${Math.max(0, value)}" aria-label="${label} 목표 진행"></progress><span>${num(value)} / ${num(next)}</span></p>` : '<p class="dynasty-next">모든 기본 목표를 달성했습니다. 계속 기록을 이어가세요.</p>';
  };
  const rows = stats.members.slice(0, 60);
  return intro + `<section class="dynasty-avatar"><div><span class="eyebrow">${d.chain.length}번째 아바타</span><h3>${esc(a.identity.name)} · ${a.identity.age}세</h3><p>${a.alive ? '지금 살아가는 중' : '삶을 마치고 남긴 기록'} · ${stats.children}명의 자녀</p></div><button class="button" data-my-npc="${esc(a.id)}">지도에서 관찰</button><button class="button" data-biography="${esc(a.id)}">삶의 이야기</button></section>
  <div class="dynasty-metrics"><section><span class="eyebrow">가문</span><h3>${num(stats.livingDescendants)} <small>생존 후손</small></h3><p>전체 후손 ${num(stats.descendants)}명<br>${stats.generations}세대 · 현재 ${stats.villages}개 마을</p>${milestone(stats.livingDescendants, [1, 3, 10, 30], '생존 후손')}</section><section><span class="eyebrow">부</span><h3>${num(stats.coins)} <small>코인</small></h3><p>생존 가문원의 현재 코인<br>주택 소유 지분 합계 ${num(stats.homeShares)}채</p>${milestone(stats.coins, [100, 300, 1000, 3000], '가문 코인')}</section><section><span class="eyebrow">영향</span><h3>${num(totalDeeds)} <small>번의 기여</small></h3><p>${deedText(v.deeds!).split(' · ').join('<br>')}</p>${milestone(totalDeeds, [1, 10, 50, 200], '실제 기여')}</section></div>
  <p class="muted">지표는 현재 세계의 실제 기록입니다. 가문에는 시조와 그 후손을 한 번씩 포함하며 배우자는 후손이 아닌 경우 합산하지 않습니다. 코인은 시작 자산·상속을 포함하고, 주택은 공동 소유 비율로 계산합니다.</p>
  <p class="dynasty-outlook"><b>가문의 다음 장</b><br>${esc(stats.outlook)}</p>
  <section class="dynasty-life"><h3>${esc(a.identity.name)}${a.alive ? '의 현재 기록' : '이 남긴 일생'}</h3><p>자녀 ${stats.children}명 · 현재 코인 ${num(stats.activeCoins)}${v.estateCoins != null ? ` · 사망 시 전달한 유산 ${num(v.estateCoins)}코인` : ''}</p><p>${deedText(v.activeDeeds!)}</p><p class="muted">${v.openingCoins != null ? `시작 코인 ${num(v.openingCoins)}${a.alive ? ` · 현재까지 코인 증감 ${num(stats.activeCoins - v.openingCoins)}` : ''}. 상속·지출·자산 이전이 포함되므로 평생 소득과 다릅니다.` : '시작 자산의 원본 기록이 없어 코인 증감을 계산하지 않습니다.'}</p></section>
  ${a.alive ? `<section><h3>삶의 우선순위</h3><p>${AMBITION_LABELS[focus]} · ${AMBITION_HINTS[focus]}</p>${owner ? `<form id="dynasty-ambition"><label>새 우선순위<select name="focus">${Object.entries(AMBITION_LABELS).map(([id, label]) => `<option value="${id}" ${id === focus ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="button" type="submit">우선순위 저장</button></form>` : '<p class="muted">입주 후 삶의 우선순위 변경은 세계 소유자의 개입 권한입니다.</p>'}<p class="muted">먹고 쉬어야 할 때는 생존을 먼저 돌봅니다. 가족 우선순위는 만남을 늘리는 바람이며 출산을 보장하지 않습니다.</p></section>` : `<section class="dynasty-succession"><h3>다음 세대로 이어가기</h3>${v.successors?.length ? `<p>살아 있는 후손을 골라 다음 아바타로 관찰하세요. 어린 후손의 성장부터 이어볼 수도 있습니다.</p><form id="dynasty-succeed"><label>후계자<select name="npc">${v.successors.map(id => { const n = stats.members.find(n => n.id === id)!; return `<option value="${esc(id)}">${esc(n.name)} · ${n.age}세 · ${n.generation}세대</option>`; }).join('')}</select></label><button class="button dark" type="submit">이 후손으로 이어가기</button></form><p class="muted">재산은 사망 시 이미 분배되었습니다. 후계자 선택은 추가 재산이나 직접 조종 권한을 부여하지 않습니다.</p>` : '<p>현재 아바타에게 살아 있는 후손이 없어 이 계승은 끝났습니다. 기록은 남으며, 위에서 다른 시조의 가문을 시작할 수 있습니다.</p>'}</section>`}
  ${familyDashboard(v,owner)}
  <h3>이어온 아바타</h3><p>${d.chain.map(c => `<button class="text-button" data-my-npc="${esc(c.npc)}">${esc(stats.members.find(n => n.id === c.npc)?.name ?? c.npc)}</button>`).join(' → ')}</p>
  <details><summary>가문 구성원 ${stats.members.length}명</summary><div class="dynasty-family">${rows.map(n => `<button class="button" data-my-npc="${esc(n.id)}">${esc(n.name)} · ${n.generation}세대 · ${n.age}세 · ${esc(n.village)}${n.alive ? '' : ' · 생애 종료'}</button>`).join('')}</div>${stats.members.length > rows.length ? '<p class="muted">앞의 60명을 표시합니다. 전체 수치는 모든 가문원을 포함합니다.</p>' : ''}</details>
  <h3>이번 아바타의 실제 사건</h3><div class="dynasty-history">${v.history?.length ? v.history.map(e => `<button class="causal-button" data-event="${esc(e.id)}">${esc(e.description)}</button>`).join('') : '<p>아직 기록이 없습니다. 세계를 재생하면 실제 만남과 기여가 쌓입니다.</p>'}</div><button class="button" data-dynasty-refresh>최신 기록 보기</button><p class="muted">${Math.floor(v.tick / 144) + 1}일째 조회 · 자동으로 스크롤을 움직이지 않습니다.</p><p id="dynasty-status" role="status"></p></div>`;
}
export function localDynasty(w: WorldState, epoch: string, input?: { type: 'found'; root: string } | { type: 'succeed'; root: string; npc: string; revision: number }): DynastyView {
  const key = `living-dynasty:${epoch}`;
  let saved: { selected?: string; families: Record<string, Dynasty> } = { families: {} };
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); if (value?.families) saved = value; } catch {}
  const roots = w.npcs.filter(n => n.profile).map(n => ({ id: n.id, name: n.identity.name, alive: n.alive }));
  if (input) {
    if (!roots.some(n => n.id === input.root)) throw new Error('자신이 만든 시조 주민을 확인해 주세요.');
    if (input.type === 'found') saved.families[input.root] ??= { root: input.root, active: input.root, revision: 0, chain: [{ npc: input.root, tick: w.tick }] };
    else { const d = saved.families[input.root]; if (!d || d.revision !== input.revision) throw new Error('계승 상태를 다시 확인해 주세요.'); saved.families[input.root] = succeed(w, d, input.npc); }
    saved.selected = input.root; localStorage.setItem(key, JSON.stringify(saved));
    return {epoch,tick:w.tick,roots,dynasty:saved.families[input.root]};
  }
  const d = saved.selected ? saved.families[saved.selected] : undefined;
  const a = d ? w.npcs.find(n => n.id === d.active) : undefined;
  if (!d || !a || !roots.some(n => n.id === d.root)) return { epoch, tick: w.tick, roots, dynasty: null };
  const arrival = w.events.find(e => e.id === a.profile?.arrivalEventId), estate = w.events.find(e => e.kind === 'inheritance' && e.actorId === a.id && Array.isArray(e.data.heirs));
  const family=familyObservation(w,d.root),visitKey=`${key}:visit:${d.root}`;
  let previous:FamilyVisit|null=null;try{previous=JSON.parse(localStorage.getItem(visitKey)??'null');}catch{}
  if(previous&&(previous.tick>w.tick||previous.through>w.events.length))previous=null;
  const ids=new Set(family.people.map(n=>n.id));
  const changes=w.events.slice(previous?.through??0).filter(e=>FAMILY_KINDS.includes(e.kind)&&e.participants.some(id=>ids.has(id))).reverse();
  localStorage.setItem(visitKey,JSON.stringify({tick:w.tick,through:w.events.length,coins:family.coins}));
  return { family,changes:{since:previous?.tick??null,coinDelta:previous?family.coins-previous.coins:null,events:changes.slice(0,24),more:changes.length>24},availableBusinesses:w.urban.enterprises.filter(e=>!e.business&&e.settlementId===a.settlementId).map(e=>({id:e.id,label:INDUSTRY_LABELS[e.kind]})),epoch, tick: w.tick, roots, dynasty: d, stats: dynastyStats(w, d.root, d.active), active: { id: a.id, identity: a.identity, life: a.life, alive: a.alive }, deeds: deedsFromEvents(w.events, new Set(descendants(w, d.root).keys())), activeDeeds: deedsFromEvents(w.events, new Set([a.id])), successors: successorIds(w, d), openingCoins: typeof arrival?.data.coins === 'number' ? arrival.data.coins : a.life.parentIds.length ? 0 : null, estateCoins: typeof estate?.data.coins === 'number' ? estate.data.coins : null, history: w.events.filter(e => e.participants.includes(a.id) && (['birth','family','death','inheritance','share','education','project','migration'].includes(e.kind) || e.kind === 'construction' && e.data.phase === 'worked')).slice(-12).reverse() };
}
