import { test, expect, type Page } from '@playwright/test';
import { initialWorld, viewWorld } from '../../src/server/world';
import { Simulation } from '../../src/sim/engine';

async function fixture(page: Page, customize?: (world: ReturnType<typeof initialWorld>) => void) {
  const world = initialWorld(Date.now()); world.state = new Simulation(42, 12).snapshot(); world.meta.running = false;
  for (const n of world.state.npcs) n.position = { x: 2, y: 12 };
  customize?.(world);
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/world' || path === '/api/command') return route.fulfill({ json: viewWorld(world) });
    if (path === '/api/events') return route.fulfill({ json: { epoch: world.epoch, events: [], next: null, eventCount: 0, cursors: {} } });
    if (path === '/api/ai') return route.fulfill({ json: { configured: false, dailyLimit: 24, maxOutputTokens: 700, usage: {calls:0,inputTokens:0,outputTokens:0}, jobs: [] } });
    return route.fulfill({json:{}});
  });
  await page.goto('/'); await expect(page.getByRole('button',{name:'재생',exact:true})).toBeVisible();
  return world;
}
async function clickMap(page: Page, x: number, y: number) {
  const bounds = (await page.locator('#world-map').boundingBox())!;
  await page.locator('#world-map').click({position:{x:x/1440*bounds.width,y:y/1080*bounds.height}});
}

