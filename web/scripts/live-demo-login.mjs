import { chromium } from 'playwright';
import { mkdirSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const folder = fileURLToPath(new URL('../.playwright-runs/live-demo/', import.meta.url));
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
await page.goto('https://carestead.com:8083/sign-in');
console.log('Please sign in to Carestead in the newly opened Chrome window, using the account with Google Calendar connected.');
const deadline = Date.now() + 15 * 60_000;
let signedIn = false;
while (Date.now() < deadline) {
  const response = await context.request.get('https://carestead.com:8083/api/auth/session');
  if (response.ok() && !(await response.json()).user?.isGuest) { signedIn = true; break; }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!signedIn) throw new Error('Sign-in was not completed. Run this script again when ready.');
await context.storageState({ path: `${folder}/owner-auth.json` });
chmodSync(`${folder}/owner-auth.json`, 0o600);
console.log('Carestead sign-in ready. Session saved locally in the ignored rehearsal folder.');
await browser.close();
