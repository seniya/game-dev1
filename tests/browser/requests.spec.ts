import { test, expect } from '@playwright/test';

test('first request reaches an evidenced result, persists, and fits desktop and mobile', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/?local=1');await page.getByRole('button',{name:'부탁과 결과 살펴보기 ↓',exact:true}).click();await page.getByRole('button',{name:'부탁 읽으며 잠시 멈추기',exact:true}).click();
  const board=page.locator('#requests-panel');
  await expect(board).toContainText('다음 끼니를 부탁해요');
  await expect(page.locator('#living-overview')).not.toHaveAttribute('open','');
  await expect(page.locator('#observation-details')).not.toHaveAttribute('open','');
  const card=board.locator('[data-status="open"]').first(), id=await card.getAttribute('data-request-card');
  await expect(card.locator('[data-choice="farm"]')).toBeDisabled();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:'test-results/requests-desktop.png'});
  await card.locator('[data-choice="food"]').click();
  const supported=board.locator(`[data-request-card="${id}"]`);
  await expect(supported).toHaveAttribute('data-status','observing');
  await expect(supported).toContainText('지원 직후');
  await supported.locator('[data-observe-request]').click();
  await expect(supported).toHaveAttribute('data-status','completed');
  await expect(supported).toContainText('2시간 뒤');
  await expect(page.getByRole('button',{name:'재생',exact:true})).toBeVisible();
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('living-small-world-v1')!));
  const result=save.requests.items.find((r:any)=>r.id===id);expect(result.after).toBeTruthy();
  expect(save.npcs.find((n:any)=>n.id===result.npcId).memories.some((m:any)=>m.sourceEventId===result.decisionEventId)).toBe(true);
  await supported.locator(`[data-event="${result.resultEventId}"]`).click();await expect(page.getByRole('dialog')).toContainText('관찰했다');
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await expect(board.locator(`[data-request-card="${id}"]`)).toHaveAttribute('data-status','completed');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#toast')).toBeHidden({timeout:6000});
  await board.screenshot({path:'test-results/requests-mobile.png'});expect(errors).toEqual([]);
});

test('server request spends once and retains result through reload; disclosure stays closed during updates', async ({page,request})=>{
  const initial=await (await request.get('/api/world')).json();
  const reset=await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:initial.revision,action:{type:'reset',seed:42,population:12}}});expect(reset.ok()).toBe(true);
  const fresh=await reset.json(), r=fresh.state.requests.items[0];
  await page.goto('/');await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.locator(`[data-request="${r.id}"][data-choice="food"]`).click();
  await expect(page.locator(`[data-request-card="${r.id}"]`)).toHaveAttribute('data-status','observing');
  const supported=await (await request.get('/api/export')).json();expect(supported.storage.food).toBe(fresh.state.storage.food-2);
  await page.reload();await expect(page.locator('[data-observe-request]')).toBeEnabled();await page.locator('[data-observe-request]').click();
  await expect(page.locator(`[data-request-card="${r.id}"]`)).toHaveAttribute('data-status','completed');
  await page.locator('#request-latest > summary').click();
  await page.locator('#living-overview > summary').click();
  await page.locator('#step-button').click();
  await expect(page.locator('#request-latest')).not.toHaveAttribute('open','');
  await expect(page.locator('#living-overview')).toHaveAttribute('open','');
  await page.reload();await expect(page.locator(`[data-request-card="${r.id}"]`)).toHaveAttribute('data-status','completed');
});

test('deferring costs nothing and persists a concrete return time', async ({page})=>{
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  const card=page.locator('#requests-panel [data-status="open"]').first();
  await card.locator('[data-choice="later"]').click();await expect(card).toHaveCount(0);
  await expect(page.locator('#requests-panel [data-status="deferred"]')).toContainText('다시 보여 드립니다');
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('living-small-world-v1')!));expect(save.requests.items[0].status).toBe('deferred');expect(save.requests.items[0].immediate).toBeUndefined();
});
