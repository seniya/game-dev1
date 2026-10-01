import { test, expect } from '@playwright/test';
import { initialWorld, viewWorld } from '../../src/server/world';

test('server motion covers response jitter and slow syncs restart without an extra polling interval', async ({ page }) => {
  const world = initialWorld(Date.now()); world.meta.running = true;
  const npc = world.state.npcs[0]; npc.position = { x: 10, y: 10 }; npc.currentAction = undefined;
  const starts: number[] = [], ends: number[] = [];
  let inFlight = 0, maxInFlight = 0;
  await page.addInitScript(() => {
    const points: number[][] = [], received: number[] = []; Object.assign(window, { selectedPoints: points, motionReceived: received });
    const fetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      if (String(args[0]).endsWith('/api/command')) received.push(performance.now());
      return response;
    };
    const ellipse = CanvasRenderingContext2D.prototype.ellipse;
    CanvasRenderingContext2D.prototype.ellipse = function (...args: Parameters<typeof ellipse>) {
      if ((this.canvas as HTMLCanvasElement).id === 'world-map' && args[2] === 13 && args[3] === 7) points.push([performance.now(), args[0]]);
      return ellipse.apply(this, args);
    };
  });
  await page.route('**/api/**', async route => {
    if (new URL(route.request().url()).pathname === '/api/personal-observation') return route.fulfill({json:{epoch:world.epoch,watchIds:[],tick:0,through:0,seen:false}});
    if (new URL(route.request().url()).pathname === '/api/session') return route.fulfill({ json: { name: '시험 소유자', role: 'owner', ownNpcIds: [], npcLimit: null, local: true } });
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/world') return route.fulfill({ json: viewWorld(world) });
    if (path === '/api/command') {
      const index = starts.length; starts.push(Date.now()); maxInFlight = Math.max(maxInFlight, ++inFlight);
      if (index === 1 || index === 2) await new Promise(resolve => setTimeout(resolve, index === 1 ? 600 : 2300));
      const from = world.state.tick, x = npc.position.x;
      world.revision++; world.state.tick += 2; npc.position.x += 2;
      await route.fulfill({ json: viewWorld(world, { fromTick: from, toTick: world.state.tick, paths: { [npc.id]: [[x, 10], [x + 1, 10], [x + 2, 10]] } }) });
      ends.push(Date.now()); inFlight--;
      return;
    }
    if (path === '/api/events') return route.fulfill({ json: { epoch: world.epoch, events: [], next: null, eventCount: world.meta.eventCount, cursors: {} } });
    if (path === '/api/ai') return route.fulfill({ json: { configured: false, model: null, day: '2026-09-30', dailyLimit: 24, maxOutputTokens: 700, usage: { calls: 0, inputTokens: 0, outputTokens: 0 }, jobs: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect.poll(() => ends.length, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  const tail = await page.evaluate(() => {
    const end = (window as any).motionReceived[1];
    return (window as any).selectedPoints.filter((p: number[]) => p[0] > end - 300 && p[0] < end - 75);
  });
  expect(tail.length).toBeGreaterThan(3);
  expect(tail.at(-1)[1] - tail[0][1]).toBeGreaterThan(1);
  expect(tail.at(-1)[1]).toBeLessThan(375); // Last confirmed x=12, never extrapolate.
  await expect.poll(() => starts.length, { timeout: 8000 }).toBeGreaterThanOrEqual(4);
  expect(starts[3] - ends[2]).toBeLessThan(700);
  expect(maxInFlight).toBe(1);
});
