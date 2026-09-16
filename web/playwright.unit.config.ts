import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: '.playwright-runs/unit',
  testMatch:
    /(account-preferences|benchmark|calendar-service|notification-service|integration-settings|llm-agent|planning-service|password-policy|password-recovery|session-origin)\.spec\.ts/,
  workers: 1,
});
