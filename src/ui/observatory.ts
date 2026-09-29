import type { WorldState, WorldEvent, DailySample, NPC } from '../sim/types';
import { dayOf, timeLabel } from '../sim/random';
import { balance } from '../sim/economy';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const stamp = (e: WorldEvent) => `${dayOf(e.tick)}일 ${timeLabel(e.tick)}`;
export function knowledge(e: WorldEvent) { return e.kind === 'rumor' ? '전해 들은 소문' : ['memory', 'llm', 'goal', 'relationship'].includes(e.kind) ? '개인의 기억·해석' : e.kind === 'witness' ? '직접 목격' : '관찰된 사실'; }
export function eventLink(e: WorldEvent) { return `<button class="causal-button" data-event="${esc(e.id)}"><span><small>${stamp(e)} · ${knowledge(e)}</small><br>${esc(e.description)}</span><span aria-hidden="true">→</span></button>`; }
export function timeline(w: WorldState, e: WorldEvent) {
  const byId = new Map(w.events.map(e => [e.id, e])), ancestors: WorldEvent[] = [];
  let parent = e.causeId ? byId.get(e.causeId) : undefined;
  while (parent && ancestors.length < 40) { ancestors.unshift(parent); parent = parent.causeId ? byId.get(parent.causeId) : undefined; }
  const evidence = Array.isArray(e.data.evidence) ? e.data.evidence.map(id => byId.get(id)).filter((e): e is WorldEvent => !!e) : [];
  const effects = w.events.filter(child => child.causeId === e.id || (Array.isArray(child.data.evidence) && child.data.evidence.includes(e.id)));
  return `<div class="causal-timeline"><h3>원인에서 이후 선택까지</h3>${ancestors.map(eventLink).join('')}<div class="timeline-current">${stamp(e)} · ${knowledge(e)}<br><b>${esc(e.description)}</b></div>${evidence.length ? `<h3>이 선택에 영향을 준 경험</h3>${evidence.map(eventLink).join('')}` : ''}${effects.slice(0, 60).map(eventLink).join('')}${effects.length > 60 ? `<p>직접 이어진 기록 ${effects.length}건 중 60건입니다. 세계의 기록에서 사건 ID로 검색할 수 있습니다.</p>` : ''}</div>`;
}
export function lifeHistory(w: WorldState, n: NPC, limit: number) {
  const events = w.events.filter(e => (e.actorId === n.id || e.targetId === n.id || e.participants.includes(n.id)) && !['arrival', 'memory', 'failure'].includes(e.kind));
  const debt = w.loans.filter(l => l.borrowerId === n.id && l.status !== 'repaid');
  return `<div class="section-label">삶의 기록 <span>${events.length}건</span></div><p class="inspector-footnote">현재 재산 ${n.wealth}코인 · 식량 ${n.inventory.food}개<br>갚을 식량 ${debt.reduce((s, l) => s + l.remaining, 0)}개 · 연체 ${debt.filter(l => l.status === 'defaulted').length}건</p>${events.length ? events.slice(-limit).reverse().map(eventLink).join('') : '<p class="empty-state">첫 선택을 기다리고 있습니다.</p>'}${events.length > limit ? '<button class="more-button" id="more-life">이전 생애 기록 더 보기</button>' : ''}`;
}
const metrics: Record<string, { title: string; keys: (keyof DailySample)[]; labels: string[]; unit: string }> = {
  food: { title: '식량의 흐름', keys: ['food', 'storageFood', 'producedFood', 'consumedFood'], labels: ['총 식량', '공동 창고', '하루 생산', '하루 소비'], unit: '개' },
  price: { title: '가격과 거래', keys: ['foodPrice', 'tradeVolume', 'wages'], labels: ['식량 가격', '거래 수량', '지급 임금'], unit: '코인 / 개' },
  wealth: { title: '살아 있는 주민의 재산', keys: ['poorest', 'median', 'richest'], labels: ['최저', '중앙값', '최고'], unit: '코인' },
  society: { title: '인구와 이웃', keys: ['population', 'shares', 'conflicts'], labels: ['생존 인구', '하루 도움', '하루 갈등'], unit: '명 / 건' },
};
export function economyView(w: WorldState, metric = 'food') {
  const m = metrics[metric] ?? metrics.food, samples = w.economy.daily.slice(-90), colors = ['#537d61', '#b57b40', '#6588ab', '#be7272'];
  const max = Math.max(1, ...samples.flatMap(d => m.keys.map(k => Number(d[k]))));
  const x = (i: number) => 45 + i / Math.max(1, samples.length - 1) * 665, y = (v: number) => 190 - v / max * 155;
  const chart = samples.length ? `<svg class="history-chart" viewBox="0 0 750 225" role="img" aria-label="${m.title} · 최근 ${samples.length}개 일별 표본, 아래 표에서 정확한 수치와 근거를 확인할 수 있습니다."><text x="8" y="35">${max.toFixed(0)}</text><text x="20" y="193">0</text><path d="M40 30V195H720" stroke="#d9e1cf" fill="none"/>${m.keys.map((k, j) => `<polyline points="${samples.map((d, i) => `${x(i)},${y(Number(d[k]))}`).join(' ')}" fill="none" stroke="${colors[j]}" stroke-width="2"/>${samples.map((d, i) => `<circle cx="${x(i)}" cy="${y(Number(d[k]))}" r="3" fill="${colors[j]}"><title>${d.day}일 · ${m.labels[j]} ${d[k]}</title></circle>`).join('')}`).join('')}<text x="45" y="218">${samples[0].day}일</text><text x="670" y="218">${samples.at(-1)!.day}일</text></svg>` : '<div class="empty-state">첫날이 끝나면 실제 관측값을 그립니다.<br>관찰 실험실에서 하루를 진행해 볼 수 있습니다.</div>';
  const b = balance(w), totals = w.economy.totals;
  return `<div class="panel-heading"><h2>숫자로 읽는 마을</h2><span class="muted">실제 하루 단위 관측 · 최근 90일</span></div><div class="economy-content"><div class="economy-cards"><div>식량 가격<strong>${w.market.foodPrice} <small>코인</small></strong></div><div>시장 기금<strong>${w.market.coins} <small>코인</small></strong></div><div>누적 거래<strong>${totals.trades} <small>건</small></strong></div><div>남은 대여금<strong>${w.loans.reduce((s, l) => s + l.remaining, 0)} <small>식량</small></strong></div></div><div class="metric-tabs">${Object.entries(metrics).map(([key, item]) => `<button data-metric="${key}" aria-pressed="${metric === key}" class="${metric === key ? 'active' : ''}">${item.title}</button>`).join('')}</div><p class="chart-caption">${m.title} · ${m.unit}. 날짜가 끝난 뒤 관측하며 첫 표본은 회계 시작일부터의 부분 일수입니다.</p>${chart}<div class="chart-legend">${m.labels.map((label, i) => `<span><i style="background:${colors[i]}"></i>${label}</span>`).join('')}</div>${samples.length ? `<div class="sample-table"><table><caption>최근 관측값과 가격 산정 근거</caption><thead><tr><th>날짜</th>${m.labels.map(label => `<th>${label}</th>`).join('')}<th>근거</th></tr></thead><tbody>${samples.slice(-14).reverse().map(d => `<tr><th>${d.day}일</th>${m.keys.map(k => `<td>${d[k]}</td>`).join('')}<td><button class="text-button" data-event="${esc(d.eventId)}">사건 보기</button></td></tr>`).join('')}</tbody></table></div>` : ''}<details class="accounting-details"><summary>생산·소비·투자 회계 확인</summary><p>${dayOf(w.economy.since)}일 ${timeLabel(w.economy.since)}부터 기록. 식량 생산 ${totals.producedFood} / 소비 ${totals.consumedFood} / 외부 투입 ${totals.externalFood}. 목재 생산 ${totals.producedWood} / 시설 투자 ${totals.investedWood}. 지급 임금 ${totals.wages}코인.</p><p>보존 오차: 식량 ${b.food} · 목재 ${b.wood} · 돈 ${b.coins}. 채집·수확을 생산으로 계산하며 미수확 자원과 작물은 소유 재고에 포함하지 않습니다. 사망 주민의 소지품도 세계 총량에 남습니다.</p></details><button class="button" id="export-observations">전체 일별 관측 JSON 내보내기</button></div>`;
}
