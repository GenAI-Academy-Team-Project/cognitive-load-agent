import { existsSync, writeFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const port = Number(process.env.CARESTEAD_TEST_PORT || 43179);
const https = existsSync('.certs/carestead.pem') && existsSync('.certs/carestead-key.pem');
const baseURL = `${https ? 'https' : 'http'}://127.0.0.1:${port}`;
// Use synthetic bindings, never the developer's provider credentials.
writeFileSync(`.dev.vars.integrations-${port}`, `AUTH_PUBLIC_URL=${baseURL}\nINTEGRATION_CONFIG_KEY=${'ab'.repeat(32)}\n`, { mode: 0o600 });
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL, ignoreHTTPSErrors: https },
  webServer: { command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`, ...(Array.isArray(base.webServer) ? base.webServer[0] : base.webServer), url: baseURL, ignoreHTTPSErrors: https, env: { CARESTEAD_TEST: '1', CARESTEAD_TEST_HTTPS: https ? '1' : '0', CLOUDFLARE_ENV: `integrations-${port}` } },
  projects: base.projects!.map(project => project.name === 'setup' ? project : { ...project, testMatch: /integrations\.spec\.ts/ }),
});
