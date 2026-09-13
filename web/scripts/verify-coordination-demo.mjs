import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../.playwright-runs/live-demo/', import.meta.url));
const d = JSON.parse(readFileSync(`${dir}/coordination.local.json`, 'utf8'));
const baseURL = 'https://carestead.com:8083';
const browser = await chromium.launch({ channel: 'chrome' });
const owner = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${dir}/owner-auth.json`, viewport: { width: 1440, height: 960 } });
const helper = await browser.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${dir}/helper-auth.json`, viewport: { width: 1440, height: 960 } });
const page = await owner.newPage();
page.setDefaultTimeout(20000);
const url = view => `/?view=${encodeURIComponent(view)}&recipientId=${d.recipientId}`;
try {
  await page.goto(url('Responsibilities'));
  await expect(page.getByRole('button', { name: /Ask Carestead about/ })).toBeVisible();
  await page.screenshot({ path: `${dir}/01-responsibilities.png`, fullPage: true });
  await page.getByRole('button', { name: /Ask Carestead about/ }).click();
  await page.getByRole('textbox', { name: /Message Carestead/ }).fill('What needs attention today?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Evidence used' }).first().click();
  await page.screenshot({ path: `${dir}/02-evidence.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Care Organizer', exact: true }).first().click();
  await page.getByRole('button', { name: 'What if?', exact: true }).click();
  await page.getByLabel('Responsibility to move').selectOption(d.appointmentId);
  await page.locator('input[type="datetime-local"]').fill(`${d.day}T14:00`);
  await page.getByRole('button', { name: 'Preview the ripple effect' }).click();
  await expect(page.getByText('No conflicts found in the shared availability and responsibilities.')).toBeVisible();
  await page.getByRole('button', { name: 'Prepare changes for approval' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/03-preview.png` });
  await page.getByRole('button', { name: 'Prepare changes for approval' }).click();
  await page.getByRole('button', { name: 'Approve and apply', exact: true }).click();
  await expect(page.getByText('applied', { exact: true }).first()).toBeVisible();
  const stored = await (await owner.request.get(`/api/state?recipientId=${d.recipientId}`)).json();
  expect(stored.tasks.find(t => t.id === d.appointmentId).due_at).toBe(`${d.day}T18:00:00.000Z`);
  expect(stored.tasks.find(t => t.id === d.rideId).due_at).toBe(`${d.day}T17:30:00.000Z`);
  const next = await helper.newPage();
  await next.goto(url('Handover'));
  await expect(next.getByRole('heading', { name: '2 changes since you were away' })).toBeVisible();
  await next.getByText('View change details', { exact: true }).first().click();
  await next.screenshot({ path: `${dir}/04-noah-handover.png`, fullPage: true });
  await page.goto(url('Notifications'));
  const composer = page.getByRole('region', { name: 'Compose notification' });
  await composer.getByRole('button', { name: 'Send a notification', exact: true }).click();
  await composer.getByLabel('Receiving caregiver').selectOption(d.helperId);
  await composer.getByLabel('Notification title', { exact: true }).fill('Alex: appointment and ride updated');
  await composer.getByLabel('Message', { exact: true }).fill('Alex’s physiotherapy on September 14 is now at 2:00 PM. The linked ride is now at 1:30 PM. Noah, please review the revised plan and confirm you can still cover the ride.');
  for (const checkbox of await composer.getByRole('checkbox').all()) { if (await checkbox.isChecked()) await checkbox.uncheck(); }
  await composer.getByRole('checkbox', { name: 'Carestead inbox', exact: true }).check();
  await composer.getByRole('button', { name: 'Prepare notification', exact: true }).click();
  await expect(composer.getByRole('button', { name: 'Approve and send', exact: true })).toBeVisible();
  await composer.screenshot({ path: `${dir}/05-notification-draft.png` });
  // Leave the real draft unsent for the presenter; no message is sent by verification.
  writeFileSync(`${dir}/verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), recipientId: d.recipientId, evidenceVisible: true, preview: 'two changes, zero conflicts', approvedStoredTimes: true, noahHandoverChanges: 2, notificationDraftPrepared: true, notificationSent: false }, null, 2));
  console.log('UI verified: evidence, linked preview, approval, saved times, Noah handover, and unsent notification draft.');
} finally { await browser.close(); }
