import { test, expect, type Page } from '@playwright/test';
import { database } from '../helpers/database';
import worker from '../../src/server/worker';
import { WorldStore } from '../../src/server/store';
import { applyCommand } from '../../src/server/world';
import { processChrome } from '../../src/server/chrome';
import { socialEvent } from '../../src/sim/social';

async function fixture(page: Page, collected = true) {
  const db = database(), store = new WorldStore(db); await store.init(Date.now());
  const current = await store.read(), result = await applyCommand(current, { id: crypto.randomUUID(), revision: current.revision, action: { type: 'ai-mode', mode: 'chrome' } }, Date.now());
  // Both allowed choices must create a new goal in this acceptance fixture.
  result.world.state.npcs[0].goals = [];
  result.world.state.npcs[0].needs.hunger = 80;
  socialEvent(result.world.state, { kind: 'scarcity', actorId: result.world.state.npcs[0].id, description: '식량 부족', importance: 75 });
  result.world.meta.eventCount = result.world.state.events.length;
  await store.commit(result.world, result.world.state.events.slice(current.state.events.length), 'fixture', crypto.randomUUID());
  // Seed a completed collection window; separate tests cover actual waiting.
  await processChrome(store, Date.now() - (collected ? 60_001 : 0));
  await page.route('**/api/**', async route => {
    const req = route.request(), headers = { ...req.headers(), origin: new URL(req.url()).origin };
    const response = await worker.fetch(new Request(req.url(), { method: req.method(), headers, body: req.postData() }), { DB: db, ASSETS: { fetch: () => new Response('asset') } } as never);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return store;
}
async function mockModel(page: Page, scenario: 'success' | 'download-failure' | 'hang' | 'context-limit' | 'invalid-output' | 'late-download' = 'success') {
  await page.addInitScript(scenario => {
    const stats = { created: 0, prompted: 0, destroyed: 0, measured: 0, inputs: [] as string[], options: [] as unknown[] };
    Object.assign(window, { modelStats: stats });
    const session = () => ({ contextWindow: 1000, contextUsage: 0,
      async measureContextUsage() { stats.measured++; return scenario === 'context-limit' ? 1000 : 500; },
      destroy() { stats.destroyed++; }, async clone() { return session(); }, async prompt(input: string) {
      stats.prompted++; stats.inputs.push(input);
      if (scenario === 'hang') return new Promise<string>(() => {});
      if (scenario === 'invalid-output') return JSON.stringify({ goals: [{ kind: 'invent_resources', evidence: ['not-known'] }] });
      const context = JSON.parse(input.slice(input.indexOf('\n') + 1));
      return JSON.stringify(context.candidates.find((c: any) => c.goals[0].kind === 'expand_farm') ?? context.candidates[0]);
    } });
    Object.assign(window, { LanguageModel: {
      async availability(options: unknown) { stats.options.push(options); return 'downloadable'; },
      async create(options: { monitor: (m: unknown) => void }) {
        stats.created++; stats.options.push(options);
        options.monitor({ addEventListener(_type: string, cb: (e: { loaded: number }) => void) { cb({ loaded: .5 }); } });
        if (scenario === 'download-failure') throw new Error('download failed');
        if (scenario === 'late-download') return new Promise(resolve => Object.assign(window, { finishDownload: () => resolve(session()) }));
        return session();
      },
    } });
  }, scenario);
}
test('Chrome opt-in runs an English goal request through real server validation and shows evidence', async ({ page }) => {
  const store = await fixture(page); await mockModel(page);
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await expect(page.locator('#chrome-status')).toContainText('다운로드가 필요');
  expect(await page.evaluate(() => (window as any).modelStats.created)).toBe(0);
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect.poll(async () => (await store.read()).state.llm.completed).toBe(1);
  const stats = await page.evaluate(() => (window as any).modelStats);
  expect(stats.created).toBe(1); expect(stats.prompted).toBe(1); expect(stats.destroyed).toBeGreaterThan(0);
  expect(stats.measured).toBe(1);
  expect(stats.inputs[0]).not.toMatch(/[가-힣]/);
  expect(stats.options[0].expectedInputs).toEqual([{ type: 'text', languages: ['en'] }]);
  await page.getByRole('button', { name: '세계의 기록', exact: true }).click();
  await page.getByRole('button', { name: '모든 사건', exact: true }).click();
  await page.locator('.event-row').filter({ hasText: 'Chrome AI가 제안한 목표: ' }).click();
  await expect(page.getByRole('dialog')).toContainText('서버가 구성한 한국어');
  await expect(page.getByRole('dialog')).toContainText('식량 부족');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByText('최근 모델 처리 기록', { exact: true }).click();
  await expect(page.locator('[data-chrome-job]')).toContainText('반영 완료');
  await page.locator('[data-chrome-job]').click();
  await expect(page.getByRole('dialog')).toContainText('food_security');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/chrome-settings-mobile.png', fullPage: true });
  expect((await store.db.prepare('SELECT COUNT(*) AS n FROM ai_calls').first<{ n: number }>())!.n).toBe(0);
});
test('unsupported Chrome and failed download preserve the selected world mode and never call external AI', async ({ page }) => {
  const store = await fixture(page);
  await page.addInitScript(() => { Object.defineProperty(window, 'LanguageModel', { value: undefined, configurable: true, writable: true }); });
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await expect(page.locator('#chrome-status')).toContainText('사용할 수 없습니다');
  await expect(page.locator('#chrome-start')).toBeDisabled();
  await expect(page.locator('#ai-mode')).toHaveValue('chrome');
  await page.getByRole('button', { name: '하루 관찰 진행', exact: true }).click();
  await expect(page.locator('#game-clock')).toContainText('2일째');
  await mockModel(page, 'download-failure'); await page.reload();
  await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect(page.locator('#chrome-status')).toContainText('모델 준비에 실패');
  expect((await store.read()).meta.aiMode).toBe('chrome');
  expect((await store.db.prepare('SELECT COUNT(*) AS n FROM ai_calls').first<{ n: number }>())!.n).toBe(0);
});
test('hidden tabs cancel outstanding inference, destroy sessions and cannot start new work', async ({ page }) => {
  const store = await fixture(page); await mockModel(page, 'hang');
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).modelStats.prompted)).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#chrome-status')).toContainText('숨겨진 탭');
  await expect.poll(async () => (await store.read()).state.llm.failed).toBe(1);
  expect(await page.evaluate(() => (window as any).modelStats.destroyed)).toBeGreaterThanOrEqual(2);
  expect((await store.db.prepare('SELECT COUNT(*) AS n FROM ai_calls').first<{ n: number }>())!.n).toBe(0);
});
test('actual browser capability probe is reported separately from mocked model tests', async ({ page, browser }, testInfo) => {
  await page.goto('/?local=1');
  const capability = await page.evaluate(async () => {
    const model = (window as any).LanguageModel;
    return { secureContext: isSecureContext, languageModelPresent: !!model, availability: model ? await model.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }).catch(() => 'failed') : 'unavailable' };
  });
  await testInfo.attach('actual-chrome-capability', { body: JSON.stringify({ browser: browser.version(), ...capability, realInferenceVerified: false }, null, 2), contentType: 'application/json' });
  console.log('Actual browser capability:', JSON.stringify({ browser: browser.version(), ...capability, realInferenceVerified: false }));
});

