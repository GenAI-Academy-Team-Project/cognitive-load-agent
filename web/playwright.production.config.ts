import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.CARESTEAD_TEST_PORT || 43181);

// Exercise the bundled client: development mode does not reproduce RSC link failures.
export default defineConfig({
  testDir: './tests',
  testMatch: 'auth-navigation.spec.ts',
  outputDir: `.playwright-runs/${port}/results`,
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `npm run build && npm run start -- --ip 127.0.0.1 --port ${port} --inspector-port 0 --persist-to .playwright-runs/${port}/state`,
    url: `http://127.0.0.1:${port}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
