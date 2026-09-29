import { test, expect } from '@playwright/test';

test('observe, pause, inspect, experiment, save and restore a world', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?local=1'); await expect(page.getByRole('heading', { name: '이야기가 자라는 마을' })).toBeVisible();
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
  await page.goto('/?local=1'); await page.getByRole('button', { name: '일시정지', exact: true }).click();
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
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?local=1');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#world-map')).toBeVisible(); const before = await page.locator('#game-clock').innerText();
  await page.locator('#file-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.getByRole('status')).toContainText('저장 파일 형식 오류'); expect(await page.locator('#game-clock').innerText()).toBe(before);
});

test('daily observations, prices and life history show actual linked events', async ({ page }) => {
  await page.goto('/?local=1'); await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.getByRole('button', { name: '마을 경제', exact: true }).click();
  await expect(page.locator('#economy-view')).toContainText('첫날이 끝나면');
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '하루 관찰 진행', exact: true }).click();
  await page.getByRole('button', { name: '마을 경제', exact: true }).click();
  await expect(page.locator('.history-chart')).toBeVisible();
  await expect(page.locator('.sample-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '가격과 거래', exact: true }).click();
  await expect(page.locator('.sample-table')).toContainText('거래 수량');
  await page.getByRole('button', { name: '사건 보기', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('가격 산정');
  await expect(page.getByRole('dialog')).toContainText('관찰된 사실');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 일별 관측 JSON 내보내기' }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toContain('observations');
  await page.getByRole('button', { name: '세계 관찰', exact: true }).click();
  await page.getByRole('tab', { name: '생애', exact: true }).click();
  await expect(page.locator('#npc-detail')).toContainText('삶의 기록');
  await page.locator('#npc-detail .causal-button').first().click();
  await expect(page.getByRole('dialog')).toContainText('원인에서 이후 선택까지');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '마을 경제', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('server world synchronizes two devices, archives history, exports and restores a backup', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const page = await a.newPage(), other = await b.newPage();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.locator('#seed-input').fill('42'); await page.getByRole('button', { name: '새로 시작', exact: true }).click();
  await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료');
  await other.goto('/'); await expect(other.locator('#seed-label')).toHaveText('42');
  await page.getByRole('button', { name: '하루 관찰 진행', exact: true }).click();
  await expect(page.locator('#game-clock')).toContainText('2일째');
  await expect(other.locator('#game-clock')).toContainText('2일째');
  const time = await page.locator('#game-clock').innerText();
  await page.reload(); await expect(page.locator('#game-clock')).toHaveText(time);
  await page.getByRole('button', { name: '세계의 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 사건', exact: true }).click();
  await expect(page.locator('.event-row')).toHaveCount(40);
  await page.getByRole('button', { name: /이전 기록 더 보기/ }).click();
  await expect(page.locator('.event-row')).toHaveCount(80);
  await page.locator('.event-row').last().click();
  await expect(page.getByRole('dialog')).toContainText('원인에서 이후 선택까지');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('textbox', { name: '사건 검색' }).fill('없는문구xyz');
  await expect(page.locator('#events')).toContainText('이 조건에 맞는 기록이 없습니다');
  await page.getByRole('button', { name: '세계 관찰', exact: true }).click();
  await page.getByRole('tab', { name: '생애', exact: true }).click();
  await expect(page.locator('#npc-detail .causal-button').first()).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '세계 저장', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('server');
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.locator('#seed-input').fill('123'); await page.getByRole('button', { name: '새로 시작', exact: true }).click();
  await expect(page.locator('#seed-label')).toHaveText('123');
  await expect(other.locator('#seed-label')).toHaveText('123');
  await page.getByRole('button', { name: '불러오기', exact: true }).click();
  await page.getByRole('button', { name: '서버의 교체 전 백업 복원', exact: true }).click();
  await expect(page.locator('#seed-label')).toHaveText('42');
  await expect(page.locator('#game-clock')).toHaveText(time);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/server-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  await a.close(); await b.close();
});

test('AI settings distinguish unavailable models and grounded Mock dialogue opens real evidence', async ({ page }) => {
  // Use a page-local API fixture to avoid changing the shared server world used by the two-device test.
  const { Simulation } = await import('../../src/sim/engine');
  const { socialEvent } = await import('../../src/sim/social');
  const { initialWorld, applyCommand, viewWorld } = await import('../../src/server/world');
  let world = initialWorld(Date.now());
  world.state = new Simulation(42).snapshot();
  const [speaker, listener] = world.state.npcs;
  socialEvent(world.state, { kind: 'share', actorId: speaker.id, targetId: listener.id, description: '서로 식량을 나누었던 기억', importance: 60 });
  speaker.relationships.push({ npcId: listener.id, familiarity: 20, trust: 40, affection: 20, fear: 0, resentment: 0, respect: 20, family: false, interpretation: '도움이 기억난다.', evidence: [speaker.memories[0].sourceEventId] });
  world.meta.eventCount = world.state.events.length;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/world') return route.fulfill({ json: viewWorld(world) });
    if (url.pathname === '/api/ai') return route.fulfill({ json: { configured: false, model: null, day: '2026-09-29', dailyLimit: 24, maxOutputTokens: 700, usage: { calls: 0, inputTokens: 0, outputTokens: 0 }, jobs: [] } });
    if (url.pathname === '/api/command') { world = (await applyCommand(world, route.request().postDataJSON(), Date.now())).world; return route.fulfill({ json: viewWorld(world) }); }
    if (url.pathname === '/api/events') return route.fulfill({ json: { epoch: world.epoch, events: [...world.state.events].reverse(), next: null } });
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
    return route.fulfill({ json: { epoch: world.epoch, event: world.state.events.find(e => e.id === id), related: world.state.events } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await expect(page.locator('#ai-status')).toContainText('서버 모델 미연결');
  await expect(page.locator('#ai-mode option[value="remote"]')).toBeDisabled();
  await page.locator('#ai-mode').selectOption('off');
  await expect(page.locator('#llm-toggle')).not.toBeChecked();
  await page.locator('#ai-mode').selectOption('mock');
  await expect(page.locator('#llm-toggle')).toBeChecked();
  await page.getByRole('button', { name: '세계 관찰', exact: true }).click();
  await page.getByRole('tab', { name: '관계', exact: true }).click();
  await page.getByRole('button', { name: '기억에 근거한 말 듣기' }).first().click();
  await expect(page.getByRole('status').filter({ hasText: '기억에 근거한 말을 세계의 기록에 남겼습니다.' })).toBeVisible();
  await page.getByRole('button', { name: '세계의 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 사건', exact: true }).click();
  await page.locator('.event-row').filter({ hasText: '떠올린 말' }).click();
  await expect(page.getByRole('dialog')).toContainText('개인의 기억·해석');
  await expect(page.getByRole('dialog')).toContainText('서로 식량을 나누었던 기억');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-settings-mobile.png', fullPage: true });
});

test('configured model audit displays escaped results, links evidence and exports the saved input', async ({ page }) => {
  const { initialWorld, applyCommand, viewWorld } = await import('../../src/server/world');
  let world = initialWorld(Date.now());
  const source = world.state.events[0], job = { id: 'audit-fixture', epoch: world.epoch, status: 'applied', kind: 'interpretation', attempts: 1, model: 'fixture-model', context: JSON.stringify({ event: source }), result: JSON.stringify({ ok: true, value: { interpretation: '<img src=x onerror=alert(1)>', evidence: [source.id], newGoals: [], relationshipInterpretations: [] } }), error: null };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/world') return route.fulfill({ json: viewWorld(world) });
    if (url.pathname === '/api/command') { world = (await applyCommand(world, route.request().postDataJSON(), Date.now())).world; return route.fulfill({ json: viewWorld(world) }); }
    if (url.pathname === '/api/ai') return route.fulfill({ json: { configured: true, model: 'fixture-model', day: '2026-09-29', dailyLimit: 24, maxOutputTokens: 700, usage: { calls: 1, inputTokens: 100, outputTokens: 40 }, jobs: [job] } });
    if (url.pathname.startsWith('/api/ai/jobs/')) return route.fulfill({ json: job });
    if (url.pathname === '/api/events') return route.fulfill({ json: { epoch: world.epoch, events: world.state.events, next: null } });
    return route.fulfill({ json: { epoch: world.epoch, event: source, related: [source] } });
  });
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await expect(page.locator('#ai-mode option[value="remote"]')).toBeEnabled();
  await page.locator('#ai-mode').selectOption('remote');
  await expect(page.locator('#ai-badge')).toContainText('서버 AI');
  await page.getByText('최근 모델 처리 기록', { exact: true }).click();
  await page.locator('[data-ai-job]').click();
  await expect(page.getByRole('dialog')).toContainText('반영 완료');
  await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '판단 입력·결과 JSON 내보내기' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('living-small-world-ai-audit-fixture.json');
  await page.getByRole('button', { name: `근거 사건 ${source.id}` }).click();
  await expect(page.getByRole('dialog')).toContainText(source.description);
});

test('multiple settlements, focused history and family inspection survive reload on mobile', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?local=1'); await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.locator('#population-input').fill('100'); await page.getByRole('button', { name: '새로 시작', exact: true }).click();
  await expect(page.locator('.settlement-card')).toHaveCount(3);
  await page.locator('[data-village="v1"]').click(); await expect(page.locator('#village-title')).toContainText('강너머');
  await page.locator('#world-detail').selectOption('focused');
  await page.getByRole('tab', { name: '생애', exact: true }).click();
  await expect(page.locator('.family-card')).toContainText('가족과 계승');
  await expect(page.locator('.family-card')).toContainText('12일 = 1년');
  await page.reload(); await expect(page.locator('#world-detail')).toHaveValue('focused');
  await expect(page.locator('#village-title')).toContainText('강너머');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/civilization-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('initial server load recovers automatically after a failed request', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/world', async route => {
    if (++attempts === 1) return route.abort('failed');
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#cloud-status')).toContainText('서버 저장 완료', { timeout: 15000 });
  expect(attempts).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#play-button')).toBeEnabled();
  await expect(page.locator('#world-map')).toBeVisible();
});
