import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 120000,
  expect: { timeout: 30000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 }, baseURL: 'http://127.0.0.1:3100', screenshot: 'only-on-failure', trace: 'off', launchOptions: { args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] } },
  webServer: {
    command: 'node node_modules/tsx/dist/cli.mjs tests/browser/server.ts --production', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: false,
    env: { PORT: '3100', DATABASE_PATH: 'data/e2e.sqlite' }, timeout: 120000,
  },
});
