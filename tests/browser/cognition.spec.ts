import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';
import { socialEvent } from '../../src/sim/social';
import { applyPlan } from '../../src/sim/cognition';

for (const mobile of [false, true]) test(`daily plan, reflection and original evidence are readable on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?local=1'); await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const w = new Simulation().snapshot(), n = w.npcs[0]; w.tick = 100;
  for (let i = 0; i < 3; i++) socialEvent(w, { kind: 'share', actorId: n.id, targetId: w.npcs[1].id, importance: 65, description: `함께 식량을 나눈 날 ${i + 1}` });
  applyPlan(w, n, []);
  await page.locator('#file-input').setInputFiles({ name: 'cognition.save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(w)) });
  const plan = page.locator('.daily-plan'); await plan.locator('summary').click();
  await expect(plan).toContainText('오늘의 계획'); await expect(plan.locator('li')).toHaveCount(5);
  await expect(plan.locator('[aria-current="step"]')).toContainText('이웃과 교류');
  await page.getByRole('tab', { name: '기억', exact: true }).click();
  await expect(page.locator('.reflection-card')).toHaveCount(1);
  await expect(page.locator('.reflection-card')).toContainText('이웃을 돕고 싶다');
  await page.locator('.reflection-card [data-event]').nth(1).click();
  await expect(page.getByRole('dialog')).toContainText('함께 식량을 나눈 날');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.locator('.memory-retrieval summary').click(); await expect(page.locator('.memory-retrieval')).toContainText('최근성');
  await page.screenshot({ path: `reports/screenshots/v014-cognition-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
