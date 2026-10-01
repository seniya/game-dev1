import { test, expect, type Page } from '@playwright/test';
async function send(page: Page, action: object) {
  return page.evaluate(async (action) => {
    const w = await (await fetch('/api/world')).json();
    const r = await fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(), revision: w.revision, action }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }, action);
}
async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('#load-button')).toBeEnabled();
  await send(page, { type: 'reset', seed: 42, population: 12 });
  await page.locator('#cloud-retry').click();
}

test('operations and replay check explain actual measurements without changing the world', async ({ page }) => {
  await ready(page);
  await page.locator('#load-button').click();
  await expect(page.locator('#storage-status')).toContainText('운영 상태');
  await page.locator('#replay-start').click();
  await expect(page.locator('#replay-status')).toContainText('기록합니다');
  await send(page, { type: 'step', ticks: 12 });
  await page.locator('#replay-check').click();
  await expect(page.locator('#replay-status')).toContainText('일치함');
  const before = await (await page.request.get('/api/world')).json();
  await page.locator('#replay-check').click();
  await expect(page.locator('#replay-status')).toContainText('일치함');
  const after = await (await page.request.get('/api/world')).json();
  expect(after.revision).toBe(before.revision);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('dialog').screenshot({ path: 'reports/screenshots/v022-operations.png' });
});

test('large file browser upload previews and applies an archive above 10MB', async ({ page }) => {
  test.setTimeout(180_000);
  await ready(page);
  const state = await (await page.request.get('/api/export')).json();
  for (let i = 0; i < 3700; i++)
    state.events.push({
      id: `large-browser-${i}`,
      tick: state.tick,
      kind: 'weather',
      participants: [],
      importance: 1,
      description: '가'.repeat(950),
      data: {},
    });
  const buffer = Buffer.from(JSON.stringify(state));
  expect(buffer.length).toBeGreaterThan(10_000_000);
  const before = await send(page, { type: 'reset', seed: 7 });
  await page.locator('#cloud-retry').click();
  await page.locator('#load-button').click();
  await page.locator('#file-input').setInputFiles({ name: 'large-world.json', mimeType: 'application/json', buffer });
  await expect(page.locator('#apply-import')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByRole('dialog')).toContainText('시드 42');
  expect((await (await page.request.get('/api/world')).json()).epoch).toBe(before.epoch);
  await page.locator('#apply-import').click();
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 30_000 });
  const after = await (await page.request.get('/api/world')).json();
  expect(after.meta.eventCount).toBe(state.events.length);
  expect(after.meta.backupEpoch).toBe(before.epoch);
  expect(after.meta.running).toBe(false);
});

test('positioned home, land sale, wildlife and grounded mock reflection are usable from the UI', async ({ page }) => {
  await ready(page);
  const before = await (await page.request.get('/api/world')).json();
  const position = await page.evaluate(async () => {
    const w = (await (await fetch('/api/world')).json()).state;
    const path = '/src/sim/frontier.ts';
    const { buildPosition } = await import(path);
    for (let y = 0; y < w.height; y++)
      for (let x = 0; x < w.width; x++) if (buildPosition(w, w.civilization.focus, { x, y })) return { x, y };
    throw new Error('No build site');
  });
  await page.locator('#observation-details').evaluate((el: HTMLDetailsElement) => (el.open = true));
  await page.locator('#build-position').click();
  await page.locator('#placed-build [name=x]').fill(String(position.x));
  await page.locator('#placed-build [name=y]').fill(String(position.y));
  await page.locator('#placed-build button').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const built = await (await page.request.get('/api/world')).json();
  expect(built.state.buildings.length).toBe(before.state.buildings.length + 1);
  await page.locator('#observation-details').evaluate((el: HTMLDetailsElement) => (el.open = true));
  await page.locator('#land-market').click();
  await page.locator('#land-trade button').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await send(page, { type: 'step', ticks: 144 });
  await page.locator('#cloud-retry').click();
  const w = await (await page.request.get('/api/world')).json();
  expect(w.state.frontier.animals.length).toBeGreaterThan(0);
  const n = w.state.npcs.find((n: { alive: boolean; memories: unknown[] }) => n.alive && n.memories.length);
  await page.evaluate((id) => {
    const button = document.createElement('button');
    button.dataset.npc = id;
    document.body.append(button);
    button.click();
    button.remove();
  }, n.id);
  await page.locator('[data-expression=reflection]').click();
  await page.locator('#expression-form button').click();
  await expect(page.locator('#expression-status')).toContainText('저장했습니다');
  const after = await (await page.request.get('/api/world')).json();
  expect(after.state.events.some((e: { data: { expression?: string } }) => e.data.expression === 'reflection')).toBe(
    true,
  );
  await page.getByRole('dialog').screenshot({ path: 'reports/screenshots/v022-expression.png' });
});

test('Chrome Korean unsupported rejects locally without any external request', async ({ page }) => {
  await ready(page);
  await send(page, { type: 'step', ticks: 144 });
  await send(page, { type: 'ai-mode', mode: 'chrome' });
  await page.locator('#cloud-retry').click();
  await page.evaluate(() => {
    Object.defineProperty(globalThis, 'LanguageModel', {
      configurable: true,
      value: { create: () => Promise.reject(new DOMException('Unsupported language', 'NotSupportedError')) },
    });
  });
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') requests.push(new URL(r.url()).pathname);
  });
  await page.locator('[data-expression=dialogue]').click();
  await page.locator('#expression-form button').click();
  await expect(page.locator('#expression-status')).toContainText('완료하지 못했습니다');
  expect(requests).not.toContain('/api/expressions');
});
