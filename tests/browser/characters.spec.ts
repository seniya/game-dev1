import { test, expect } from '@playwright/test';

test('create a customized resident, follow real interactions, find them and restore their profile', async ({page}) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?local=1'); await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.getByRole('button',{name:'＋ NPC 만들기',exact:true}).click();
  const form=page.locator('#character-form'); await expect(form).toBeVisible();
  await form.getByLabel('이름',{exact:true}).fill('도시의 해솔'); await form.getByLabel('나이',{exact:true}).fill('29');
  await form.getByLabel('옷 색상').fill('#2266aa'); await form.getByLabel('머리 모양',{exact:true}).selectOption('curly'); await form.getByLabel('소품').selectOption('glasses');
  await form.getByLabel('배경 소개').fill('이웃과 도구를 나누는 목수 <script>');
  await form.getByLabel('직업',{exact:true}).selectOption('tailor');
  await form.getByLabel('검소함',{exact:true}).fill('91'); await form.getByLabel('성취',{exact:true}).fill('88'); await form.getByLabel('첫 인사할 주민').selectOption('npc0');
  await form.locator('summary').click(); await form.getByLabel('도구 제작 숙련').fill('73'); await form.getByLabel('재산 · 코인').fill('123'); await form.getByLabel('통증',{exact:true}).fill('23');
  await expect(page.locator('#character-preview svg')).toBeVisible();
  await form.getByRole('button',{name:'이 세계에 입주시키기'}).click();
  await expect(form).not.toBeVisible(); await expect(page.locator('#npc-header')).toContainText('도시의 해솔');
  await expect(page.locator('#world-map')).toHaveAttribute('data-mode','follow'); await expect(page.locator('#npc-detail')).toContainText('이웃과 도구를 나누는 목수 <script>');
  await expect(page.locator('#selected-only')).toBeChecked();
  for(let i=0;i<30;i++) await page.getByRole('button',{name:'한 틱 진행',exact:true}).click();
  await page.getByRole('tab',{name:'관계',exact:true}).click(); await expect(page.locator('#npc-detail .relationship-card').first()).toBeVisible();
  await page.getByRole('button',{name:'마을 주민',exact:true}).click(); await page.getByLabel('내가 만든 주민만').check();
  await page.getByLabel('주민 검색',{exact:true}).fill('해솔'); await expect(page.locator('.resident-card')).toHaveCount(1); await page.locator('.resident-card').click();
  if (await page.locator('#world-tools summary').isVisible()) await page.locator('#world-tools summary').click();
  await page.getByRole('button',{name:'세계 저장',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('living-small-world-v1')!));
  const n=saved.npcs.find((n:any)=>n.identity.name==='도시의 해솔'); expect(n.profile.appearance.outfit).toBe('#2266aa'); expect(saved.living.people[n.id].traits.frugality).toBe(91); expect(saved.living.people[n.id].desires.mastery).toBe(88); expect(saved.living.people[n.id].body.pain).toBeGreaterThan(0); expect(saved.version).toBe(9); expect(saved.urban.citizens[n.id].skills.smith).toBeGreaterThanOrEqual(73);
  await page.reload(); await page.getByRole('button',{name:'마을 주민',exact:true}).click(); await page.getByLabel('내가 만든 주민만').check(); await expect(page.locator('.resident-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('city scale supports creating and locating a resident in a different settlement', async ({page}) => {
  await page.goto('/?local=1'); await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.getByRole('button',{name:'관찰 실험실'}).click(); await page.locator('#population-input').fill('1000'); await page.getByRole('button',{name:'새로 시작',exact:true}).click();
  await page.locator('#map-mode').selectOption('region'); await expect(page.locator('#world-map')).toHaveAttribute('aria-label','세계 전체 지도');
  await page.getByRole('button',{name:'＋ NPC 만들기',exact:true}).click();
  const select=page.locator('#character-form [name=homeId]'); const home=await select.locator('option:not([disabled])').last().getAttribute('value'); await select.selectOption(home!);
  await page.locator('#character-form [name=name]').fill('도시 탐험가'); await page.getByRole('button',{name:'이 세계에 입주시키기'}).click();
  await expect(page.locator('#world-map')).toHaveAttribute('data-mode','follow'); await expect(page.locator('#character-watch')).toContainText('도시 탐험가');
  await expect(page.locator('#nav-population')).toHaveText('1001');
  await page.screenshot({path:'test-results/character-city.png',fullPage:true});
});

test('mobile creator fits the viewport, preserves input across ticks, and allows cancellation', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/?local=1');
  await page.getByRole('button',{name:'＋ NPC 만들기',exact:true}).click(); await page.getByLabel('이름',{exact:true}).fill('모바일 이웃');
  await page.waitForTimeout(1600); await expect(page.getByLabel('이름',{exact:true})).toHaveValue('모바일 이웃');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const dialog=page.getByRole('dialog'); expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/character-mobile.png'});
  await page.getByRole('button',{name:'닫기',exact:true}).click(); await expect(page.locator('#nav-population')).toHaveText('12');
});

