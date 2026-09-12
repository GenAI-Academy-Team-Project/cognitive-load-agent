import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.CARESTEAD_TEST_PORT || 43179);

export default defineConfig({
  testDir: './tests',
  // Node's persistence tests start separate servers and share node_modules.
  // Only collect Playwright specs and its authentication setup here.
  testMatch: ['**/*.spec.ts', '**/auth.setup.ts'],
  outputDir: `.playwright-runs/${port}/results`,
  timeout: 60_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    env: { CARESTEAD_TEST: '1' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', testIgnore: /auth\.setup\.ts/, dependencies: ['setup'], use: { ...devices['Desktop Chrome'], storageState: `.playwright-runs/${port}/auth.json` } },
  ],
});
