import { test, expect } from '@playwright/test';

for (const width of [320, 390, 430, 768, 1280]) {
  test(`navigation, forms and panels fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?local=1');
    await page.locator('#play-button').click();
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fits();
    if (width <= 760) {
      await expect(page.locator('#world-tools')).not.toHaveAttribute('open');
      await expect(page.locator('#map-options')).not.toHaveAttribute('open');
      const nav = await page.locator('.sidebar').boundingBox();
      expect(nav!.y + nav!.height).toBe(844);
      for (const button of await page.locator('.sidebar nav button').all()) {
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      await page.locator('#map-options summary').click();
    }
    await page.locator('#map-mode').selectOption('follow');
    await expect(page.locator('#world-map')).toHaveAttribute('data-mode', 'follow');
    await fits();
    for (const view of ['residents', 'history', 'economy', 'experiments', 'world']) {
      await page.locator(`[data-view="${view}"]`).click();
      await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute('aria-current', 'page');
      await fits();
    }
    await page.locator('#create-character').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await fits();
    if (width <= 760) {
      const input = page.locator('#dialog-content input:not([type=range]):not([type=checkbox]):not([type=radio])').first();
      expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    }
    await page.locator('#close-dialog').click();
    expect(errors).toEqual([]);
  });
}

test('mobile resident selection, shortcuts and resizing preserve the same live controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?local=1');
  await page.locator('#play-button').click();
  const time = await page.locator('#game-clock').innerText();
  await page.locator('[data-view=residents]').click();
  await page.locator('.resident-card').nth(3).click();
  await expect(page.locator('#npc-header')).toContainText('민서');
  await expect(page.locator('#resident-inspector')).toBeFocused();
  expect((await page.locator('#resident-inspector').boundingBox())!.y).toBeGreaterThanOrEqual(56);
  expect((await page.locator('#resident-inspector').boundingBox())!.y).toBeLessThan(150);
  await page.getByRole('button', { name: '마을 소식', exact: true }).click();
  await expect(page.locator('#world-feed')).toBeFocused();
  await page.getByRole('button', { name: '지도', exact: true }).click();
  await expect(page.locator('#map-panel')).toBeFocused();
  await page.locator('#world-tools summary').click();
  await expect(page.locator('#save-button')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#world-tools')).not.toHaveAttribute('open');
  await expect(page.locator('#world-tools summary')).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#map-panel > #world-feed')).toHaveCount(1);
  await expect(page.locator('#save-button')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#world-view > #world-feed')).toHaveCount(1);
  await expect(page.locator('#world-feed')).toHaveCount(1);
  await expect(page.locator('#npc-header')).toContainText('민서');
  expect(await page.locator('#game-clock').innerText()).toBe(time);
  await page.locator('#immersive-button').click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.world-shortcuts')).toBeHidden();
  await page.locator('#immersive-button').click();
  await expect(page.locator('.sidebar')).toBeVisible();
});