test('server-backed creator survives reload and records arrival in the life archive', async ({page, request}) => {
  const initial=await (await request.get('/api/world')).json();
  const reset=await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:initial.revision,action:{type:'reset',seed:42,population:12}}}); expect(reset.ok()).toBe(true);
  await page.goto('/'); await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.getByRole('button',{name:'＋ NPC 만들기',exact:true}).click(); await page.getByLabel('이름',{exact:true}).fill('서버의 새주민');
  await page.getByLabel('머리 모양',{exact:true}).selectOption('long'); await page.getByRole('button',{name:'이 세계에 입주시키기'}).click();
  await expect(page.locator('#npc-header')).toContainText('서버의 새주민'); await expect(page.locator('#world-map')).toHaveAttribute('data-mode','follow');
  await page.getByRole('tab',{name:'생애',exact:true}).click(); await expect(page.locator('#npc-detail')).toContainText('입주했다');
  await page.reload(); await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.getByRole('button',{name:'마을 주민',exact:true}).click(); await page.getByLabel('내가 만든 주민만').check(); await expect(page.locator('.resident-card')).toHaveCount(1);
  await page.locator('.resident-card').click(); await expect(page.locator('#npc-header')).toContainText('서버의 새주민');
});

 test('expanded world overview and resident condition are readable on desktop and mobile', async ({page}) => {
  await page.goto('/?local=1'); await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await expect(page.locator('#living-overview')).toContainText('직업 26종');
  await expect(page.locator('#living-overview')).toContainText('단열주택');
  await expect(page.locator('#npc-detail')).toContainText('욕망과 생활 취향');
  await expect(page.locator('#npc-detail')).toContainText('신체 컨디션');
  await page.screenshot({path:'test-results/living-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/living-mobile.png',fullPage:true});
});

test('children, retired residents and job seekers can be created with accurate status labels', async ({page}) => {
  await page.goto('/?local=1'); await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await expect(page.locator('#living-overview')).toContainText('기본 자원 14종');
  await expect(page.locator('#living-overview')).toContainText('가공 상품 12종');
  for (const [name, age, expected] of [['새 아이','8','아동·학생'],['은퇴 이웃','70','은퇴'],['구직 이웃','24','구직 중']]) {
    await page.getByRole('button',{name:'＋ NPC 만들기',exact:true}).click();
    await page.getByLabel('이름',{exact:true}).fill(name); await page.getByLabel('나이',{exact:true}).fill(age);
    await page.getByLabel('직업',{exact:true}).selectOption(age === '24' ? 'none' : 'baker');
    await page.getByRole('button',{name:'이 세계에 입주시키기'}).click();
    await expect(page.locator('#npc-header')).toContainText(name); await expect(page.locator('#npc-header')).toContainText(expected);
  }
  await page.getByRole('button',{name:'마을 주민',exact:true}).click();
  await page.getByLabel('주민 검색').fill('은퇴'); await expect(page.locator('.resident-card').first()).toContainText('은퇴');
});

