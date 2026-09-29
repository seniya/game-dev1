import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true, channel: process.env.CHROME_REAL_TEST === '1' ? 'chrome' : undefined },
  webServer: { command: 'npm run dev -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
