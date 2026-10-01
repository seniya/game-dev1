import { test, expect } from '@playwright/test';

test('invited visitors create and observe in the same world with isolated ownership and owner-only controls', async ({ page, browser }) => {
  await page.goto('/');
  await expect(page.locator('#account-button')).toContainText('소유자');
  await page.evaluate(async () => {
    const w = await (await fetch('/api/world')).json();
    const response = await fetch('/api/command', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:crypto.randomUUID(), revision:w.revision, action:{type:'reset',seed:42,population:12} }) });
    if (!response.ok) throw new Error(await response.text());
  });
  const visitorId = `invited-${crypto.randomUUID()}`;
  const visitor = await browser.newContext({ extraHTTPHeaders: { 'oai-authenticated-user-id': visitorId, 'oai-authenticated-user-email': 'visitor@example.test' } });
  try {
    const other = await visitor.newPage(); const errors: string[] = []; other.on('pageerror', e => errors.push(e.message));
    await other.goto('/');
    await expect(other.locator('#account-button')).toContainText('참여자');
    await expect(other.locator('#play-button')).toBeDisabled(); await expect(other.locator('#load-button')).toBeDisabled();
    await expect(other.locator('#create-character')).toBeEnabled();
    await other.locator('#create-character').click();
    const form = other.locator('#character-form');
    await form.locator('[name="name"]').fill('초대받은 이웃');
    await form.getByRole('button', { name: /입주/ }).click();
    await expect(other.locator('#npc-header')).toContainText('초대받은 이웃');
    await expect(other.locator('#npc-header')).toContainText('내 NPC');
    await other.locator('#account-button').click(); await expect(other.getByRole('dialog')).toContainText('초대받은 이웃');
    await other.getByRole('button', { name:'닫기', exact:true }).click();
    await page.locator('#cloud-retry').click();
    const worlds = await Promise.all([page.request.get('/api/world'), other.request.get('/api/world')]);
    const [a,b] = await Promise.all(worlds.map(r => r.json())); expect(a.epoch).toBe(b.epoch); expect(a.state.npcs).toEqual(b.state.npcs);
    const id = b.state.npcs.find((n: any) => n.identity.name === '초대받은 이웃').id;
    await page.locator('#account-button').click();
    await expect(page.getByRole('dialog')).toContainText('visitor@example.test');
    await page.locator(`[data-member="${visitorId}"]`).click();
    await expect.poll(async () => (await other.request.get('/api/world')).status()).toBe(403);
    await expect(page.locator(`[data-member="${visitorId}"]`)).toHaveText('참여 재개');
    await page.locator(`[data-member="${visitorId}"]`).click(); await expect.poll(async () => (await other.request.get('/api/world')).status()).toBe(200);
    await page.getByRole('button', {name:'닫기',exact:true}).click();
    await page.getByRole('button', { name:'마을 주민', exact:true }).click();
    await page.locator(`#resident-grid [data-npc="${id}"]`).click();
    await expect(page.locator('#npc-header')).toContainText('참여자 NPC');
    expect(errors).toEqual([]);
    await other.setViewportSize({ width:390,height:844 }); await other.locator('#account-button').click();
    await expect(other.getByRole('dialog')).toContainText('내가 만든 NPC');
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await other.screenshot({path:'reports/screenshots/v017-participant-mobile.png', fullPage:true});
  } finally { await visitor.close(); }
});

test('personal stars and last observation follow the same account across contexts without affecting another account',async({page,browser})=>{
  await page.goto('/');await expect(page.locator('#account-button')).toContainText('소유자');
  const w=await(await page.request.get('/api/world')).json();
  const response=await page.request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:w.revision,action:{type:'reset',seed:42,population:12}}});expect(response.ok()).toBe(true);
  const identity={'oai-authenticated-user-id':`personal-${crypto.randomUUID()}`,'oai-authenticated-user-email':'personal@example.test'};
  const one=await browser.newContext({extraHTTPHeaders:identity});const two=await browser.newContext({extraHTTPHeaders:identity});
  try{
    const guest=await one.newPage();await guest.goto('/');
    await expect(guest.locator('#observer-heading')).toContainText('관심 주민 0/12명');
    await expect(guest.locator('[data-watch="npc0"]')).toBeEnabled();await guest.locator('[data-watch="npc0"]').click();
    await expect(guest.locator('#watch-list')).toContainText('하루');
    await page.reload();await expect(page.locator('#watch-list')).toBeEmpty();
    const other=await two.newPage();await other.goto('/');await expect(other.locator('#watch-list')).toContainText('하루');
    const state=await(await guest.request.get('/api/world')).json();
    await guest.request.post('/api/personal-observation',{headers:{Origin:'http://127.0.0.1:4173'},data:{type:'seen',epoch:state.epoch,tick:state.state.tick,through:state.meta.eventCount}});
    await other.reload();await other.locator('[data-digest="since"]').click();await expect(other.locator('.observer-period')).toContainText('기록 0건');
    await other.locator('[data-own-digest]').click();await expect(other.locator('.observer-period')).toContainText('내 NPC');
    await other.setViewportSize({width:390,height:844});expect(await other.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await other.locator('.observer-panel').screenshot({path:'reports/screenshots/v018-personal-observer-mobile.png'});
  }finally{await one.close();await two.close();}
});
