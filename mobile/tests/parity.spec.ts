import { test, expect } from '@playwright/test';
import { inviteCaregiver } from './accounts';

test('full workspace exposes planning, memory, templates, notifications, privacy and account controls', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const password = 'Carestead parity password 2026!';
  const email = `parity-${Date.now()}@example.test`;
  const invitation = await inviteCaregiver(baseURL!, email, 'Parity Owner');
  const response = await page.request.post('/api/auth/sign-up', { headers: { Origin: baseURL! }, data: {
    displayName: 'Parity Owner', email, invitation, password, confirmPassword: password,
  } });
  expect(response.ok(), await response.text()).toBe(true);
  for (const [view, heading] of [
    ['Care plan', /active plan/], ['Care Organizer', 'A little less to remember.'],
    ['Handover', /at a glance/], ['Responsibilities', 'Responsibilities'],
    ['Timeline', 'Activity Log'], ['Memory', 'Trusted care facts'],
    ['Care circle', 'Care circle & permissions'], ['Privacy & data', 'Consent, retention & data'],
    ['Notifications', 'Notifications'], ['Integrations', 'Integrations'],
    ['Calendar', 'Care appointments'], ['Evaluations', 'Measured agent quality'],
  ] as const) {
    await page.goto(`/?view=${encodeURIComponent(view)}`);
    await expect(page.getByRole('heading', { name: heading, exact: typeof heading === 'string' }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), view).toBe(true);
  }
  await page.goto('/?view=Care%20Organizer');
  await page.getByRole('button', { name: 'Organize an update', exact: true }).click();
  await page.getByLabel('Your care update').fill('Collect groceries tomorrow at 11 AM');
  await page.getByRole('button', { name: 'Organize my update' }).click();
  await expect(page.getByLabel('Responsibility title')).toHaveCount(1);
  await page.getByRole('button', { name: 'Prepare reviewed items for approval' }).click();
  let state = await (await page.request.get('/api/state')).json();
  expect(state.tasks.some((task: { title: string }) => task.title.includes('Collect groceries'))).toBe(false);
  await page.getByRole('button', { name: 'Approve and apply', exact: true }).click();
  await expect(page.getByText('applied', { exact: true })).toBeVisible();
  state = await (await page.request.get('/api/state')).json();
  expect(state.tasks.some((task: { title: string }) => task.title.includes('Collect groceries'))).toBe(true);
  await page.goto('/?view=Notifications');
  await page.getByRole('link', { name: 'Account settings → Integrations' }).click();
  await page.getByRole('button', { name: /Manage settings for Email/ }).click();
  await page.getByRole('button', { name: 'Save email preferences', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Notification preferences saved.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: /Profile settings for/ }).click();
  await page.getByRole('menuitem', { name: 'Update password' }).click();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page.getByLabel('New password', { exact: true }).fill('Carestead updated parity password 2026!');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Carestead updated parity password 2026!');
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Password updated');
  expect(errors).toEqual([]);
});


test('password recovery routes render the shared forms and consume reset fragments', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByLabel('Email address').fill('unknown@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account uses that email');
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText('missing or invalid');
  await page.goto('/sign-in');
  await page.goto(`/reset-password#token=${'a'.repeat(64)}`);
  await expect(page.getByLabel('New password', { exact: true })).toBeEnabled();
  expect(new URL(page.url()).hash).toBe('');
});