test('canvas selects roofs and resources, keyboard selection opens live facts and residents remain reachable', async ({ page }) => {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  const world = await fixture(page), w = world.state;
  const home = w.buildings.find(b=>b.kind==='home')!;
  await clickMap(page,(home.position.x+.5)*30,(home.position.y+.5)*30-25);
  await expect(page.locator('[data-object-id]')).toHaveAttribute('data-object-id',home.id);
  await expect(page.locator('#npc-detail')).toContainText('거주 인원');
  await expect(page.locator('.inspector-tabs')).toBeHidden();
  await page.locator('.object-person').first().click(); await expect(page.locator('.inspector-tabs')).toBeVisible();
  await expect(page.locator('#world-map')).toHaveAttribute('data-mode','follow');
  await page.locator('#map-mode').selectOption('city');
  const resource = w.resources.find(r=>r.kind==='food')!;
  await clickMap(page,(resource.position.x+.5)*30,(resource.position.y+.5)*30);
  await expect(page.locator('[data-object-id]')).toHaveAttribute('data-object-id',resource.id);
  await expect(page.locator('#npc-detail')).toContainText('남은 자원');
  // Select without a pointer; changing world data must refresh the open inspector.
  const well=w.buildings.find(b=>b.kind==='well')!;
  await page.locator('#object-picker').selectOption(`building:${well.id}`); await expect(page.locator('#npc-detail')).toContainText('갈증과 청결');
  await page.locator('#object-picker').selectOption(`resource:${resource.id}`);
  resource.amount=0; world.revision++;
  await expect(page.locator('#npc-detail')).toContainText('고갈',{timeout:7000});
  await page.locator('#map-mode').selectOption('region'); await expect(page.locator('#world-map')).toHaveAttribute('data-object','');
  await page.screenshot({path:'test-results/objects-region.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('mobile and reduced motion support object details and status portraits without overflow', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.emulateMedia({reducedMotion:'reduce'});
  const world=await fixture(page), w=world.state;
  const storage=w.buildings.find(b=>b.kind==='storage')!;
  await page.locator('#object-picker').selectOption(`building:${storage.id}`);
  await expect(page.locator('#npc-detail')).toContainText('공동 식량');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/objects-mobile.png'});
  await page.getByRole('button',{name:'주민으로 돌아가기',exact:true}).click();
  const npc=w.npcs[0]; npc.needs.health=15; world.revision++;
  await expect(page.locator('#npc-header [data-state="unwell"]').first()).toBeVisible({timeout:7000});
  await expect(page.locator('#npc-header')).toContainText('몸이 불편해요');
});

test('crowded labels avoid each other at all zoom levels and on mobile, with selected and hovered names preserved', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(() => {
    const state = { labels: [] as {text:string;x:number;y:number;width:number;height:number}[], cachedTexts: [] as string[] };
    Object.assign(window, { mapLabelCapture: state });
    const clear = CanvasRenderingContext2D.prototype.clearRect, round = CanvasRenderingContext2D.prototype.roundRect, text = CanvasRenderingContext2D.prototype.fillText;
    let last = {x:0,y:0,width:0,height:0};
    CanvasRenderingContext2D.prototype.clearRect = function (...args: Parameters<typeof clear>) {
      if ((this.canvas as HTMLCanvasElement).id === 'world-map') state.labels = [];
      return clear.apply(this,args);
    };
    CanvasRenderingContext2D.prototype.roundRect = function (...args: Parameters<typeof round>) {
      if ((this.canvas as HTMLCanvasElement).id === 'world-map') {
        const m = this.getTransform(), p = m.transformPoint({x:args[0],y:args[1]});
        last = {x:p.x,y:p.y,width:args[2]*m.a,height:args[3]*m.d};
      }
      return round.apply(this,args);
    };
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof text>) {
      if ((this.canvas as HTMLCanvasElement).id === 'world-map') state.labels.push({...last,text:args[0]});
      else if (!(this.canvas as HTMLCanvasElement).isConnected) state.cachedTexts.push(args[0]);
      return text.apply(this,args);
    };
  });
  const world = await fixture(page, world => {
    const w = world.state;
    for (let i=0;i<8;i++) {
      const b = {...w.buildings[2],id:`dense${i}`,name:`가까운 작업장 ${i}`,position:{x:12+i%4,y:10+Math.floor(i/4)}};
      w.buildings.push(b); w.urban.buildings[b.id] = { condition: 100, maintenance: 1 };
      w.urban.enterprises.push({id:`enterprise${i}`,buildingId:b.id,settlementId:'v0',kind:i%2 ? 'tailoring' : 'smith',workers:[],capacity:4,wage:2,output:0});
    }
    for(const n of w.npcs) { n.position={x:10,y:10}; n.needs.fatigue=90; }
  });
  const check = async () => {
    const capture = await page.evaluate(() => (window as any).mapLabelCapture);
    expect(capture.labels.length).toBeGreaterThan(0); expect(capture.cachedTexts).toEqual([]);
    for (let i=0;i<capture.labels.length;i++) {
      const a=capture.labels[i]; expect(a.x).toBeGreaterThanOrEqual(0); expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x+a.width).toBeLessThanOrEqual(960.1); expect(a.y+a.height).toBeLessThanOrEqual(720.1);
      for(const b of capture.labels.slice(i+1)) expect(a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y).toBe(false);
    }
    return capture.labels as {text:string}[];
  };
  await check();
  await clickMap(page,12.5*30,10.5*30-30);
  await page.locator('#object-picker').selectOption('building:dense0');
  expect((await check()).filter(l=>l.text==='가까운 작업장 0')).toHaveLength(1);
  await page.locator('#world-map').screenshot({path:'test-results/labels-dense-desktop.png'});
  await page.locator('#map-mode').selectOption('region'); await check();
  await page.locator('#map-mode').selectOption('city');
  // Hovering a crowded building promotes its name without clicking or changing the world.
  const rect=(await page.locator('#world-map').boundingBox())!;
  await page.locator('#world-map').hover({position:{x:15.5/48*rect.width,y:(10.5-1)/36*rect.height}});
  expect((await check()).some(l=>l.text==='가까운 작업장 3')).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#object-picker').selectOption('building:dense0');
  expect((await check()).filter(l=>l.text==='가까운 작업장 0')).toHaveLength(1);
  await page.locator('#world-map').screenshot({path:'test-results/labels-dense-mobile.png'});
  await page.setViewportSize({width:360,height:740});
  await page.waitForTimeout(100); await check(); // A paused world must relayout on resize.
  expect(world.meta.running).toBe(false); expect(errors).toEqual([]);
});
