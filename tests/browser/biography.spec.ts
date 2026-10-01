import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';
import { socialEvent, changeRelationship, appendEvent } from '../../src/sim/social';

test('life introduction, threads, turning points and both perspectives are readable and link to originals',async({page})=>{
  const sim=new Simulation(42),w=sim.snapshot();w.llm.enabled=false;
  const a=w.npcs[0],b=w.npcs[1],e=socialEvent(w,{kind:'share',actorId:a.id,targetId:b.id,importance:75,description:'서로 기억하는 작은 도움'});
  for(let i=0;i<15;i++)appendEvent(w,{kind:'share',actorId:a.id,targetId:b.id,importance:70,description:`함께한 도움 ${i}`});
  changeRelationship(w,a,b.id,{trust:4},e,'친해지고 싶다');changeRelationship(w,b,a.id,{trust:8},e,'큰 도움을 받았다');
  await page.addInitScript(save=>localStorage.setItem('living-small-world-v1',save),JSON.stringify(w));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await expect(page.locator('.life-introduction')).toContainText('바라는 것');
  await page.locator('#character-watch [data-biography]').click();await expect(page.locator('#biography .life-chapter')).toHaveCount(12);await page.locator('[data-life-more]').click();await expect(page.locator('#biography')).toContainText('서로 기억하는 작은 도움');
  await page.locator('#biography-partner').selectOption(b.id);await expect(page.locator('.life-perspectives')).toContainText('친해지고 싶다');await expect(page.locator('.life-perspectives')).toContainText('큰 도움을 받았다');await page.locator('[data-life-more]').click();await expect(page.locator('#biography')).toContainText('서로 기억하는 작은 도움');
  const link=await page.locator('#biography-link').inputValue();expect(link).toContain('partner=npc1');
  await page.locator('#detail-dialog').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'reports/screenshots/v019-biography-desktop.png'});
  await page.setViewportSize({width:390,height:844});expect(await page.getByRole('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.locator('#detail-dialog').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:'reports/screenshots/v019-biography-mobile.png'});
  await page.locator('#biography .life-chapters').locator(`[data-event="${e.id}"]`).first().click();await expect(page.getByRole('dialog')).toContainText('서로 기억하는 작은 도움');await expect(page.locator('#biography')).toHaveCount(0);
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await page.locator('.life-introduction [data-mode="threads"]').click();await expect(page.locator('.life-threads')).toContainText('현재 목표');
  await page.goto(link);await expect(page.locator('.life-perspectives')).toContainText('큰 도움을 받았다');expect(errors).toEqual([]);
});

test('server archive paginates, preserves link across accounts and guards world reset',async({page,browser,request})=>{
  async function command(action:unknown){const w=await(await request.get('/api/world')).json();const r=await request.post('/api/command',{headers:{Origin:'http://127.0.0.1:4173'},data:{id:crypto.randomUUID(),revision:w.revision,action}});expect(r.ok(),await r.text()).toBe(true);return r.json();}
  await command({type:'reset',seed:42,population:12});await command({type:'ai-mode',mode:'off'});await command({type:'step',ticks:144});
  await page.goto('/');await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.locator('#create-character').click();await page.locator('#character-form [name="name"]').fill('이야기의 주인공');await page.locator('#character-form').getByRole('button',{name:/입주/}).click();await expect(page.locator('#npc-header')).toContainText('이야기의 주인공');
  await page.locator('#character-watch [data-biography]').click();await expect(page.locator('#biography .life-chapter').first()).toBeVisible();
  const link=await page.locator('#biography-link').inputValue();
  const visitor=await browser.newContext({extraHTTPHeaders:{'oai-authenticated-user-id':`story-${crypto.randomUUID()}`,'oai-authenticated-user-email':'story@example.test'}});
  try {
    const other=await visitor.newPage();await other.goto(link);await expect(other.locator('#biography h2')).toHaveText(await page.locator('#biography h2').innerText());
    await expect(other.locator('#biography .life-chapter')).toHaveCount(await page.locator('#biography .life-chapter').count());
    if(await page.locator('[data-life-more]').count()){const count=await page.locator('.life-chapter').count();await page.locator('[data-life-more]').click();await expect.poll(()=>page.locator('.life-chapter').count()).toBeGreaterThan(count);}
    await command({type:'reset',seed:7,population:12});await other.goto(link);await other.reload();await expect(other.locator('#biography')).toHaveCount(0);await expect(other.locator('#toast')).toContainText('다른 세계');
  }finally{await visitor.close();}
});

test('delayed history never replaces a closed dialog or a newer story',async({page})=>{
  await page.goto('/');await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  let release!:()=>void;const blocked=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/biography?**',async route=>{if(new URL(route.request().url()).searchParams.get('mode')==='turns')await blocked;await route.continue();});
  await page.locator('#character-watch [data-biography]').click();await expect(page.locator('#biography')).toContainText('불러오고');
  await page.getByRole('button',{name:'닫기',exact:true}).click();await page.locator('.life-introduction [data-mode="threads"]').click();await expect(page.locator('.life-threads')).toBeVisible();
  release();await page.waitForResponse(r=>r.url().includes('/api/biography?')&&r.url().includes('mode=turns'));await expect(page.locator('.life-threads')).toBeVisible();
});
