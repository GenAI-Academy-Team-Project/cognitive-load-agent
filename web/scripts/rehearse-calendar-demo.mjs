// Optional actual-app rehearsal. Applies the seed's guest-free Google reschedule,
// prepares an UNSENT caregiver update, and captures evidence. Run --clean afterward.
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { demoInstant } from './calendar-demo-time.mjs';

const dir = fileURLToPath(new URL('../.playwright-runs/live-demo/', import.meta.url));
const d = JSON.parse(readFileSync(`${dir}/calendar-demo.local.json`, 'utf8'));
const baseURL = 'https://carestead.com:8083';
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${dir}/owner-auth.json`, viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
try {
  const initial = await (await context.request.get(`/api/calendar?recipientId=${d.recipientId}`)).json();
  const action = initial.actions.find(item => item.id === d.rescheduleId);
  expect(action.status).toBe('pending');
  expect(action.payload.attendees).toEqual([]);
  expect(action.payload.carePlan.changes).toHaveLength(2);
  expect(action.payload.carePlan.conflicts).toEqual([]);
  await page.goto(`/?view=Calendar&recipientId=${d.recipientId}`);
  await expect(page.getByRole('region', { name: 'Linked care changes' })).toContainText('Drive Alex');
  await page.getByRole('region', { name: 'Linked care changes' }).screenshot({ path: `${dir}/calendar-combined-preview.png` });
  await page.getByRole('button', { name: 'Approve change and notify guests', exact: true }).click();
  await expect(page.getByText('Google Calendar and the care plan are updated. You can prepare a caregiver update below.', { exact: true })).toBeVisible({ timeout: 45000 });
  const saved = await (await context.request.get(`/api/state?recipientId=${d.recipientId}`)).json();
  expect(saved.tasks.find(item => item.id === d.taskId).due_at).toBe(demoInstant(d.day, 14));
  expect(saved.tasks.find(item => item.id === d.rideId).due_at).toBe(demoInstant(d.day, 13, 30));
  const confirmed = page.getByRole('region', { name: 'Completed calendar actions' }).locator('li').filter({ hasText: 'Rescheduled' });
  await confirmed.getByRole('button', { name: 'Prepare caregiver update' }).click();
  const composer = page.getByRole('region', { name: 'Compose notification' });
  await expect(composer.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/Drive Alex/);
  await composer.getByLabel('Receiving caregiver').selectOption(d.memberId);
  await composer.getByRole('button', { name: 'Prepare notification', exact: true }).click();
  await expect(composer.getByRole('button', { name: 'Approve and send', exact: true })).toBeVisible();
  await composer.screenshot({ path: `${dir}/calendar-notification-review.png` });
  await page.getByRole('button', { name: 'Ask Carestead about Alex (calendar demo)', exact: true }).click();
  await page.getByRole('textbox', { name: /Message Carestead/ }).fill('What does Alex prefer?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText(/Relevant verified facts:/).first()).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Evidence used' }).first().click();
  await page.screenshot({ path: `${dir}/calendar-memory-evidence.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.getByRole('button', { name: 'Evaluations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Measured agent quality' })).toBeVisible();
  await expect(page.getByText('Reschedule appointment and linked responsibilities', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${dir}/calendar-evaluations.png`, fullPage: true });
  const deliveries = await (await context.request.get(`/api/notifications?recipientId=${d.recipientId}`)).json();
  expect(deliveries.deliveries).toHaveLength(0);
  writeFileSync(`${dir}/calendar-rehearsal-verification.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), recipientId: d.recipientId, realGoogleReschedule: true, linkedRideSaved: true, memoryEvidence: true, evaluationTrace: true, unsentNotificationDraft: true, notificationsSent: 0, microphoneNote: 'Live microphone recognition must be tested manually in the recording browser.' }, null, 2));
  console.log('Actual-app rehearsal passed: Google reschedule, ride update, memory, unsent notification draft, and evaluation trace. Run seed-calendar-demo.mjs --clean before recording.');
} finally { await browser.close(); }
