import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', outputDir: '.playwright-runs/assistance', testMatch: /(optional-assistance|planning-assistance|integration-settings)\.spec\.ts/, workers: 1 });
