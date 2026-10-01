import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';

for (const mobile of [false, true]) test(`resident appointments show direct invitations, outcomes and place on ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const sim = new Simulation(); sim.setLLM(false); sim.step(144 * 2);
  const w = sim.snapshot(), g = w.gatherings!.items.find(g => g.status === 'completed')!;
  expect(g).toBeTruthy();
  await page.goto('/?local=1'); await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.locator('#file-input').setInputFiles({ name: 'gatherings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(w)) });
  // Select the actual proposer through the resident list without forcing a particular simulated outcome.
  await page.locator(`[data-npc="${g.hostId}"]`).first().click();
  const panel = page.locator('.gatherings-panel'); await panel.locator('summary').click();
  await expect(panel).toContainText('함께 식사'); await expect(panel).toContainText('함께 완료'); await expect(panel).toContainText('직접 전달');
  await panel.locator(`[data-event="${g.sourceEventId}"]`).click();
  await expect(page.getByRole('dialog')).toContainText('약속을 제안했다');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await panel.locator(`[data-event="${g.invitations.find(i => i.status === 'attended')!.responseEventId}"]`).first().click();
  await expect(page.getByRole('dialog')).toContainText('완료'); await expect(page.getByRole('dialog')).toContainText('식량 1개');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(panel).toHaveAttribute('open', '');
  await panel.screenshot({ path: `reports/screenshots/v015-appointments-${mobile ? 'mobile' : 'desktop'}.png` });
  await page.screenshot({ path: `reports/screenshots/v015-gatherings-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
  await panel.locator('[data-place]').first().click();
  await expect(page.locator('#inspector-heading')).toHaveText('장소 들여다보기');
  await expect(page.locator('#npc-detail')).toContainText(w.buildings.find(b => b.id === g.buildingId)!.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
