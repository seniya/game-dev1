import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';

test('followups, physical actions, watch list and grounded family story remain readable on mobile',async({page})=>{
  const sim=new Simulation(42);sim.setLLM(false);const r=sim.snapshot().requests.items[0];sim.respondToRequest(r.id,'food');sim.step(432);
  await page.addInitScript(({save})=>{if(!sessionStorage.getItem('observer-fixture')){localStorage.setItem('living-small-world-v1',save);sessionStorage.setItem('observer-fixture','1');}},{save:sim.save()});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.locator('[data-watch="npc0"]').click();await expect(page.locator('[data-watch="npc0"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#watch-list')).toContainText('하루');
  await expect(page.locator('#observer-content')).toContainText('기록');
  await page.getByRole('button',{name:'오늘',exact:true}).click();await page.locator('#digest-events > summary').click();await expect(page.locator('#digest-events .story-event').first()).toBeVisible();
  await page.locator('#request-archive > summary').click();
  const card=page.locator(`[data-request-card="${r.id}"]`);await expect(card).toContainText('1일 뒤');await expect(card).toContainText('3일 뒤');
  const snapshot=sim.snapshot(),follow=snapshot.requests.items.find(x=>x.id===r.id)!.followups![1];
  await card.locator(`[data-event="${follow.eventId}"]`).click();await expect(page.getByRole('dialog')).toContainText('3일 경과');await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.locator('#character-watch [data-story]').click();await expect(page.getByRole('dialog')).toContainText('관계와 가족의 이야기');await expect(page.locator('#dialog-content .story-event').first()).toBeVisible();
  const evidence=page.locator('#dialog-content .story-evidence button').first();await expect(evidence).toBeVisible();await evidence.click();await expect(page.getByRole('dialog')).toContainText('사건');await page.getByRole('button',{name:'닫기',exact:true}).click();
  await expect(page.locator('#character-watch .activity-card')).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/observer-desktop.png'});
  await page.reload();await page.getByRole('button',{name:'일시정지',exact:true}).click();await expect(page.locator('[data-watch="npc0"]')).toHaveAttribute('aria-pressed','true');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.observer-panel').screenshot({path:'test-results/observer-mobile.png'});expect(errors).toEqual([]);
});

test('server watch preferences travel across pages; digest pagination is frozen and reset clears bookmarks',async({page,request,browser})=>{
  async function command(action:unknown){const w=await(await request.get('/api/world')).json();const response=await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:w.revision,action}});expect(response.ok(),await response.text()).toBe(true);return response.json();}
  await command({type:'reset',seed:7,population:12});await command({type:'ai-mode',mode:'off'});await command({type:'step',ticks:144});
  await page.goto('/');await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.locator('[data-watch="npc0"]').click();await expect(page.locator('#watch-list')).toContainText('하루');
  const second=await browser.newPage();await second.goto('http://127.0.0.1:4173/');await expect(second.locator('#watch-list')).toContainText('하루');await second.close();
  await page.getByRole('button',{name:'어제',exact:true}).click();await page.locator('#digest-events > summary').click();await expect(page.locator('#digest-events .story-event')).toHaveCount(40);
  const oldPeriod=await page.locator('.observer-period').textContent();await page.locator('[data-digest-more]').click();await expect(page.locator('#digest-events .story-event')).toHaveCount(80);expect(await page.locator('.observer-period').textContent()).toBe(oldPeriod);
  const ids=await page.locator('#digest-events .story-event').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-reading-key')));expect(new Set(ids).size).toBe(ids.length);
  await page.reload();await expect(page.locator('#watch-list')).toContainText('하루');await page.getByRole('button',{name:'지난 관찰 이후',exact:true}).click();await expect(page.locator('.observer-period')).toContainText('기록 0건');
  await command({type:'reset',seed:7,population:12});await page.reload();await expect(page.locator('#observer-heading')).toContainText('관심 주민 0/12명');await expect(page.locator('#watch-list')).toBeEmpty();
});

test('late family history cannot replace another open event or a closed dialog',async({page,request})=>{
  let w=await(await request.get('/api/world')).json();await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:w.revision,action:{type:'step',ticks:144}}});
  await page.goto('/');await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  let release!:()=>void;const wait=new Promise<void>(r=>release=r);
  await page.route('**/api/observer?**',async route=>{if(new URL(route.request().url()).searchParams.get('mode')==='story')await wait;await route.continue();});
  await page.locator('#character-watch [data-story]').click();await expect(page.getByRole('dialog')).toContainText('불러오고');await page.getByRole('button',{name:'닫기',exact:true}).click();release();
  await page.waitForResponse(r=>r.url().includes('mode=story'));await expect(page.getByRole('dialog')).not.toBeVisible();
});
