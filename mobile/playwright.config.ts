import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const backendPort = Number(process.env.CARESTEAD_MOBILE_TEST_BACKEND_PORT || 43980);
const mobilePort = Number(process.env.CARESTEAD_MOBILE_TEST_PORT || 43981);
export default defineConfig({
  testDir: './tests', testMatch: '*.spec.ts', workers: 1, timeout: 90000,
  use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', baseURL: `http://127.0.0.1:${mobilePort}`, trace: 'retain-on-failure' },
  webServer: [
    {
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${backendPort} --strictPort`,
      cwd: fileURLToPath(new URL('../web', import.meta.url)),
      env: { CARESTEAD_TEST: '1' },
      url: `http://127.0.0.1:${backendPort}`, reuseExistingServer: false, timeout: 120000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${mobilePort} --strictPort`,
      env: { VITE_CARESTEAD_API_ORIGIN: `http://127.0.0.1:${backendPort}`, CARESTEAD_DEV_API_ORIGIN: `http://127.0.0.1:${backendPort}` },
      url: `http://127.0.0.1:${mobilePort}`, reuseExistingServer: false, timeout: 120000,
    },
  ],
});
