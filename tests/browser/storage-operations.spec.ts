import { test, expect, type Page } from '@playwright/test';
async function send(page: Page, action: object) {
  return page.evaluate(async action => {
    const current = await (await fetch('/api/world')).json();
    const response = await fetch('/api/command', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id:crypto.randomUUID(),revision:current.revision,action}) });
    if (!response.ok) throw new Error(await response.text()); return response.json();
  }, action);
}
async function ready(page:Page) { await page.goto('/'); await expect(page.locator('#load-button')).toBeEnabled(); await send(page,{type:'reset',seed:42,population:12}); await page.locator('#cloud-retry').click(); }

test('storage panel is read-only, handles mobile, and restores the server archive without downloading it',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message)); await ready(page);
  const prior=await send(page,{type:'step',ticks:12});
  const current=await send(page,{type:'reset',seed:7}); await page.locator('#cloud-retry').click();
  const paths:string[]=[];page.on('request',r=>paths.push(new URL(r.url()).pathname));
  await page.locator('#load-button').click();
  await expect(page.locator('#storage-status')).toContainText('현재 세계');
  await expect(page.locator('#storage-status')).toContainText('직전 백업');
  await expect(page.locator('#storage-status')).toContainText('DB 전체 사용량이나 요금은 아닙니다');
  await page.locator('#storage-refresh').click();await expect(page.locator('#storage-status')).toContainText('보관 본문');
  expect((await(await page.request.get('/api/world')).json()).revision).toBe(current.revision);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('dialog').screenshot({path:'reports/screenshots/v021-storage-mobile.png'});
  await page.locator('#load-backup').click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  const restored=await(await page.request.get('/api/world')).json();
  expect(restored.epoch).toBe(prior.epoch); expect(restored.state).toEqual(prior.state); expect(restored.meta.backupEpoch).toBe(current.epoch);
  expect(restored.meta.running).toBe(false);expect(paths).not.toContain('/api/export'); expect(paths).not.toContain('/api/export-stream');expect(errors).toEqual([]);
});

test('file import previews validated facts, closing does nothing, explicit apply replaces once',async({page})=>{
  await ready(page);const saved=await(await page.request.get('/api/export')).text();
  const before=await send(page,{type:'reset',seed:7}); await page.locator('#cloud-retry').click();
  const file={name:'world.json',mimeType:'application/json',buffer:Buffer.from(saved)};
  await page.locator('#load-button').click();await page.locator('#file-input').setInputFiles(file);
  await expect(page.getByRole('dialog')).toContainText('가져올 세계 확인');await expect(page.getByRole('dialog')).toContainText('시드 42');
  expect((await(await page.request.get('/api/world')).json()).epoch).toBe(before.epoch);
  await page.keyboard.press('Escape'); expect((await(await page.request.get('/api/world')).json()).epoch).toBe(before.epoch);
  await page.locator('#load-button').click();await page.locator('#file-input').setInputFiles(file);await page.locator('#apply-import').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();const after=await(await page.request.get('/api/world')).json();
  expect(after.state.seed).toBe(42);expect(after.meta.backupEpoch).toBe(before.epoch);expect(after.meta.running).toBe(false);
});

test('invalid and stale previews cannot replace a newer world',async({page})=>{
  await ready(page);const saved=await(await page.request.get('/api/export')).text();const before=await(await page.request.get('/api/world')).json();
  await page.locator('#load-button').click();await page.locator('#file-input').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await expect(page.locator('#apply-import')).toHaveCount(0);expect((await(await page.request.get('/api/world')).json()).epoch).toBe(before.epoch);
  await page.locator('#file-input').setInputFiles({name:'good.json',mimeType:'application/json',buffer:Buffer.from(saved)});await expect(page.locator('#apply-import')).toBeVisible();
  const next=await send(page,{type:'reset',seed:123});
  await page.locator('#apply-import').click();
  await expect(page.locator('#toast')).toContainText(/변경|최신/);
  expect((await(await page.request.get('/api/world')).json()).epoch).toBe(next.epoch);
});
