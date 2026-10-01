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
  await page.getByRole('button', { name: '마을 주민', exact: true }).click();
  await page.locator(`#resident-grid [data-npc="${g.hostId}"]`).click();
  const panel = page.locator('.gatherings-panel'); await panel.locator('summary').click();
  await expect(panel).toContainText('함께 식사'); await expect(panel).toContainText('함께 완료'); await expect(panel).toContainText('직접 전달');
  await panel.locator(`[data-event="${g.sourceEventId}"]`).click();
  await expect(page.getByRole('dialog')).toContainText('약속을 제안했다');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await panel.locator(`[data-event="${g.invitations.find(i => i.status === 'attended')!.responseEventId}"]`).first().click();
  await expect(page.getByRole('dialog')).toContainText('완료'); await expect(page.getByRole('dialog')).toContainText('식량 1개');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(panel).toHaveAttribute('open', '');
  await panel.screenshot({ path: `reports/screenshots/v017-appointments-${mobile ? 'mobile' : 'desktop'}.png` });
  await page.screenshot({ path: `reports/screenshots/v017-gatherings-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
  await panel.locator('[data-place]').first().click();
  await expect(page.locator('#inspector-heading')).toHaveText('장소 들여다보기');
  await expect(page.locator('#npc-detail')).toContainText(w.buildings.find(b => b.id === g.buildingId)!.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('changed appointments show the original request, fresh consent and grounded recurring neighbours', async ({ page }) => {
  const sim = new Simulation(42); sim.setLLM(false);
  let w = sim.snapshot();
  for (let day = 0; day < 30; day++) { sim.step(144); w = sim.snapshot(); if (w.gatherings?.items.some(g => g.schedule && g.invitations.some(i => i.scheduleEventId))) break; }
  const g = w.gatherings!.items.find(g => g.schedule && g.invitations.some(i => i.scheduleEventId))!; expect(g).toBeTruthy();
  await page.goto('/?local=1'); await page.getByRole('button', { name:'일시정지',exact:true }).click();
  await page.locator('#file-input').setInputFiles({name:'rescheduled.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(w))});
  await page.getByRole('button',{name:'마을 주민',exact:true}).click(); await page.locator(`#resident-grid [data-npc="${g.hostId}"]`).click();
  const panel = page.locator('.gatherings-panel'); await panel.locator('summary').click();
  const card = panel.locator(`[data-reading-key="gathering-${g.id}"]`);
  await expect(card).toContainText('시간 조율:'); await expect(card).toContainText('변경 시간 전달');
  await card.locator(`[data-event="${g.schedule!.requestEventId}"]`).click(); await expect(page.getByRole('dialog')).toContainText('시간을 늦추자고');
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  await card.locator(`[data-event="${g.invitations.find(i=>i.scheduleResponseId)!.scheduleResponseId}"]`).first().click(); await expect(page.getByRole('dialog')).toContainText('새 시간');
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  sim.step(144*15); w = sim.snapshot(); const circle = w.gatherings!.circles![0]; expect(circle).toBeTruthy();
  await page.locator('#file-input').setInputFiles({name:'circles.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(w))});
  await page.getByRole('button',{name:'마을 주민',exact:true}).click(); await page.locator(`#resident-grid [data-npc="${circle.hostId}"]`).click();
  if (!await panel.evaluate(el => el.hasAttribute('open'))) await panel.locator('summary').click();
  await expect(panel).toContainText('반복해서 함께한 이웃');
  await panel.locator('.friendship-circles [data-event]').first().click(); await expect(page.getByRole('dialog')).toContainText('완료');
});
