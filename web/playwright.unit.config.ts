import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: './tests', outputDir: '.playwright-runs/unit', testMatch: /(calendar-service|notification-service|integration-settings|planning-service|password-policy|password-recovery|session-origin)\.spec\.ts/, workers: 1 });