test('real Chrome model selects a goal without external API credentials', async ({ page, browser }, testInfo) => {
  test.skip(process.env.CHROME_REAL_TEST !== '1', 'Opt-in model download: CHROME_REAL_TEST=1');
  test.setTimeout(720_000);
  const store = await fixture(page);
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  const capability = await page.evaluate(async () => {
    const model = (window as any).LanguageModel;
    return { present: !!model, availability: model ? await model.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }) : 'unavailable' };
  });
  try {
    expect(capability.present, 'The installed Google Chrome must expose the real Prompt API.').toBe(true);
    expect(capability.availability, 'This device cannot run the model; this is not a successful acceptance test.').not.toBe('unavailable');
    await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
    await expect.poll(async () => {
      const text = await page.locator('#chrome-status').innerText();
      if (text.includes('실패')) throw new Error(text);
      const state = (await store.read()).state;
      if (state.llm.failed) throw new Error('Server rejected actual model output');
      return state.llm.completed;
    }, { timeout: 690_000, intervals: [2000] }).toBe(1);
    const state = (await store.read()).state;
    expect(state.events.some(e => e.kind === 'goal' && e.data.model === 'chrome-built-in' && e.description.includes('Chrome AI가 제안한 목표'))).toBe(true);
    expect((await store.db.prepare('SELECT COUNT(*) AS n FROM ai_calls').first<{ n: number }>())!.n).toBe(0);
  } finally {
    const jobs = await store.db.prepare('SELECT context,status,result,error FROM chrome_jobs').all();
    const report = { browser: browser.version(), channel: 'chrome', ...capability, deviceStatus: await page.locator('#chrome-status').innerText(), realInferenceVerified: (await store.read()).state.llm.completed === 1, jobs: jobs.results };
    console.log('Real Chrome inference:', JSON.stringify(report));
    await testInfo.attach('real-chrome-inference', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  }
});

