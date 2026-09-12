import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: './tests', outputDir: '.playwright-runs/unit', testMatch: /planning-service\.spec\.ts/, workers: 1 });
