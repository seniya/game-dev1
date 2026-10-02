import {test,expect,type Page} from '@playwright/test';
async function send(page:Page,action:object){return page.evaluate(async action=>{const w=await(await fetch('/api/world')).json();const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),revision:w.revision,action})});if(!r.ok)throw Error(await r.text());return r.json();},action);}
async function ready(page:Page){await page.goto('/');await expect(page.locator('#load-button')).toBeEnabled();await send(page,{type:'reset',seed:42,population:12});await page.locator('#cloud-retry').click();}
test('timed construction, evidence, farm fences and daily history work on mobile',async({page})=>{
 await ready(page);await page.setViewportSize({width:390,height:844});await page.locator('#connection-details summary').click();
 const p=await page.evaluate(async()=>{const w=(await(await fetch('/api/world')).json()).state;const path='/src/sim/frontier.ts';const {buildPosition}=await import(path);for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++)if(buildPosition(w,'v0',{x,y}))return{x,y};throw Error('site');});
 await page.locator('#observation-details').evaluate((d:HTMLDetailsElement)=>d.open=true);await page.locator('#build-position').click();await page.locator('#placed-build [name=x]').fill(String(p.x));await page.locator('#placed-build [name=y]').fill(String(p.y));await page.locator('#placed-build button').click();await expect(page.getByRole('dialog')).not.toBeVisible();
 const a=await(await page.request.get('/api/world')).json();expect(a.state.construction.projects[0].buildingId).toBeUndefined();
 await page.locator('#observation-details').evaluate((d:HTMLDetailsElement)=>d.open=true);await expect(page.locator('#observation-details')).toContainText('공정 0%');
 await expect(page.locator('[data-protect-farm]').first()).toBeDisabled();
 await send(page,{type:'step',ticks:144});await page.locator('#cloud-retry').click();const b=await(await page.request.get('/api/world')).json();expect(b.state.construction.projects[0].buildingId).toBeTruthy();
 await send(page,{type:'reset',seed:42,population:12});await page.locator('#cloud-retry').click();await page.locator('#observation-details').evaluate((d:HTMLDetailsElement)=>d.open=true);await page.locator('[data-protect-farm]').first().click();await expect(page.locator('#observation-details')).toContainText('울타리 보호');
 await page.locator('#world-tools summary').click();await page.locator('#load-button').click();await expect(page.locator('#storage-status')).toContainText('최근 30일 운영 추이');await expect(page.locator('#storage-status table tbody tr')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#storage-status table').scrollIntoViewIfNeeded();await page.getByRole('dialog').screenshot({path:'reports/screenshots/v023-operations.png'});
});
test('follow-up conversation sends server-issued previous ID and new conversation clears it',async({page})=>{
 await ready(page);await send(page,{type:'step',ticks:144});await page.locator('#cloud-retry').click();
 const w=await(await page.request.get('/api/world')).json(),n=w.state.npcs.find((n:{alive:boolean;memories:unknown[]})=>n.alive&&n.memories.length);
 await page.evaluate(id=>{const b=document.createElement('button');b.dataset.npc=id;document.body.append(b);b.click();b.remove();},n.id);
 await page.locator('[data-expression=dialogue]').click();const bodies:Record<string,unknown>[]=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/expressions')bodies.push(r.postDataJSON());});
 await page.locator('#expression-form button[type=submit]').click();await expect(page.locator('#expression-status')).toContainText('저장했습니다');await page.locator('#expression-question').fill('그 이야기를 더 들려줘.');await page.locator('#expression-form button[type=submit]').click();await expect(page.locator('#conversation-history article')).toHaveCount(2);expect(bodies[1].previous).toBeTruthy();
 await page.locator('#conversation-reset').click();await expect(page.locator('#conversation-history article')).toHaveCount(0);await page.locator('#expression-form button[type=submit]').click();await expect(page.locator('#expression-status')).toContainText('저장했습니다');expect(bodies[2].previous).toBeUndefined();await page.getByRole('dialog').screenshot({path:'reports/screenshots/v023-conversation.png'});
});
