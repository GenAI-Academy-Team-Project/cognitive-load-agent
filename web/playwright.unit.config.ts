import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: './tests', outputDir: '.playwright-runs/unit', testMatch: /(planning-service|password-policy|password-recovery|session-origin)\.spec\.ts/, workers: 1 });
