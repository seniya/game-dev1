import { test, expect, type Page } from '@playwright/test';
import { initialWorld, viewWorld } from '../../src/server/world';
import { Simulation } from '../../src/sim/engine';

async function fixture(page: Page) {
  const world = initialWorld(Date.now()); world.state = new Simulation(42, 12).snapshot(); world.meta.running = false;
  for (const n of world.state.npcs) n.position = { x: 2, y: 12 };
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
  await page.locator('#world-map').click({position:{x:x/960*bounds.width,y:y/720*bounds.height}});
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
