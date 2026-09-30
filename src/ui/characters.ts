import type { NPC, WorldState } from '../sim/types';
import { GOAL_LABELS, OCCUPATIONS } from '../sim/types';
import { availableHomes } from '../sim/characters';
import { type Appearance, type CharacterInput, characterSchema } from '../sim/character-schema';
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const COLORS = ['#e5a85f', '#d98175', '#76b4a3', '#a893c4', '#739eb7', '#d1b154', '#91a767', '#c6859f', '#71918d', '#b19a83', '#bb8b57', '#95a2c7'];
export function appearance(n: NPC): Appearance {
  return n.profile?.appearance ?? { skin: '#ebcba4', hair: '#5d5345', outfit: COLORS[Number(n.id.replace('npc', '')) % COLORS.length] ?? COLORS[0], hairstyle: 'short', accessory: 'none' };
}
export function portrait(a: Appearance) {
  return `<svg viewBox="0 0 80 88" role="img" aria-label="캐릭터 외모" class="character-portrait"><rect x="1" y="1" width="78" height="86" rx="18" fill="${a.outfit}22"/>
  ${a.hairstyle === 'long' ? `<rect x="20" y="18" width="40" height="45" rx="16" fill="${a.hair}"/>` : ''}
  <path d="M16 84V64Q16 51 40 51Q64 51 64 64V84" fill="${a.outfit}"/><circle cx="40" cy="33" r="18" fill="${a.skin}"/>
  ${a.hairstyle === 'bald' ? '' : `<path d="M22 33V24Q22 9 40 13Q58 9 58 31L48 23L38 27L31 23Z" fill="${a.hair}"/>`}
  ${a.hairstyle === 'curly' ? [24, 33, 43, 54].map(x => `<circle cx="${x}" cy="19" r="8" fill="${a.hair}"/>`).join('') : ''}
  <circle cx="33" cy="35" r="1.8" fill="#354038"/><circle cx="47" cy="35" r="1.8" fill="#354038"/><path d="M36 43Q40 46 44 43" fill="none" stroke="#8b6251" stroke-width="2"/>
  ${a.accessory === 'glasses' ? '<g fill="none" stroke="#34443d" stroke-width="2"><rect x="26" y="30" width="13" height="10" rx="3"/><rect x="42" y="30" width="13" height="10" rx="3"/><path d="M39 34h3"/></g>' : a.accessory === 'hat' ? `<path d="M19 22h42M27 21V9h26v12" fill="${a.outfit}" stroke="${a.outfit}" stroke-width="6"/>` : ''}</svg>`;
}
export function drawPerson(ctx: CanvasRenderingContext2D, n: NPC, x: number, y: number) {
  const a = appearance(n);
  ctx.fillStyle = '#48574b'; ctx.fillRect(x - 4, y + 2, 3, 6); ctx.fillRect(x + 1, y + 2, 3, 6);
  if (a.hairstyle === 'long') { ctx.fillStyle = a.hair; ctx.fillRect(x - 6, y - 16, 12, 14); }
  ctx.fillStyle = a.outfit; ctx.beginPath(); ctx.roundRect(x - 6, y - 9, 12, 13, 3); ctx.fill();
  ctx.fillStyle = a.skin; ctx.beginPath(); ctx.arc(x, y - 13, 5, 0, Math.PI * 2); ctx.fill();
  if (a.hairstyle !== 'bald') { ctx.fillStyle = a.hair; ctx.beginPath(); ctx.arc(x, y - 15, 5, Math.PI, Math.PI * 2); ctx.fill(); }
  if (a.hairstyle === 'curly') for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.arc(x + dx, y - 17, 3, 0, Math.PI * 2); ctx.fill(); }
  if (a.accessory === 'hat') { ctx.fillStyle = a.outfit; ctx.fillRect(x - 7, y - 18, 14, 2); ctx.fillRect(x - 4, y - 23, 8, 6); }
  if (a.accessory === 'glasses') { ctx.strokeStyle = '#34443d'; ctx.lineWidth = 1; ctx.strokeRect(x - 5, y - 15, 4, 3); ctx.strokeRect(x + 1, y - 15, 4, 3); ctx.fillStyle = '#34443d'; ctx.fillRect(x - 1, y - 14, 2, 1); }
}
export function defaultCharacter(homeId: string): CharacterInput {
  return { name: '새이웃', age: 24, background: '', homeId, occupation: 'gatherer', goal: 'make_friend', appearance: { skin: '#ebcba4', hair: '#5d5345', outfit: '#76b4a3', hairstyle: 'short', accessory: 'none' }, needs: { hunger: 20, thirst: 15, fatigue: 10, health: 95, safety: 90, social: 30 }, personality: { diligence: 60, greed: 30, sociability: 80, aggression: 15, empathy: 75, curiosity: 65 }, skill: 20, education: 20, skills: { field: 20, quarry: 0, mine: 0, mill: 0, smith: 0 }, food: 3, wood: 0, wealth: 20 };
}
export function greetingOptions(w: WorldState, homeId: string) {
  const settlement = w.buildings.find(b => b.id === homeId)?.settlementId;
  return '<option value="">스스로 이웃 만나기</option>' + w.npcs.filter(n => n.alive && n.settlementId === settlement && !w.civilization.journeys.some(j => j.npcIds.includes(n.id))).map(n => `<option value="${esc(n.id)}">${esc(n.identity.name)} · ${OCCUPATIONS[n.occupation]}</option>`).join('');
}
export function characterForm(w: WorldState) {
  const homes = availableHomes(w), first = homes.find(h => h.vacant > 0 && h.home.settlementId === w.civilization.focus) ?? homes.find(h => h.vacant > 0);
  const a = defaultCharacter(first?.home.id ?? '');
  const options = (values: Record<string, string>, value: string) => Object.entries(values).map(([k, v]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${v}</option>`).join('');
  const number = (key: string, title: string, value: number, min = 0, max = 100) => `<label>${title}<input name="${key}" type="number" min="${min}" max="${max}" step="1" value="${value}" required/></label>`;
  return `<div class="eyebrow">A NEW LIFE</div><h2>나만의 NPC 만들기</h2><p>기존 세계에 새 주민이 입주합니다. 성격과 능력에 따라 이웃과 관계를 맺고 스스로 생활합니다.</p>
  <form id="character-form" class="character-form"><div class="character-intro"><div id="character-preview">${portrait(a.appearance)}</div><div class="character-fields"><label>이름<input name="name" maxlength="40" value="${a.name}" required/></label>${number('age', '나이 · 성인', a.age, 18, 80)}<label>직업<select aria-label="직업" name="occupation">${options(OCCUPATIONS, a.occupation)}</select></label><label>처음의 바람<select aria-label="처음의 바람" name="goal">${options(GOAL_LABELS, a.goal)}</select></label></div></div>
  <fieldset><legend>외모</legend><div class="character-fields">${[['skin','피부색'], ['hair','머리색'], ['outfit','옷 색상']].map(([key,label]) => `<label>${label}<input type="color" name="${key}" value="${a.appearance[key as 'skin']}"/></label>`).join('')}<label>머리 모양<select aria-label="머리 모양" name="hairstyle">${options({ short: '짧은 머리', long: '긴 머리', curly: '곱슬머리', bald: '민머리' }, 'short')}</select></label><label>소품<select aria-label="소품" name="accessory">${options({ none: '없음', glasses: '안경', hat: '모자' }, 'none')}</select></label></div></fieldset>
  <fieldset><legend>어디서, 누구와</legend><label>입주할 집<select aria-label="입주할 집" name="homeId" required>${homes.map(({home, vacant}) => `<option value="${esc(home.id)}" ${home.id === a.homeId ? 'selected' : ''} ${!vacant ? 'disabled' : ''}>${esc(w.civilization.settlements.find(v => v.id === home.settlementId)!.name)} · ${esc(home.name)} · 빈자리 ${vacant}</option>`).join('')}</select></label><label>첫 인사할 주민<select aria-label="첫 인사할 주민" name="greetId">${greetingOptions(w, a.homeId)}</select></label><p class="muted">선택하면 실제로 걸어가 인사를 시도합니다. 상대의 이동·상태에 따라 성사 여부가 달라집니다.</p><label>배경 소개<textarea name="background" maxlength="300" rows="3" placeholder="어떤 삶을 시작하나요? 소개글은 프로필에 표시됩니다."></textarea></label></fieldset>
  <fieldset><legend>성격 · 0–100</legend><div class="character-fields">${Object.entries({ diligence: '근면', greed: '탐욕', sociability: '사교성', aggression: '공격성', empathy: '공감', curiosity: '호기심' }).map(([k,v]) => number(`personality.${k}`, v, a.personality[k as keyof typeof a.personality])).join('')}</div></fieldset>
  <details><summary>초기 능력치·몸과 마음·자산 설정</summary><fieldset><legend>능력 · 0–100</legend><div class="character-fields">${number('skill','생활 기술',a.skill)}${number('education','교육',a.education)}${Object.entries({ field: '농업 숙련', quarry: '채석 숙련', mine: '채광 숙련', mill: '제분 숙련', smith: '도구 제작 숙련' }).map(([k,v]) => number(`skills.${k}`,v,a.skills[k as keyof typeof a.skills])).join('')}</div></fieldset><fieldset><legend>몸과 마음 · 0–100</legend><p class="muted">배고픔·갈증·피로는 높을수록 부족합니다. 건강·안전감·사회적 충족은 높을수록 좋습니다.</p><div class="character-fields">${Object.entries({ hunger: '배고픔', thirst: '갈증', fatigue: '피로', health: '건강', safety: '안전감', social: '사회적 충족' }).map(([k,v]) => number(`needs.${k}`,v,a.needs[k as keyof typeof a.needs],k === 'health' ? 1 : 0)).join('')}</div></fieldset><fieldset><legend>입주 시 가져오는 자산</legend><div class="character-fields">${number('food','식량',a.food)}${number('wood','목재',a.wood)}${number('wealth','재산 · 코인',a.wealth,0,1000)}</div><p class="muted">새로 들어온 자산으로 입주 사건과 세계 회계에 기록합니다.</p></fieldset></details>
  <p id="character-error" role="alert"></p><div class="character-submit"><span>생성 후 지도에서 바로 따라갑니다.</span><button type="submit" class="button dark" ${!first || w.npcs.filter(n => n.alive).length >= 3000 || w.npcs.length >= 30000 ? 'disabled' : ''}>이 세계에 입주시키기</button></div>${!first ? '<p>현재 빈 주거가 없습니다. 주거가 확보된 뒤 입주할 수 있습니다.</p>' : ''}</form>`;
}
export function readCharacter(form: HTMLFormElement): CharacterInput {
  const data = new FormData(form), a = defaultCharacter(String(data.get('homeId')));
  for (const key of ['name','background','occupation','goal'] as const) (a as unknown as Record<string, unknown>)[key] = data.get(key);
  for (const key of ['age','skill','education','food','wood','wealth'] as const) a[key] = Number(data.get(key));
  for (const group of ['personality','needs','skills'] as const) for (const key of Object.keys(a[group])) (a[group] as Record<string, number>)[key] = Number(data.get(`${group}.${key}`));
  for (const key of Object.keys(a.appearance)) (a.appearance as unknown as Record<string, unknown>)[key] = data.get(key);
  if (data.get('greetId')) a.greetId = String(data.get('greetId'));
  const parsed = characterSchema.safeParse(a);
  if (!parsed.success) throw new Error(`입력값을 확인해 주세요: ${parsed.error.issues[0].path.join('.')}`);
  return parsed.data;
}
