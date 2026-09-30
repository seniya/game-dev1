import { test, expect } from '@playwright/test';
import { initialWorld, viewWorld } from '../../src/server/world';

for (const width of [1440, 390]) test(`reading remains stable across live updates at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  await page.goto('/?local=1'); await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const panel = page.locator('#npc-detail');
  const lifestyle = panel.locator('details').filter({ has: page.locator('summary', { hasText: '욕망과 생활 취향' }) });
  const personality = panel.locator('details').filter({ has: page.locator('summary', { hasText: '성격과 생활 정보' }) });
  await expect(lifestyle).toHaveAttribute('open', '');
  await personality.locator('summary').click();
  await lifestyle.locator('summary').click(); // Same CSS class, independent disclosure state.
  await personality.locator('summary').focus();
  await page.evaluate(()=>document.fonts.ready);
  const before = await panel.evaluate(el => {
    const summary = [...el.querySelectorAll('summary')].find(e => e.textContent === '성격과 생활 정보')!;
    el.scrollTop = summary.offsetTop - (el as HTMLElement).offsetTop - 30;
    Object.assign(window, { readingSummary: summary, readingPanelFirst: el.firstElementChild });
    return { scroll: el.scrollTop, top: summary.getBoundingClientRect().top, rootTop: el.getBoundingClientRect().top, height: el.clientHeight, scrollHeight: el.scrollHeight, pageY: scrollY };
  });
  const clock = await page.locator('#game-clock').innerText();
  const needs = await panel.locator('.needs-list').first().innerText();
  // Invoke the control without moving keyboard focus away from the reader.
  for (let i=0;i<6;i++) await page.locator('#step-button').evaluate((el: HTMLButtonElement)=>el.click());
  expect(await page.locator('#game-clock').innerText()).not.toBe(clock);
  await expect(personality).toHaveAttribute('open',''); await expect(lifestyle).not.toHaveAttribute('open','');
  const after=await panel.evaluate(el=>({rootTop:el.getBoundingClientRect().top,height:el.clientHeight,scrollHeight:el.scrollHeight,pageY:scrollY,scroll:el.scrollTop,top:(window as any).readingSummary.getBoundingClientRect().top,same:el.firstElementChild===(window as any).readingPanelFirst,focused:document.activeElement===(window as any).readingSummary}));
  expect(await panel.locator('.needs-list').first().innerText()).not.toBe(needs);
  expect(after.same).toBe(true); expect(after.focused).toBe(true); expect(Math.abs(after.top-before.top)).toBeLessThan(2);
  await panel.locator('.reason-box').evaluate(el=>{
    const range=document.createRange(); range.selectNodeContents(el); const selection=getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    Object.assign(window,{readingSelection:selection.toString(),readingHTML:document.getElementById('npc-detail')!.innerHTML});
  });
  for(let i=0;i<3;i++) await page.locator('#step-button').evaluate((el:HTMLButtonElement)=>el.click());
  expect(await panel.evaluate(el=>el.innerHTML===(window as any).readingHTML && getSelection()!.toString()===(window as any).readingSelection)).toBe(true);
  await page.evaluate(()=>getSelection()!.removeAllRanges());
  await expect.poll(()=>panel.evaluate(el=>el.innerHTML!==(window as any).readingHTML)).toBe(true);
  await page.locator('#step-button').evaluate((el:HTMLButtonElement)=>el.click());
  await page.locator('#next-npc').evaluate((el:HTMLButtonElement)=>el.click());
  await expect(page.locator('#npc-header')).toContainText('서연');
  expect(await panel.evaluate(el=>el.scrollTop)).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('server life refresh retains old records while a response is pending', async ({ page }) => {
  const world=initialWorld(Date.now()); world.meta.running=false;
  let recordVersion=1, release:(()=>void)|undefined, delayed=false;
  const records=()=>[{id:`life-${recordVersion}`,tick:36,kind:'talk',actorId:'npc0',participants:['npc0'],importance:50,description:`생애 기록 ${recordVersion}`,data:{}}];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/world') return route.fulfill({json:viewWorld(world)});
    if(url.pathname==='/api/command') { world.revision++; world.state.tick++; world.meta.eventCount++; return route.fulfill({json:viewWorld(world)}); }
    if(url.pathname==='/api/events') {
      if(url.searchParams.get('filter')==='life') {
        if(delayed) await new Promise<void>(resolve=>{release=resolve;});
        return route.fulfill({json:{epoch:world.epoch,events:records(),next:null}});
      }
      return route.fulfill({json:{epoch:world.epoch,events:[],next:null,eventCount:0,cursors:{}}});
    }
    if(url.pathname==='/api/ai') return route.fulfill({json:{configured:false,usage:{calls:0,inputTokens:0,outputTokens:0},jobs:[]}});
    return route.fulfill({json:{}});
  });
  await page.goto('/'); await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.getByRole('tab',{name:'생애',exact:true}).click();
  await expect(page.locator('#npc-detail')).toContainText('생애 기록 1');
  delayed=true; recordVersion=2;
  await page.locator('#step-button').click();
  await expect.poll(()=>!!release).toBe(true);
  await expect(page.locator('#npc-detail')).toContainText('생애 기록 1');
  await expect(page.locator('#npc-detail')).not.toContainText('확인하고 있습니다');
  delayed=false; release!();
  await expect(page.locator('#npc-detail')).toContainText('생애 기록 2');
});

test('relationship reordering keeps the same open card and the visible reading position', async ({page})=>{
  const world=initialWorld(Date.now()); world.meta.running=false;
  world.state.npcs[0].relationships=['npc1','npc2','npc3'].map((npcId,i)=>({npcId,trust:70-i*10,familiarity:30,affection:10,fear:0,resentment:0,respect:10,family:false,interpretation:'함께 살아온 이웃입니다.',evidence:[]}));
  await page.route('**/api/**', async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/world') return route.fulfill({json:viewWorld(world)});
    if(path==='/api/command') {
      world.revision++;world.state.tick++;
      world.state.npcs[0].relationships[2].trust=90;
      return route.fulfill({json:viewWorld(world)});
    }
    if(path==='/api/events') return route.fulfill({json:{epoch:world.epoch,events:[],next:null,eventCount:0,cursors:{}}});
    if(path==='/api/ai') return route.fulfill({json:{configured:false,usage:{calls:0,inputTokens:0,outputTokens:0},jobs:[]}});
    return route.fulfill({json:{}});
  });
  await page.goto('/'); await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.getByRole('tab',{name:'관계',exact:true}).click();
  const card=page.locator('[data-reading-key="relationship-npc2"]'), details=card.locator('details');
  await details.locator('summary').click();
  await details.locator('summary').focus();
  await page.evaluate(()=>document.fonts.ready);
  const top=await details.locator('summary').evaluate(el=>{
    const root=document.getElementById('npc-detail')!;
    root.scrollTop+=el.getBoundingClientRect().top-root.getBoundingClientRect().top-20;
    Object.assign(window,{readingRelationship:el.closest('.relationship-card')});
    return el.getBoundingClientRect().top;
  });
  await page.locator('#step-button').evaluate((el:HTMLButtonElement)=>el.click());
  await expect(page.locator('.relationship-card').first()).toHaveAttribute('data-reading-key','relationship-npc3');
  await expect(details).toHaveAttribute('open','');
  expect(await card.evaluate(el=>el===(window as any).readingRelationship)).toBe(true);
  expect(Math.abs(await details.locator('summary').evaluate(el=>el.getBoundingClientRect().top)-top)).toBeLessThan(2);
});
