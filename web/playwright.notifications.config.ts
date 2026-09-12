import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: /(?:notification-service|integration-settings)\.spec\.ts/, workers: 1 });
