import { test, expect } from '@playwright/test';

test('live progress is visible across devices before autosave and explicit save exports it', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const send = async (action: object) => page.evaluate(async action => {
    const current = await (await fetch('/api/world')).json();
    const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: crypto.randomUUID(), revision: current.revision, action }) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }, action);
  await send({ type: 'reset', seed: 42, population: 12 });
  await send({ type: 'ai-mode', mode: 'off' });
  const saved = await send({ type: 'play', running: true });
  await expect.poll(async () => (await (await page.request.get('/api/world')).json()).state.tick).toBeGreaterThan(saved.state.tick);
  const live = await (await page.request.get('/api/world')).json();
  expect(live.revision).toBe(saved.revision);
  expect(live.live.sequence).toBeGreaterThan(0);
  await expect(page.locator('#save-status')).toContainText('자동 저장');
  const context = await browser.newContext();
  try {
    const other = await context.newPage(); await other.goto('/');
    await expect(other.locator('#save-status')).toContainText('자동 저장');
    const last = live.state.events.at(-1);
    const event = await page.request.get(`/api/events/${last.id}?epoch=${live.epoch}`);
    expect(event.status()).toBe(200);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-button').click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    const after = await (await page.request.get('/api/world')).json();
    expect(after.revision).toBeGreaterThan(saved.revision);
  } finally { await context.close(); await send({ type: 'play', running: false }); }
  expect(errors).toEqual([]);
});
