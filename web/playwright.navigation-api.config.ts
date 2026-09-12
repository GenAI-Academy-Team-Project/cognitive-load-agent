import { existsSync, writeFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const port = Number(process.env.CARESTEAD_TEST_PORT || 43179);
const https = process.env.CARESTEAD_TEST_HTTPS === '1';
const baseURL = `${https ? 'https' : 'http'}://127.0.0.1:${port}`;
if (https && (!existsSync('.certs/carestead.pem') || !existsSync('.certs/carestead-key.pem'))) throw new Error('HTTPS review tests require the local certificate pair in .certs.');
writeFileSync(`.dev.vars.review-${port}`, `AUTH_PUBLIC_URL=${https ? baseURL : 'https://carestead.com:8083'}\n`, { mode: 0o600 });
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL, ignoreHTTPSErrors: https },
  webServer: { ...(Array.isArray(base.webServer) ? base.webServer[0] : base.webServer), command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, ignoreHTTPSErrors: https, env: { CARESTEAD_TEST: '1', CARESTEAD_TEST_HTTPS: https ? '1' : '0', CARESTEAD_TEST_PORT: String(port), CLOUDFLARE_ENV: `review-${port}` } },
  projects: base.projects!.map(project => project.name === 'setup' ? project : { ...project, testMatch: /navigation-api\.spec\.ts/, use: { ...project.use, storageState: `.playwright-runs/${port}/auth.json` } }),
});
