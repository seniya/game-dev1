import { test, expect, type Page } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';
import { appendEvent } from '../../src/sim/social';
import { compactWorld } from '../../src/server/world';
import { archiveRecords } from '../../src/shared/archive';
async function send(page:Page,action:object){return page.evaluate(async action=>{const w=await(await fetch('/api/world')).json();const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),revision:w.revision,action})});if(!r.ok)throw Error(await r.text());return r.json();},action);}

test('live scenes keep the map, resident focus, filters and mobile reading legible without changing time',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/?local=1');await page.locator('#play-button').click();await page.locator('#step-button').click();
  const time=await page.locator('#game-clock').innerText(),scene=page.locator('#scene-observatory');
  await expect(scene.locator('.scene-card').first()).toBeVisible();await scene.getByRole('button',{name:'현장 보기'}).first().click();
  await expect(page.locator('#map-focus')).toContainText('지금 바라보는 주민');expect(await page.locator('#game-clock').innerText()).toBe(time);
  await scene.getByRole('button',{name:'일과 준비',exact:true}).click();await expect(scene.getByRole('button',{name:'일과 준비',exact:true})).toBeFocused();await expect(scene.locator('.scene-card.social')).toHaveCount(0);
  await page.locator('#map-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'reports/screenshots/v026-observation-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await scene.scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'reports/screenshots/v026-observation-mobile.png'});
  await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('large archive crosses 24MB, resumes after network failure, previews and restores through real Worker/D1',async({page})=>{
  test.setTimeout(180000);
  await page.goto('/');await expect(page.locator('#load-button')).toBeEnabled();await send(page,{type:'reset',seed:42,population:12});await page.locator('#cloud-retry').click();
  const before=await(await page.request.get('/api/world')).json(),w=new Simulation(123).snapshot();
  for(let i=0;i<5300;i++)appendEvent(w,{kind:'weather',importance:10,description:'큰 이력의 실제 복원 검사',data:{padding:'x'.repeat(5000)}});
  async function* events(){yield* w.events;}const chunks:string[]=[];for await(const line of archiveRecords(compactWorld(w),events(),w.events.length))chunks.push(line);
  const buffer=Buffer.from(chunks.join(''));expect(buffer.length).toBeGreaterThan(24_000_000);
  const file={name:'world.lsw',mimeType:'application/x-ndjson',buffer};
  let interrupted=false;await page.route('**/api/archive-uploads',route=>{const data=route.request().postDataJSON();if(!interrupted&&data.type==='record'&&data.part===5){interrupted=true;return route.abort('failed');}return route.continue();});
  await page.locator('#load-button').click();await page.locator('#file-input').setInputFiles(file);await expect(page.locator('#toast')).toContainText(/fetch|요청|Failed/);
  expect((await(await page.request.get('/api/world')).json()).epoch).toBe(before.epoch);
  let resumedAt=-1;page.on('response',async r=>{if(r.url().endsWith('/api/archive-uploads')&&r.request().postDataJSON().type==='start'&&r.ok())resumedAt=(await r.json()).next;});
  await page.locator('#file-input').setInputFiles(file);await expect(page.locator('#apply-import')).toBeVisible({timeout:150000});expect(resumedAt).toBe(5);
  expect((await(await page.request.get('/api/world')).json()).epoch).toBe(before.epoch);
  await page.locator('#apply-import').click();await expect(page.getByRole('dialog')).not.toBeVisible({timeout:30000});
  const restored=await(await page.request.get('/api/world')).json();expect(restored.state.seed).toBe(123);expect(restored.meta.eventCount).toBe(w.events.length);expect(restored.meta.running).toBe(false);expect(restored.meta.backupEpoch).toBe(before.epoch);
  const response=await page.request.get('/api/export-archive');expect(response.ok()).toBe(true);const exported=(await response.text()).trimEnd().split('\n');expect(JSON.parse(exported.at(-1)!).type).toBe('end');
  expect(exported.filter(l=>JSON.parse(l).type==='events').flatMap(l=>JSON.parse(l).events).length).toBe(w.events.length);
  // Leave subsequent suites a normal small world.
  await send(page,{type:'reset',seed:42,population:12});
});
