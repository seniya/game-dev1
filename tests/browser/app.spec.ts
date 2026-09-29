import { test, expect } from '@playwright/test';

test('observe, pause, inspect, experiment, save and restore a world', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '이야기가 자라는 마을' })).toBeVisible();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const before = await page.locator('#game-clock').innerText(); await page.waitForTimeout(850); expect(await page.locator('#game-clock').innerText()).toBe(before);
  await page.getByRole('button', { name: '한 틱 진행' }).click(); expect(await page.locator('#game-clock').innerText()).not.toBe(before);
  await page.locator('.utility-details summary').click(); await page.getByRole('button', { name: '한 틱 진행' }).click(); await expect(page.locator('.utility-details')).toHaveAttribute('open', '');
  await page.getByRole('button', { name: '다음 주민' }).click(); await expect(page.locator('#npc-header')).toContainText('서연');
  await page.getByRole('tab', { name: '관계', exact: true }).click(); await expect(page.locator('#npc-detail')).toContainText('사건으로 이어진 관계');
  await page.getByRole('button', { name: '마을 주민' }).click(); await expect(page.locator('.resident-card')).toHaveCount(12);
  await page.locator('.resident-card').nth(3).click(); await expect(page.locator('#npc-header')).toContainText('민서');
  await page.getByRole('button', { name: '관찰 실험실' }).click(); await page.getByRole('button', { name: '식량 24개 투입' }).click();
  await expect(page.locator('#events')).toContainText('외부 식량 24개');
  await page.getByRole('button', { name: '3일 가뭄 시작' }).click();
  await page.getByRole('button', { name: '세계 관찰' }).click(); await expect(page.locator('#weather')).toContainText('가뭄');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '세계 저장', exact: true }).click(); const saved = await download;
  expect(saved.suggestedFilename()).toMatch(/\.save\.json$/);
  const savedTime = await page.locator('#game-clock').innerText(); await page.getByRole('button', { name: '한 틱 진행' }).click();
  await page.getByRole('button', { name: '불러오기', exact: true }).click(); await page.getByRole('button', { name: '이 기기의 마지막 저장 불러오기' }).click();
  expect(await page.locator('#game-clock').innerText()).toBe(savedTime);
  await page.getByRole('button', { name: '전체 기록 보기' }).click(); await page.getByRole('textbox', { name: '사건 검색' }).fill('외부 식량');
  await page.locator('.event-row').first().click(); await expect(page.getByRole('dialog')).toContainText('관찰 실험'); await page.getByRole('button', { name: '닫기', exact: true }).click();
  expect(errors).toEqual([]);
});

test('reset preserves a separate backup and reload resumes local progress', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '식량 24개 투입' }).click();
  await page.locator('#seed-input').fill('123'); await page.getByRole('button', { name: '새로 시작', exact: true }).click();
  await expect(page.locator('#seed-label')).toHaveText('123');
  await page.reload(); await expect(page.locator('#seed-label')).toHaveText('123');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.getByRole('button', { name: '불러오기', exact: true }).click(); await page.getByRole('button', { name: '초기화 전 세계 백업 불러오기' }).click();
  await expect(page.locator('#seed-label')).toHaveText('42'); await expect(page.locator('#events')).toContainText('외부 식량 24개');
});
test('mobile layout fits the viewport and invalid import preserves the world', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#world-map')).toBeVisible(); const before = await page.locator('#game-clock').innerText();
  await page.locator('#file-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.getByRole('status')).toContainText('저장 파일 형식 오류'); expect(await page.locator('#game-clock').innerText()).toBe(before);
});