test('personality charms update in the creator and directional relationship factors fit mobile', async ({page}) => {
  await page.goto('/?local=1'); await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await expect(page.locator('#npc-detail .charm-point')).toHaveCount(3);
  await page.getByRole('button',{name:'＋ NPC 만들기',exact:true}).click();
  const before = await page.locator('#character-charms').innerText();
  await page.locator('[name="personality.curiosity"]').fill('100');
  await expect(page.locator('#character-charms')).toContainText('흥미로운 호기심');
  expect(await page.locator('#character-charms').innerText()).not.toBe(before);
  await page.getByLabel('첫 인사할 주민').selectOption('npc0');
  await page.getByRole('button',{name:'이 세계에 입주시키기'}).click();
  for(let i=0;i<30;i++) await page.getByRole('button',{name:'한 틱 진행',exact:true}).click();
  await page.getByRole('tab',{name:'관계',exact:true}).click();
  const detail = page.locator('#npc-detail .attraction-details').first();
  await detail.locator('summary').click();
  await expect(detail.locator('table')).toBeVisible();
  for (const text of ['직업','나이','건강','외모 취향','자산','성격 궁합','매력 포인트']) await expect(detail.locator('tbody')).toContainText(text);
  await expect(detail).toContainText('현재 상태로 계산한 대인 호감');
  await page.getByRole('button',{name:'한 틱 진행',exact:true}).click();
  await expect(detail.locator('table')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await detail.scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/attraction-mobile.png'});
});

test('visual presets, hairstyles and wardrobe persist across save and reload on desktop and mobile',async({page})=>{
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.locator('#create-character').click();
  const form=page.locator('#character-form');await expect(form.locator('[data-hair]')).toHaveCount(9);
  await form.locator('[data-look="starlight"]').click();
  await expect(form.locator('[name="accessory"]')).toHaveValue('headphones');
  await form.locator('[data-hair="braid"]').click();await expect(form.locator('[data-hair="braid"]')).toHaveAttribute('aria-pressed','true');
  await form.getByLabel('얼굴 특징').selectOption('freckles');await form.getByLabel('기본 표정').selectOption('bright');
  await form.getByLabel('이름',{exact:true}).fill('별빛 이웃');
  await page.screenshot({path:'reports/screenshots/v018-creator-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  expect(await form.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'reports/screenshots/v018-creator-mobile.png'});
  await form.getByRole('button',{name:'이 세계에 입주시키기'}).click();
  if (await page.locator('#world-tools summary').isVisible()) await page.locator('#world-tools summary').click();
  await page.getByRole('button',{name:'세계 저장',exact:true}).click();
  const look=await page.evaluate(()=>JSON.parse(localStorage.getItem('living-small-world-v1')!).npcs.find((n:any)=>n.identity.name==='별빛 이웃').profile.appearance);
  expect(look).toMatchObject({hairstyle:'braid',accessory:'headphones',clothing:'vest',faceMark:'freckles',expression:'bright',backdrop:'night'});
  await page.reload();await page.getByRole('button',{name:'마을 주민',exact:true}).click();await page.getByLabel('내가 만든 주민만').check();await page.locator('.resident-card').click();
  await expect(page.locator('#npc-header')).toContainText('별빛 이웃');
});

test('fair creation shows live budgets, balanced presets and lasting starting bonds on mobile', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/?local=1');
  await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.locator('#create-character').click();
  let form=page.locator('#character-form');await form.getByLabel('이름',{exact:true}).fill('첫 친구');
  await form.getByRole('button',{name:'이 세계에 입주시키기'}).click();await expect(form).not.toBeVisible();
  await page.locator('#create-character').click();form=page.locator('#character-form');
  await form.getByLabel('이름',{exact:true}).fill('두 번째 친구');
  await form.getByRole('button',{name:'장인',exact:true}).click();
  await expect(form.locator('#creation-budgets')).toContainText('능력 200 / 200');
  await form.locator('summary').click();await form.getByLabel('교육',{exact:true}).fill('31');
  await expect(form.locator('#creation-budgets')).toContainText('1점 초과');
  await expect(form.getByRole('button',{name:'이 세계에 입주시키기'})).toBeDisabled();
  await form.getByLabel('교육',{exact:true}).fill('30');
  await form.getByLabel('첫 친구 · 시작 친밀도',{exact:true}).fill('60');
  await expect(form.locator('#creation-budgets')).toContainText('시작 친밀도 60 / 120');
  expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await form.locator('#creation-budgets').evaluate(el=>el.scrollIntoView({block:'center'}));
  await page.screenshot({path:'reports/screenshots/v029-creation-mobile.png'});
  await form.getByRole('button',{name:'이 세계에 입주시키기'}).click();await expect(form).not.toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('living-small-world-v1')!));
  const first=saved.npcs.find((n:any)=>n.identity.name==='첫 친구'),second=saved.npcs.find((n:any)=>n.identity.name==='두 번째 친구');
  expect(second.relationships.find((r:any)=>r.npcId===first.id).familiarity).toBe(60);
  expect(first.relationships.find((r:any)=>r.npcId===second.id).familiarity).toBe(60);
  await page.reload();await page.locator('#create-character').click();
  await expect(page.locator('#character-form')).toContainText('첫 친구 · 시작 친밀도');
  await expect(page.locator('#character-form')).toContainText('두 번째 친구 · 시작 친밀도');
  await page.locator('#character-form [name="greetId"]').evaluate((el: HTMLSelectElement)=>{el.add(new Option('이동한 주민','missing'));el.value='missing';});
  await page.locator('#character-form').getByRole('button',{name:'이 세계에 입주시키기'}).click();
  await expect(page.locator('#character-error')).toContainText('인사할 주민');
  await expect(page.locator('#character-form')).toBeVisible();
});
