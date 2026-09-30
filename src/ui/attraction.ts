import { attraction, charmPoints, signed } from '../sim/attraction';
import type { NPC, WorldState } from '../sim/types';
import { occupationLabel } from '../sim/employment';
import type { Personality } from '../sim/types';
import type { LivingPerson } from '../sim/living-types';

export function charmPreview(p: Personality, t: LivingPerson['traits']) {
  return charmPoints(p, t).map(c => `<span class="charm-point">${c.label} <b>${Math.round(c.strength)}</b></span>`).join('');
}
export function attractionProfile(w: WorldState, n: NPC) {
  const l = w.living.people[n.id];
  return `<section class="attraction-profile"><div class="section-label">성격에서 드러나는 매력</div><div class="charm-points">${charmPreview(n.personality, l.traits)}</div>
    <p>${occupationLabel(w, n)} · ${n.identity.age}세 · 건강 ${Math.round(n.needs.health)}<br>코인 ${n.wealth} · 식량 ${n.inventory.food} · 목재 ${n.inventory.wood}</p>
    <p class="muted">가장 두드러지는 성격 3가지입니다. 상대의 성격에 따라 느끼는 매력이 달라집니다. 직업·나이·건강·외모 취향·자산도 대화 상대 선택과 만남 뒤의 애정에 영향을 줍니다.</p></section>`;
}
export function attractionRelation(w: WorldState, n: NPC, targetId: string) {
  const target = w.npcs.find(p => p.id === targetId);
  if (!target || !n.alive || !target.alive) return '';
  const a = attraction(w, n, target), b = attraction(w, target, n);
  return `<details class="attraction-details" data-detail-key="impression-${n.id}-${target.id}"><summary>서로 느끼는 인상 · 나 ${signed(a.value)} / 상대 ${signed(b.value)}</summary>
    <p class="muted">현재 상태로 계산한 대인 호감입니다. 아래 ‘나 → 상대’ 점수는 내가 상대에게 느끼는 인상입니다. 실제 관계 수치는 만남과 사건이 생길 때 바뀝니다.</p>
    <div class="attraction-table-wrap"><table class="attraction-table"><thead><tr><th>영향</th><th>나 → 상대</th><th>상대 → 나</th></tr></thead><tbody>${a.factors.map((f, i) => `<tr><th>${f.label}</th><td>${signed(f.value)}</td><td>${signed(b.factors[i].value)}</td></tr>`).join('')}</tbody></table></div>
    <p><b>내가 느끼는 이유</b><br>${a.factors.map(f => `${f.label}: ${f.reason}`).join('<br>')}</p>
    <p>다음 대화의 기본 변화: 내 애정 ${signed(a.changes.affection)} · 상대 애정 ${signed(b.changes.affection)}<br>내 신뢰 ${signed(a.changes.trust)} · 상대 신뢰 ${signed(b.changes.trust)}</p>
    <p class="muted">애정은 우정·가족을 포함한 일반 호감입니다. 신뢰는 배려·인내·공격성·탐욕에 따른 대화 태도로 변합니다. 외모는 스타일 취향과 청결을 반영하며 피부색·머리색은 점수에 쓰지 않습니다. 자산 영향은 코인과 소지 식량·목재로 계산하며 최대 +2입니다.</p></details>`;
}
