import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E tests run against already-running dev servers (api :4000, web :3000) so they exercise
 * the same stack a pharmacy uses. Each test registers its own organization through the API, so the
 * suite is safe against any database the API is pointed at.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
