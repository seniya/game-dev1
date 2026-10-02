import type { WorldState, NPC } from '../sim/types';
import { OCCUPATIONS } from '../sim/types';
import { STAGE_LABELS, occupationStage } from '../sim/development';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function villageLifeView(w:WorldState) {
  const d=w.villageLife?.settlements[w.civilization.focus];if(!d)return '';
  const people=w.npcs.filter(n=>n.alive&&n.settlementId===w.civilization.focus),roles=new Map<string,number>();
  for(const n of people.filter(n=>n.identity.age>=18&&n.identity.age<65))roles.set(n.occupation,(roles.get(n.occupation)??0)+1);
  const rolesText=[...roles].map(([job,count])=>`${job==='farmer'&&d.stage===0?'먹거리 담당':job==='gatherer'&&d.stage===0?'채집 담당':OCCUPATIONS[job as keyof typeof OCCUPATIONS]} ${count}명`).join(' · ');
  return `<section class="family-card village-life-overview" aria-label="마을 생활의 성장"><div class="section-label">${STAGE_LABELS[d.stage]} · 함께 나누는 생활</div><p>${esc(rolesText)}</p><p>${esc(d.reason)}</p><p class="muted">먹기 · 마시기 · 잠자기 · 먹거리 마련 · 집 돌보기 · 쉬고 어울리기</p><p>오늘 식량 생산 ${d.todayProduced}개 / 소비 ${d.todayConsumed}개 · 아이 ${people.filter(n=>n.identity.age<18).length}명 · 회복 중 ${w.villageLife!.injuries.filter(i=>people.some(n=>n.id===i.npc)).length}명</p><details><summary>앞으로 생길 수 있는 역할과 조건</summary><p>인구와 수요가 2일 이상 이어지고 먹거리·재료·일손·임금이 확보되면 전담 역할이 생깁니다.</p>${STAGE_LABELS.map((label,i)=>`<p><b>${label}</b> · ${[0,20,40,80,150][i]}명부터 검토<br>${Object.entries(OCCUPATIONS).filter(([job])=>occupationStage(job as keyof typeof OCCUPATIONS)===i).map(([job,name])=>`${name}${d.unlocked.includes(job)?' ✓':''}`).join(' · ')}</p>`).join('')}</details></section>`;
}
export function careHistoryView(w:WorldState,n:NPC) {
  if(!w.villageLife)return '';
  const injury=w.villageLife.injuries.find(i=>i.npc===n.id),p=w.villageLife.people[n.id];
  return `<div class="family-card village-life-person"><div class="section-label">놀이와 서로 돌보는 삶</div><p>${n.identity.age<4?'가족의 돌봄 속에서 자랍니다.':n.identity.age<7?'어른과 가까운 마당에서 놀고 함께 돌아옵니다.':n.identity.age<18?'낮에는 안전한 마을에서 친구를 만나고 배웁니다.':'생활과 일 사이에 이웃을 만나고 서로 돌봅니다.'}</p>${injury?`<p>${injury.severity==='minor'?'가벼운 상처':'치료와 휴식이 필요한 부상'} · 회복 부담 ${Math.ceil(injury.remaining)}<br>${injury.caregiver?`${esc(w.npcs.find(p=>p.id===injury.caregiver)?.identity.name??'이웃')}의 돌봄을 받았습니다.`:'도움과 휴식이 필요합니다.'}</p><button class="evidence-link" data-event="${esc(injury.source)}">다친 원인</button><button class="evidence-link" data-event="${esc(injury.latest)}">돌봄의 경과</button>`:''}${p?.firstOuting?`<button class="evidence-link" data-event="${esc(p.firstOuting)}">첫 바깥놀이</button>`:''}${p?.lastPlay?`<button class="evidence-link" data-event="${esc(p.lastPlay)}">최근 놀이</button>`:''}${p?.helpSource?`<button class="evidence-link" data-event="${esc(p.helpSource)}">귀가와 회복 기록</button>`:''}</div>`;
}
