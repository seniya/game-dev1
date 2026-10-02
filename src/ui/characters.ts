import { AMBITION_LABELS } from '../sim/ambition';
import { characterVisual, type CharacterVisual } from './character-state';
import { charmPreview } from './attraction';
import { occupationLabel } from '../sim/employment';
import { TRAIT_LABELS, DESIRE_LABELS, BODY_LABELS, HOMES } from '../sim/living-types';
import type { NPC, WorldState } from '../sim/types';
import { GOAL_LABELS, OCCUPATIONS } from '../sim/types';
import { availableHomes } from '../sim/characters';
import { type Appearance, type CharacterInput, characterSchema, creationBudgets, CREATION_DEFAULTS, NPC_CREATION_LIMIT } from '../sim/character-schema';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
import { appearance } from '../sim/appearance';
export { appearance } from '../sim/appearance';
export const HAIRSTYLES = {short:'짧은 머리',long:'긴 머리',curly:'곱슬머리',bald:'민머리',bob:'단발',ponytail:'포니테일',bun:'올림머리',braid:'땋은 머리',spiky:'삐죽 머리'};
export const ACCESSORIES = {none:'없음',glasses:'안경',hat:'모자',scarf:'목도리',earrings:'귀걸이',flower:'꽃 장식',headphones:'헤드폰'};
export const CLOTHING = {plain:'기본 상의',stripes:'줄무늬',overalls:'멜빵',vest:'조끼',dress:'원피스'};
export const LOOK_PRESETS: Record<string,{label:string;appearance:Partial<Appearance>}> = {
  garden:{label:'정원의 이웃',appearance:{outfit:'#769b72',accent:'#edc96d',hairstyle:'braid',accessory:'flower',clothing:'overalls',backdrop:'meadow'}},
  sunset:{label:'노을 산책',appearance:{outfit:'#bd796b',accent:'#f0d1a0',hairstyle:'bob',accessory:'scarf',clothing:'stripes',backdrop:'sunset'}},
  starlight:{label:'별빛 음악가',appearance:{outfit:'#767eb1',accent:'#cfb7e6',hairstyle:'spiky',accessory:'headphones',clothing:'vest',backdrop:'night'}},
};
export function portrait(a: Appearance, state?: CharacterVisual) {
  const resting = state?.sleeping || state?.tired || state?.key === 'departed';
  const accent=a.accent ?? '#eed5a0', bg=a.backdrop==='night'?'#323f60':a.backdrop==='sunset'?'#f2d4b9':'#e4ecda';
  const long=['long','braid','ponytail'].includes(a.hairstyle);
  return `<svg viewBox="0 0 80 88" role="img" aria-label="캐릭터 외모${state ? ` · ${state.label}` : ''}" data-state="${state?.key ?? 'preview'}" class="character-portrait"><rect x="1" y="1" width="78" height="86" rx="18" fill="${bg}"/>
  <circle cx="64" cy="16" r="8" fill="${a.backdrop==='night'?'#f5e6bb':'#fff5d4'}"/><path d="M3 72Q23 48 43 68Q64 53 77 69V76Q77 87 66 87H14Q3 87 3 76" fill="${a.backdrop==='night'?'#4f6077':'#b1c2a3'}"/>
  ${a.backdrop==='night'?'<path d="M16 12v6m-3-3h6M59 37v4m-2-2h4" stroke="#e6dfc5"/>':''}
  ${long || a.hairstyle==='bob' ? `<rect x="19" y="17" width="42" height="${a.hairstyle==='bob'?32:47}" rx="16" fill="${a.hair}"/>` : ''}
  ${a.hairstyle==='ponytail'?`<path d="M55 20Q76 24 62 62L57 57Q63 33 51 28" fill="${a.hair}"/>`:''}
  ${a.hairstyle==='bun'?`<circle cx="40" cy="12" r="10" fill="${a.hair}"/><path d="M31 17h18" stroke="${accent}" stroke-width="3"/>`:''}
  <path d="M16 84V64Q16 51 40 51Q64 51 64 64V84" fill="${a.outfit}"/>
  ${a.clothing==='stripes'?[62,70,78].map(y=>`<path d="M18 ${y}h44" stroke="${accent}" stroke-width="3"/>`).join(''):a.clothing==='overalls'?`<path d="M28 53v17h24V53M26 67h28v17H26" fill="${accent}"/><circle cx="30" cy="67" r="2" fill="${a.outfit}"/><circle cx="50" cy="67" r="2" fill="${a.outfit}"/>`:a.clothing==='vest'?`<path d="M27 53L37 66V84H19V65ZM53 53L43 66V84H61V65Z" fill="${accent}"/>`:a.clothing==='dress'?`<path d="M32 52h16L59 84H21Z" fill="${accent}"/><path d="M27 67h26" stroke="${a.outfit}" stroke-width="4"/>`:''}
  <path d="M34 50v5q6 8 12 0v-5" fill="${a.skin}"/><circle cx="40" cy="33" r="18" fill="${a.skin}"/>
  ${a.hairstyle === 'bald' ? '' : a.hairstyle==='spiky'?`<path d="M21 30L18 16L28 19L31 7L40 16L50 6L52 18L63 16L58 32L49 24L37 28L29 23Z" fill="${a.hair}"/>`:`<path d="M22 33V24Q22 9 40 13Q58 9 58 31L48 23L38 27L31 23Z" fill="${a.hair}"/>`}
  ${a.hairstyle === 'curly' ? [24,33,43,54].map(x=>`<circle cx="${x}" cy="19" r="8" fill="${a.hair}"/>`).join('') : ''}
  ${a.hairstyle==='braid'?[45,51,57,63].map(y=>`<ellipse cx="57" cy="${y}" rx="5" ry="4" fill="${a.hair}"/>`).join('')+`<path d="M53 65h8" stroke="${accent}" stroke-width="3"/>`:''}
  ${resting || a.expression==='bright' ? '<path d="M29 35q3-4 7 0m8 0q3-4 7 0" fill="none" stroke="#354038" stroke-width="2"/>' : '<circle cx="33" cy="35" r="1.8" fill="#354038"/><circle cx="47" cy="35" r="1.8" fill="#354038"/>'}
  <path d="${state?.key==='unwell'||state?.key==='hungry'?'M36 45Q40 41 44 45':a.expression==='calm'?'M37 44h6':'M36 43Q40 47 44 43'}" fill="none" stroke="#8b6251" stroke-width="2"/>
  ${a.faceMark==='freckles'?[27,30,50,53].map(x=>`<circle cx="${x}" cy="40" r=".9" fill="#ad7954"/>`).join(''):a.faceMark==='blush'?'<g fill="#d98883" opacity=".6"><ellipse cx="28" cy="41" rx="4" ry="2"/><ellipse cx="52" cy="41" rx="4" ry="2"/></g>':a.faceMark==='beard'?`<path d="M25 40Q28 54 40 54Q52 54 55 40L49 45L40 49L31 45Z" fill="${a.hair}"/>`:''}
  ${a.accessory==='glasses'?'<g fill="none" stroke="#34443d" stroke-width="2"><rect x="26" y="30" width="13" height="10" rx="3"/><rect x="42" y="30" width="13" height="10" rx="3"/><path d="M39 34h3"/></g>':a.accessory==='hat'?`<path d="M19 22h42M27 21V9h26v12" fill="${accent}" stroke="${accent}" stroke-width="6"/>`:a.accessory==='scarf'?`<path d="M25 51q15 8 30 0v7H25ZM46 55h8v19h-8Z" fill="${accent}"/>`:a.accessory==='earrings'?`<g fill="none" stroke="${accent}" stroke-width="2"><circle cx="21" cy="40" r="4"/><circle cx="59" cy="40" r="4"/></g>`:a.accessory==='flower'?`<g fill="${accent}"><circle cx="58" cy="21" r="5"/><circle cx="52" cy="17" r="5"/><circle cx="53" cy="25" r="5"/></g><circle cx="54" cy="21" r="3" fill="#bd8561"/>`:a.accessory==='headphones'?`<path d="M20 36v-8a20 20 0 0 1 40 0v8" fill="none" stroke="${accent}" stroke-width="4"/><rect x="17" y="29" width="7" height="14" rx="3" fill="${accent}"/><rect x="56" y="29" width="7" height="14" rx="3" fill="${accent}"/>`:''}
  ${state?.key==='unwell'?'<path d="M25 24h14v5H25z" fill="#fff9e8"/>':''}
  ${state&&state.key!=='calm'?`<circle cx="65" cy="70" r="12" fill="${state.color}"/><text x="65" y="74" text-anchor="middle" font-size="13" fill="#fff" font-family="sans-serif">${state.symbol}</text>`:''}</svg>`;
}
export function drawPerson(ctx: CanvasRenderingContext2D, n: NPC, x: number, y: number, w?: WorldState, phase = 0, showStatus = true) {
  const a = appearance(n), v = characterVisual(n, w), child = n.identity.age < 16, elder = n.identity.age >= 65;
  ctx.save(); ctx.translate(x, y); ctx.scale(child ? .78 : 1, child ? .78 : 1);
  if (v.sleeping) { ctx.translate(0, -1); ctx.rotate(-.65); }
  else if (v.tired || v.key === 'unwell') ctx.rotate(.12);
  const step = v.moving ? Math.sin(phase) * 3 : 0;
  ctx.fillStyle = '#43584d'; ctx.fillRect(-5, 1, 4, 7 + step); ctx.fillRect(1, 1, 4, 7 - step);
  ctx.fillStyle = '#3a4942'; ctx.fillRect(-6, 6 + step, 5, 3); ctx.fillRect(1, 6 - step, 5, 3);
  if (['long','braid','ponytail','bob'].includes(a.hairstyle)) { ctx.fillStyle = a.hair; ctx.beginPath(); ctx.roundRect(-7, -19, 14, 18, 5); ctx.fill(); }
  ctx.fillStyle = a.outfit; ctx.beginPath(); ctx.roundRect(-7, -10, 14, 14, 4); ctx.fill();
  ctx.fillStyle = a.accent ?? '#eed5a0';
  if(a.clothing==='stripes')for(const yy of [-7,-3,1])ctx.fillRect(-6,yy,12,1.5);
  if(a.clothing==='overalls'){ctx.fillRect(-4,-9,2,10);ctx.fillRect(2,-9,2,10);ctx.fillRect(-4,-2,8,6);}
  if(a.clothing==='vest'){ctx.fillRect(-6,-8,4,11);ctx.fillRect(2,-8,4,11);}
  if(a.clothing==='dress'){ctx.beginPath();ctx.moveTo(-4,-8);ctx.lineTo(4,-8);ctx.lineTo(8,6);ctx.lineTo(-8,6);ctx.closePath();ctx.fill();}
  ctx.fillStyle = '#ffffff35'; ctx.fillRect(-5, -8, 3, 9);
  ctx.fillStyle = a.skin; ctx.fillRect(-9, -7 + step / 2, 3, 8); ctx.fillRect(6, v.working ? -13 : -7 - step / 2, 3, 8);
  ctx.beginPath(); ctx.arc(0, -16, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = a.hair;
  if (a.hairstyle !== 'bald') { ctx.beginPath(); ctx.arc(0, -18, 6, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(-6, -18, 3, 5); }
  if (a.hairstyle === 'curly') for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.arc(dx, -21, 3, 0, Math.PI * 2); ctx.fill(); }
  if(a.hairstyle==='bun'){ctx.beginPath();ctx.arc(0,-25,4,0,Math.PI*2);ctx.fill();}
  if(a.hairstyle==='ponytail'){ctx.beginPath();ctx.ellipse(7,-16,3,8,-.3,0,Math.PI*2);ctx.fill();}
  if(a.hairstyle==='braid')for(const yy of [-13,-9,-5]){ctx.beginPath();ctx.arc(6,yy,2.5,0,Math.PI*2);ctx.fill();}
  if(a.hairstyle==='spiky'){ctx.beginPath();ctx.moveTo(-6,-19);ctx.lineTo(-7,-25);ctx.lineTo(-2,-22);ctx.lineTo(1,-28);ctx.lineTo(4,-22);ctx.lineTo(7,-25);ctx.lineTo(6,-18);ctx.fill();}
  if (elder) { ctx.fillStyle = '#dbd7c8'; ctx.fillRect(-6, -18, 2, 4); ctx.fillRect(4, -18, 2, 4); }
  ctx.fillStyle = '#35443c'; ctx.fillRect(-3, -16, 1.5, v.sleeping || v.tired ? 1 : 2); ctx.fillRect(2, -16, 1.5, v.sleeping || v.tired ? 1 : 2);
  ctx.fillStyle = '#b87d66'; ctx.fillRect(-1, -12, 3, 1);
  if (a.accessory === 'hat') { ctx.fillStyle = a.accent ?? '#eed5a0'; ctx.fillRect(-8, -21, 16, 3); ctx.fillRect(-5, -27, 10, 6); }
  if (a.accessory === 'glasses') { ctx.strokeStyle = '#34443d'; ctx.lineWidth = 1; ctx.strokeRect(-5, -17, 4, 4); ctx.strokeRect(1, -17, 4, 4); ctx.fillStyle = '#34443d'; ctx.fillRect(-1, -16, 2, 1); }
  ctx.fillStyle = a.accent ?? '#eed5a0';
  if(a.accessory==='scarf'){ctx.fillRect(-6,-11,12,3);ctx.fillRect(3,-9,3,9);}
  if(a.accessory==='earrings'){ctx.fillRect(-7,-14,2,3);ctx.fillRect(5,-14,2,3);}
  if(a.accessory==='flower'){for(const [xx,yy] of [[5,-23],[8,-21],[5,-19]]){ctx.beginPath();ctx.arc(xx,yy,2,0,Math.PI*2);ctx.fill();}}
  if(a.accessory==='headphones'){ctx.strokeStyle=a.accent ?? '#eed5a0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-17,7,Math.PI,2*Math.PI);ctx.stroke();ctx.fillRect(-8,-18,3,6);ctx.fillRect(5,-18,3,6);}
  if(a.faceMark==='beard'){ctx.fillStyle=a.hair;ctx.fillRect(-3,-12,6,3);}
  if(a.faceMark==='blush'||a.faceMark==='freckles'){ctx.fillStyle='#b87d66';ctx.fillRect(-5,-13,2,1);ctx.fillRect(3,-13,2,1);}
  if (v.working) {
    ctx.fillStyle = '#d5bf93'; ctx.fillRect(-4, -7, 8, 9);
    ctx.strokeStyle = '#795f43'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, 4); ctx.lineTo(12, -16); ctx.stroke();
    ctx.fillStyle = '#a1aca2'; ctx.fillRect(7, -17, 11, 3);
  }
  if (n.currentAction?.kind === 'Eat' && !v.moving) { ctx.fillStyle = '#d8a45e'; ctx.beginPath(); ctx.ellipse(7, -10, 4, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  if (['Drink', 'Wash'].includes(n.currentAction?.kind ?? '') && !v.moving) { ctx.fillStyle = '#a6d1d3'; ctx.fillRect(6, -12, 5, 6); }
  if (v.key === 'unwell') { ctx.fillStyle = '#fff9e6'; ctx.fillRect(-5, -21, 8, 3); }
  if (v.key === 'cold') { ctx.fillStyle = '#e0be87'; ctx.fillRect(-7, -10, 14, 4); ctx.fillRect(3, -8, 4, 9); }
  ctx.restore();
  if (showStatus && v.key !== 'calm' && v.key !== 'moving') {
    ctx.fillStyle = '#fffdf1'; ctx.beginPath(); ctx.roundRect(x + 7, y - 34, 17, 15, 5); ctx.fill();
    ctx.fillStyle = v.color; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(v.symbol, x + 15.5, y - 23);
  }
}
export function defaultCharacter(homeId: string): CharacterInput {
  return { ...structuredClone(CREATION_DEFAULTS), name: '새이웃', age: 24, background: '', homeId, occupation: 'gatherer', goal: 'make_friend', appearance: { skin: '#ebcba4', hair: '#5d5345', outfit: '#76b4a3', hairstyle: 'short', accessory: 'none', accent:'#eed5a0', clothing:'plain', expression:'smile', faceMark:'none', backdrop:'meadow' }, needs: { hunger: 20, thirst: 15, fatigue: 10, health: 95, safety: 90, social: 30 }, personality: { diligence: 60, greed: 30, sociability: 80, aggression: 15, empathy: 75, curiosity: 65 }, skill: 20, education: 20, skills: { field: 20, quarry: 0, mine: 0, mill: 0, smith: 0 }, food: 3, wood: 0, wealth: 20 };
}
export function greetingOptions(w: WorldState, homeId: string) {
  const settlement = w.buildings.find(b => b.id === homeId)?.settlementId;
  return '<option value="">스스로 이웃 만나기</option>' + w.npcs.filter(n => n.alive && n.settlementId === settlement && !w.civilization.journeys.some(j => j.npcIds.includes(n.id))).map(n => `<option value="${esc(n.id)}">${esc(n.identity.name)} · ${occupationLabel(w, n)}</option>`).join('');
}
export const START_PRESETS: Record<string, { label: string; occupation: CharacterInput['occupation']; skill: number; education: number; skills: CharacterInput['skills']; goal: CharacterInput['goal'] }> = {
  farmer: { label: '농사꾼', occupation: 'farmer', skill: 50, education: 30, skills: { field: 80, quarry: 10, mine: 10, mill: 20, smith: 0 }, goal: 'expand_farm' },
  artisan: { label: '장인', occupation: 'carpenter', skill: 60, education: 30, skills: { field: 10, quarry: 10, mine: 10, mill: 10, smith: 70 }, goal: 'earn_wealth' },
  social: { label: '사교가', occupation: 'merchant', skill: 70, education: 70, skills: { field: 20, quarry: 10, mine: 10, mill: 10, smith: 10 }, goal: 'make_friend' },
};
export function budgetMarkup(a: CharacterInput) {
  return creationBudgets(a).map(b => `<span class="creation-budget ${b.used > b.limit ? 'over-budget' : ''}"><b>${b.label}</b> ${b.used} / ${b.limit} · ${b.used > b.limit ? `${b.used - b.limit}점 초과` : `${b.limit - b.used}점 남음`}</span>`).join('');
}
export function updateCreationBudgets(form: HTMLFormElement, clearError = true) {
  const a = readCharacter(form, false), budgets = creationBudgets(a);
  form.querySelector('#creation-budgets')!.innerHTML = budgetMarkup(a);
  if (clearError) form.querySelector('#character-error')!.textContent = budgets.filter(b => b.used > b.limit).map(b => `${b.label} ${b.used - b.limit}점 초과: 수치를 낮춰 주세요.`).join(' ');
  form.querySelector<HTMLButtonElement>('[type="submit"]')!.disabled = form.dataset.blocked === 'true' || budgets.some(b => b.used > b.limit);
}
export function characterForm(w: WorldState, ownIds = w.npcs.filter(n => n.profile).map(n => n.id)) {
  const homes = availableHomes(w), first = homes.find(h => h.vacant > 0 && h.home.settlementId === w.civilization.focus) ?? homes.find(h => h.vacant > 0);
  const a = defaultCharacter(first?.home.id ?? '');
  const blocked = !first || ownIds.length >= NPC_CREATION_LIMIT || w.npcs.filter(n => n.alive).length >= 3000 || w.npcs.length >= 30000;
  const peers = w.npcs.filter(n => n.alive && n.profile && ownIds.includes(n.id));
  const options = (values: Record<string, string>, value: string) => Object.entries(values).map(([k, v]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${v}</option>`).join('');
  const number = (key: string, title: string, value: number, min = 0, max = 100) => `<label>${title}<input name="${key}" type="number" min="${min}" max="${max}" step="1" value="${value}" required/></label>`;
  return `<div class="eyebrow">A NEW LIFE</div><h2>나만의 NPC 만들기</h2><p>기존 세계에 새 주민이 입주합니다. 성격과 능력에 따라 이웃과 관계를 맺고 스스로 생활합니다.</p>
  <p>내 NPC ${ownIds.length} / ${NPC_CREATION_LIMIT}명 · 사망한 주민도 생성 수에 포함하며, 자연 출생한 자손은 포함하지 않습니다.</p>
  <form id="character-form" class="character-form" data-blocked="${blocked}"><fieldset><legend>같은 예산으로 다른 시작</legend><div class="start-presets">${Object.entries(START_PRESETS).map(([key,p])=>`<button type="button" class="button" data-start="${key}">${p.label}</button>`).join('')}</div><p class="muted">유형은 직업·바람·능력을 배분합니다. 적용 후 자유롭게 조정하세요. 각 유형의 능력 총합은 200점입니다.</p><div id="creation-budgets" class="creation-budgets" aria-live="polite">${budgetMarkup(a)}</div><p class="muted">각 예산은 독립적입니다. 자산은 코인 1개 = 1점, 식량·목재 1개 = 5점입니다. 컨디션은 배고픔·갈증·피로·통증을 100에서 뺀 값으로 계산합니다.</p></fieldset><div class="character-intro"><div id="character-preview">${portrait(a.appearance)}</div><div class="character-fields"><label>이름<input name="name" maxlength="40" value="${a.name}" required/></label>${number('age', '나이', a.age, 0, 80)}<label>직업<select aria-label="직업" name="occupation">${options(OCCUPATIONS, a.occupation)}</select></label><label>처음의 바람<select aria-label="처음의 바람" name="goal">${options(GOAL_LABELS, a.goal)}</select></label></div></div>
  <p class="muted">0–17세는 아동·학생으로 집에서 돌봄을 받으며 자랍니다. 18세부터 스스로 일과 생활 행동을 선택합니다. 65세 이상은 은퇴 상태로 입주합니다. 건강 40 미만이면 요양합니다. 해당 주민의 직업은 자동으로 무직이 됩니다. 성인도 직업에서 무직을 선택해 구직자로 시작할 수 있습니다.</p>
  <fieldset><legend>어떤 삶을 남길까요?</legend><label>삶의 우선순위<select name="ambition">${options(AMBITION_LABELS, 'balanced')}</select></label><p class="muted">가족은 만남과 돌봄, 부는 생산과 판매, 공동체는 나눔과 노동을 더 고려합니다. 생존이 위급할 때는 몸을 먼저 돌봅니다. 입주 후 ‘내 가문’에서 자손·재산·기여를 살펴보세요.</p></fieldset>
  <fieldset class="appearance-studio"><legend>나만의 모습</legend><p class="muted">색과 소품을 골라 이웃만의 모습을 만들어 보세요.</p><div class="look-presets">${Object.entries(LOOK_PRESETS).map(([key,p])=>`<button type="button" class="look-preset" data-look="${key}">${portrait({...a.appearance,...p.appearance})}<span>${p.label}</span></button>`).join('')}</div><div class="hair-gallery" role="group" aria-label="머리 모양 미리보기">${Object.entries(HAIRSTYLES).map(([key,label])=>`<button type="button" data-hair="${key}" aria-label="${label} 선택" aria-pressed="${key==='short'}">${portrait({...a.appearance,hairstyle:key as Appearance['hairstyle']})}<span>${label}</span></button>`).join('')}</div><div class="character-fields">${[['skin','피부색'], ['hair','머리색'], ['outfit','옷 색상'], ['accent','포인트 색상']].map(([key,label]) => `<label>${label}<input type="color" name="${key}" value="${a.appearance[key as 'skin']}"/></label>`).join('')}<label>머리 모양<select aria-label="머리 모양" name="hairstyle">${options(HAIRSTYLES, 'short')}</select></label><label>소품<select aria-label="소품" name="accessory">${options(ACCESSORIES, 'none')}</select></label><label>의상<select name="clothing">${options(CLOTHING,'plain')}</select></label><label>기본 표정<select name="expression">${options({smile:'미소',calm:'차분함',bright:'활짝 웃음'},'smile')}</select></label><label>얼굴 특징<select name="faceMark">${options({none:'없음',freckles:'주근깨',blush:'홍조',beard:'수염'},'none')}</select></label><label>초상화 배경<select name="backdrop">${options({meadow:'초록 들판',sunset:'따뜻한 노을',night:'별이 뜬 밤'},'meadow')}</select></label></div><p class="muted">기본 표정 위에 실제 생활 상태가 표시됩니다. 외형은 능력이나 자원을 바꾸지 않습니다.</p></fieldset>
  <fieldset><legend>어디서, 누구와</legend><label>입주할 집<select aria-label="입주할 집" name="homeId" required>${homes.map(({home, vacant}) => `<option value="${esc(home.id)}" ${home.id === a.homeId ? 'selected' : ''} ${!vacant ? 'disabled' : ''}>${esc(w.civilization.settlements.find(v => v.id === home.settlementId)!.name)} · ${esc(home.name)} (${HOMES[w.living.homes[home.id]].label}) · 빈자리 ${vacant}</option>`).join('')}</select></label><label>첫 인사할 주민<select aria-label="첫 인사할 주민" name="greetId">${greetingOptions(w, a.homeId)}</select></label><p class="muted">선택하면 실제로 걸어가 인사를 시도합니다. 상대의 이동·상태에 따라 성사 여부가 달라집니다.</p><label>배경 소개<textarea name="background" maxlength="300" rows="3" placeholder="어떤 삶을 시작하나요? 소개글은 프로필에 표시됩니다."></textarea></label></fieldset>
  <fieldset><legend>내 NPC와 시작하는 인연</legend><p class="muted">입주할 때 한 번, 내 주민과의 친밀도를 0–60 사이로 설정합니다. 합계는 120까지입니다. 이후에는 서로 겪는 사건에 따라 변합니다. 가족·연인 관계를 지정하지는 않습니다.</p><div class="character-fields">${peers.map(n=>number(`bond:${esc(n.id)}`, `${esc(n.identity.name)} · 시작 친밀도`, 0, 0, 60)).join('')}</div>${peers.length ? '' : '<p>먼저 내 NPC를 한 명 만든 뒤 다음 NPC와의 인연을 설정할 수 있습니다.</p>'}</fieldset>
  <fieldset><legend>성격 · 0–100</legend><div class="character-fields">${Object.entries({ diligence: '근면', greed: '탐욕', sociability: '사교성', aggression: '공격성', empathy: '공감', curiosity: '호기심' }).map(([k,v]) => number(`personality.${k}`, v, a.personality[k as keyof typeof a.personality])).join('')}${Object.entries(TRAIT_LABELS).map(([k,v]) => number(`traits.${k}`, v, a.traits![k as keyof typeof a.traits])).join('')}</div></fieldset>
  <section class="attraction-profile"><div class="section-label">성격에서 드러나는 매력</div><div id="character-charms" class="charm-points">${charmPreview(a.personality, a.traits!)}</div><p class="muted">성격을 바꾸면 매력 포인트도 달라집니다. 만나는 상대의 성격에 따라 호응이 다르며, 직업·나이·건강·외모 취향·자산이 함께 관계에 영향을 줍니다.</p></section>
  <fieldset><legend>욕망 · 높을수록 강한 바람</legend><div class="character-fields">${Object.entries(DESIRE_LABELS).map(([k,v]) => number(`desires.${k}`, v, a.desires![k as keyof typeof a.desires])).join('')}</div></fieldset>
  <details><summary>초기 능력치·몸과 마음·자산 설정</summary><fieldset><legend>능력 · 0–100</legend><div class="character-fields">${number('skill','생활 기술',a.skill)}${number('education','교육',a.education)}${Object.entries({ field: '농업 숙련', quarry: '채석 숙련', mine: '채광 숙련', mill: '제분 숙련', smith: '도구 제작 숙련' }).map(([k,v]) => number(`skills.${k}`,v,a.skills[k as keyof typeof a.skills])).join('')}</div></fieldset><fieldset><legend>몸과 마음 · 0–100</legend><p class="muted">배고픔·갈증·피로는 높을수록 부족합니다. 건강·안전감·사회적 충족은 높을수록 좋습니다.</p><div class="character-fields">${Object.entries({ hunger: '배고픔', thirst: '갈증', fatigue: '피로', health: '건강', safety: '안전감', social: '사회적 충족' }).map(([k,v]) => number(`needs.${k}`,v,a.needs[k as keyof typeof a.needs],k === 'health' ? 1 : 0)).join('')}</div></fieldset><fieldset><legend>신체 컨디션</legend><p class="muted">체력·청결·온기는 높을수록 좋고, 통증은 낮을수록 좋습니다.</p><div class="character-fields">${Object.entries(BODY_LABELS).map(([k,v]) => number(`body.${k}`, v, a.body![k as keyof typeof a.body])).join('')}</div></fieldset><fieldset><legend>입주 시 가져오는 자산</legend><div class="character-fields">${number('food','식량',a.food)}${number('wood','목재',a.wood)}${number('wealth','재산 · 코인',a.wealth,0,1000)}</div><p class="muted">새로 들어온 자산으로 입주 사건과 세계 회계에 기록합니다.</p></fieldset></details>
  <p id="character-error" role="alert"></p><div class="character-submit"><span>생성 후 지도에서 바로 따라갑니다.</span><button type="submit" class="button dark" ${blocked ? 'disabled' : ''}>이 세계에 입주시키기</button></div>${ownIds.length >= NPC_CREATION_LIMIT ? '<p>이 세계의 NPC 생성 한도에 도달했습니다.</p>' : ''}${!first ? '<p>현재 빈 주거가 없습니다. 주거가 확보된 뒤 입주할 수 있습니다.</p>' : ''}</form>`;
}
export function readCharacter(form: HTMLFormElement, validate = true): CharacterInput {
  const data = new FormData(form), a = defaultCharacter(String(data.get('homeId')));
  for (const key of ['name','background','occupation','goal','ambition'] as const) (a as unknown as Record<string, unknown>)[key] = data.get(key);
  for (const key of ['age','skill','education','food','wood','wealth'] as const) a[key] = Number(data.get(key));
  for (const group of ['personality','needs','skills','traits','desires','body'] as const) for (const key of Object.keys(a[group]!)) (a[group] as Record<string, number>)[key] = Number(data.get(`${group}.${key}`));
  for (const key of Object.keys(a.appearance)) (a.appearance as unknown as Record<string, unknown>)[key] = data.get(key);
  if (data.get('greetId')) a.greetId = String(data.get('greetId'));
  a.bonds = [...data.entries()].filter(([key, value]) => key.startsWith('bond:') && Number(value) !== 0).map(([key, value]) => ({ npcId: key.slice(5), familiarity: Number(value) }));
  if (!validate) return a;
  const parsed = characterSchema.safeParse(a);
  if (!parsed.success) throw new Error(`입력값을 확인해 주세요: ${parsed.error.issues[0].message} (${parsed.error.issues[0].path.join('.')})`);
  return parsed.data;
}
