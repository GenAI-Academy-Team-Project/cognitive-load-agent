import { chromium } from '../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const baseURL = 'http://127.0.0.1:43621';
const out = 'docs/pitch-deck/assets/current';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
page.setDefaultTimeout(45000);
const report = { capturedAt: new Date().toISOString(), source: 'Current working-tree app, isolated ephemeral database', data: 'Synthetic seeded records', screenshots: [] };
async function ready() { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500); }
try {
  await page.goto(`${baseURL}/${process.env.CARESTEAD_CAPTURE_EXISTING ? 'sign-in' : 'sign-up'}`);
  if (!process.env.CARESTEAD_CAPTURE_EXISTING) await page.getByLabel('Your name').fill('Maya');
  await page.getByLabel('Email address').fill('pitch-current@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Carestead screenshot demo 2026!');
  if (!process.env.CARESTEAD_CAPTURE_EXISTING) await page.getByLabel('Confirm password', { exact: true }).fill('Carestead screenshot demo 2026!');
  await page.getByRole('button', { name: process.env.CARESTEAD_CAPTURE_EXISTING ? 'Sign in' : 'Create account', exact: true }).click();
  await page.getByRole('heading', { name: /good morning/i }).waitFor();
  await ready();
  await page.screenshot({ path: `${out}/overview.png` });
  for (const [view, file] of [['Handover', 'handover'], ['Care plan', 'care-plan'], ['Care Organizer', 'care-organizer']]) {
    await page.goto(`${baseURL}/?view=${encodeURIComponent(view)}`);
    await page.getByRole('button', { name: /ask carestead about/i }).waitFor();
    await ready();
    await page.screenshot({ path: `${out}/${file}.png` });
    report.screenshots.push(file);
  }
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.goto(`${baseURL}/?view=Overview`);
  await page.getByRole('button', { name: /ask carestead about/i }).click();
  const dialog = page.getByRole('dialog');
  await page.getByRole('textbox', { name: /message carestead/i }).fill('What should I review today?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText(/has \d+ open risk/i).last().waitFor();
  await ready();
  await dialog.screenshot({ path: `${out}/voice-chat.png` });
  report.voiceControlsVisible = await page.getByRole('button', { name: 'Start voice input', exact: true }).isVisible();
  report.voiceInputTested = false;
  const before = await (await page.request.get(`${baseURL}/api/state`)).json();
  await page.getByRole('textbox', { name: /message carestead/i }).fill('Reschedule the physiotherapy appointment to tomorrow at 3:30 PM');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const approve = page.getByRole('button', { name: 'Approve', exact: true });
  await approve.waitFor();
  const article = page.locator('article').filter({ has: approve });
  await article.locator('summary').click();
  await approve.scrollIntoViewIfNeeded();
  await ready();
  await article.screenshot({ path: `${out}/chat-approval.png` });
  await dialog.screenshot({ path: `${out}/chat-panel.png` });
  const pending = await (await page.request.get(`${baseURL}/api/state`)).json();
  report.noTaskChangeBeforeApproval = JSON.stringify(before.tasks) === JSON.stringify(pending.tasks);
  assert.ok(report.noTaskChangeBeforeApproval);
  await approve.click();
  await page.getByText(/physiotherapy appointment was rescheduled/i).waitFor();
  const after = await (await page.request.get(`${baseURL}/api/state`)).json();
  report.taskChangedAfterApproval = JSON.stringify(before.tasks) !== JSON.stringify(after.tasks);
  assert.ok(report.taskChangedAfterApproval);
  report.screenshots.push('voice-chat', 'chat-approval', 'chat-panel');
  fs.writeFileSync('docs/pitch-deck/capture-current.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: `${out}/capture-error.png` });
  console.log((await page.locator('body').innerText()).slice(0, 3500));
  throw error;
} finally { await browser.close(); }