test('Chrome context limit fails before inference and exports bounded diagnostics without lease credentials', async ({ page }) => {
  const store = await fixture(page); await mockModel(page, 'context-limit');
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect(page.locator('#chrome-status')).toContainText('처리 한도를 초과');
  await expect.poll(async () => (await store.read()).state.llm.failed).toBe(1);
  const job = await store.db.prepare('SELECT error,token FROM chrome_jobs').first<{ error: string; token: string }>();
  expect(job!.error).toBe('context_limit');
  expect(await page.evaluate(() => (window as any).modelStats.prompted)).toBe(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '기기 진단 JSON 내보내기' }).click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString(), report = JSON.parse(raw);
  expect(report.attempts).toHaveLength(1);
  expect(report.attempts[0]).toMatchObject({ inputUsage: 1000, contextWindow: 1000, outcome: 'context_limit' });
  expect(raw).not.toContain(job!.token);
  expect(report).not.toHaveProperty('realInferenceVerified');
  await page.getByRole('button', { name: '하루 관찰 진행', exact: true }).click();
  await expect(page.locator('#game-clock')).toContainText('2일째');
  expect((await store.db.prepare('SELECT COUNT(*) AS n FROM ai_calls').first<{ n: number }>())!.n).toBe(0);
});

test('server-rejected model output stops the device instead of consuming more requests', async ({ page }) => {
  const store = await fixture(page); await mockModel(page, 'invalid-output');
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect(page.locator('#chrome-status')).toContainText('목표·근거를 거부');
  await expect.poll(async () => (await store.read()).state.llm.failed).toBe(1);
  await expect(page.locator('#chrome-start')).toBeEnabled();
  await expect(page.locator('#chrome-stop')).toBeDisabled();
  expect((await store.read()).state.llm.completed).toBe(0);
  expect(await page.evaluate(() => (window as any).modelStats.prompted)).toBe(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '기기 진단 JSON 내보내기' }).click();
  const stream = await (await download).createReadStream(), chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const diagnostic = JSON.parse(Buffer.concat(chunks).toString());
  expect(diagnostic.attempts[0].rejectionReason).toBe('invalid_shape');
  expect(diagnostic.attempts[0].elapsedMs).toBeGreaterThan(0);
  expect((await store.db.prepare('SELECT COUNT(*) AS n FROM ai_calls').first<{ n: number }>())!.n).toBe(0);
});

test('server collection and rest windows are visible and do not start extra model calls', async ({ page }) => {
  const store = await fixture(page, false); await mockModel(page);
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect(page.locator('#chrome-status')).toContainText('관련 사건을 모으는 중');
  expect(await page.evaluate(() => (window as any).modelStats.prompted)).toBe(0);
  await store.db.batch([store.db.prepare('UPDATE chrome_jobs SET created=?').bind(Date.now() - 60_001)]);
  await expect.poll(async () => (await store.read()).state.llm.completed).toBe(1);
  await expect(page.locator('#chrome-status')).toContainText('다음 판단까지 쉬는 중');
  expect(await page.evaluate(() => (window as any).modelStats.prompted)).toBe(1);
  for (let i = 0; i < 5; i++) await store.db.batch([store.db.prepare('INSERT INTO chrome_calls VALUES(?,?,?,?,?)').bind(`budget${i}`, 'budget-fixture', new Date().toISOString().slice(0, 10), Date.now(), 'failed')]);
  await expect(page.locator('#chrome-status')).toContainText('최근 1시간 한도 도달');
  expect(await page.evaluate(() => (window as any).modelStats.prompted)).toBe(1);
});

test('cancelled download destroys a late session without activating the device', async ({ page }) => {
  await fixture(page); await mockModel(page, 'late-download');
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect(page.locator('#chrome-progress')).toBeVisible();
  await page.getByRole('button', { name: '지원 다시 확인' }).click();
  await expect(page.locator('#chrome-progress')).toBeVisible();
  await page.getByRole('button', { name: '기기 실행 중단', exact: true }).click();
  await page.evaluate(() => (window as any).finishDownload());
  await expect.poll(() => page.evaluate(() => (window as any).modelStats.destroyed)).toBe(1);
  expect(await page.evaluate(() => (window as any).modelStats.prompted)).toBe(0);
  await expect(page.locator('#chrome-start')).toBeEnabled();
  await expect(page.locator('#chrome-status')).toContainText('실행을 중단');
});

test('Chrome inference timeout cancels the model and records failure while the world remains usable', async ({ page }) => {
  const store = await fixture(page); await mockModel(page, 'hang');
  await page.clock.install();
  await page.goto('/'); await page.getByRole('button', { name: '관찰 실험실' }).click();
  await page.getByRole('button', { name: '이 기기에서 다운로드·활성화' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).modelStats.prompted)).toBe(1);
  await page.clock.fastForward(60_001);
  await expect(page.locator('#chrome-status')).toContainText('실패');
  await expect.poll(async () => (await store.read()).state.llm.failed).toBe(1);
  const job = await store.db.prepare('SELECT error FROM chrome_jobs').first<{ error: string }>();
  expect(job!.error).toBe('timeout');
  await page.getByRole('button', { name: '하루 관찰 진행', exact: true }).click();
  await expect(page.locator('#game-clock')).toContainText('2일째');
  expect((await store.db.prepare('SELECT COUNT(*) AS n FROM ai_calls').first<{ n: number }>())!.n).toBe(0);
});
