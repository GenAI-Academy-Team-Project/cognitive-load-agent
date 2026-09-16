import { chromium } from 'playwright';
import { mkdirSync, chmodSync } from 'node:fs';
import { storyConfig } from './story-demo-config.mjs';
const config = storyConfig();
mkdirSync(config.dir, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${config.baseURL}/sign-in`);
  console.log('Sign in with your existing demo owner account. Google connection remains on the server.');
  let signedIn = false;
  for (let i = 0; i < 450; i++) {
    const response = await context.request.get(`${config.baseURL}/api/auth/session`);
    const session = response.ok() ? await response.json() : {};
    await response.dispose();
    if (session.user && !session.user.isGuest) { signedIn = true; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (!signedIn) throw new Error('Sign-in timed out.');
  await context.storageState({ path: `${config.dir}/auth.json` });
  chmodSync(`${config.dir}/auth.json`, 0o600);
  console.log('Saved this deployment’s session. Run npm run demo:seed.');
} finally { await browser.close(); }
