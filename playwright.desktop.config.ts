import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/desktop',
  outputDir: '.desktop-test-results',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:1421',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run desktop:dev:web -- --port 1421',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
