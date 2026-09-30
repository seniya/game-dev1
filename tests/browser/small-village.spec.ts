import { test, expect } from '@playwright/test';

test('small village preset, real construction, scene evidence and mobile observation work end to end', async ({ page }) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?local=1'); await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await expect(page.locator('#nav-population')).toHaveText('12');
  await expect(page.locator('#map-size')).toHaveText('48 × 36');
  await page.locator('#observation-details > summary').click();
  await expect(page.locator('#observation-board progress')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'농장 짓기 · 목재 16',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'새집 짓기 · 목재 12',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('새집을 지었습니다');
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('living-small-world-v1')!));
  expect(save.storage.wood).toBe(0); expect(save.buildings).toHaveLength(11);
  expect(save.events.some((e:any)=>e.kind==='construction' && e.data.observer)).toBe(true);
  await page.reload(); await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.locator('#observation-details > summary').click();
  await expect(page.getByRole('button',{name:'새집 짓기 · 목재 12',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'12명의 넓은 마을로 시작',exact:true}).click();
  await expect(page.getByRole('button',{name:'새집 짓기 · 목재 12',exact:true})).toBeEnabled();
  const backup=await page.evaluate(()=>JSON.parse(localStorage.getItem('living-small-world-before-reset-v1')!));
  expect(backup.buildings).toHaveLength(11);
  await page.getByRole('button',{name:'관찰 실험실',exact:true}).click();
  await page.getByRole('button',{name:'하루 관찰 진행',exact:true}).click();
  await page.getByRole('button',{name:'세계 관찰',exact:true}).click();
  await page.locator('#observation-board [data-event]').last().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.locator('#toast')).toBeHidden({timeout:6000});
  await page.screenshot({path:'test-results/small-village-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#observation-board')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#observation-board').screenshot({path:'test-results/small-village-mobile.png'});
  expect(errors).toEqual([]);
});


test('server preset backs up the populated world and construction survives reconnection', async ({ page, request }) => {
  const initial=await (await request.get('/api/world')).json();
  const reset=await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:initial.revision,action:{type:'reset',seed:42,population:100}}});
  expect(reset.ok()).toBe(true);
  await page.goto('/'); await expect(page.locator('#nav-population')).toHaveText('100');
  await page.locator('#observation-details > summary').click();
  await page.getByRole('button',{name:'12명의 넓은 마을로 시작',exact:true}).click();
  await expect(page.locator('#nav-population')).toHaveText('12');
  await expect(page.locator('#map-size')).toHaveText('48 × 36');
  const backup=await (await request.get('/api/export?backup=1')).json(); expect(backup.npcs).toHaveLength(100);
  await page.getByRole('button',{name:'새집 짓기 · 목재 12',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('새집을 지었습니다');
  await page.reload(); await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.locator('#observation-details > summary').click();
  await expect(page.getByRole('button',{name:'새집 짓기 · 목재 12',exact:true})).toBeDisabled();
  const saved=await (await request.get('/api/export')).json(); expect(saved.buildings).toHaveLength(11);
  expect(saved.events.some((e:any)=>e.kind==='construction' && e.data.observer)).toBe(true);
});
