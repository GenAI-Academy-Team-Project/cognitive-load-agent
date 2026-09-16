import { test, expect } from '@playwright/test';
import { inviteCaregiver, secondRecipient } from './accounts';

test('shared sign-up, task completion, scoped chat, recipient switching, calendar, and sign-out use the real backend', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `mobile-pilot-${Date.now()}@example.test`;
  const invitation = await inviteCaregiver(baseURL!, email, 'Mobile Pilot Owner');
  await page.goto(`/sign-up#invitation=${invitation}`);
  await page.getByLabel('Your name').fill('Mobile Pilot Owner');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Carestead mobile pilot password 2026!');
  await page.getByLabel('Confirm password').fill('Carestead mobile pilot password 2026!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Mobile Pilot Owner', level: 1 })).toBeVisible();
  const initial = await (await page.request.get('/api/state')).json();
  const task = initial.tasks.find((item: { status: string }) => !['complete', 'archived'].includes(item.status));
  expect(task).toBeTruthy();
  await page.getByRole('button', { name: 'Responsibilities', exact: true }).click();
  await page.getByRole('group', { name: 'Filter Responsibilities', exact: true }).getByRole('searchbox').fill(task.title);
  await page.getByRole('button', { name: 'Complete', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Responsibility marked complete.' })).toBeVisible();
  const changed = await (await page.request.get(`/api/state?recipientId=${initial.selectedRecipient.id}`)).json();
  expect(changed.tasks.find((item: { id: string }) => item.id === task.id).status).toBe('complete');
  await page.screenshot({ path: 'test-results/mobile-today.png', fullPage: true });

  await page.getByRole('button', { name: 'Care Hand Over', exact: true }).click();
  await expect(page.getByRole('heading', { name: /at a glance/ })).toBeVisible();
  await page.getByRole('button', { name: 'Type instead', exact: true }).click();
  await expect(page.getByRole('heading', { name: `Ask about ${initial.selectedRecipient.display_name}` })).toBeVisible();
  await expect(page.getByText('Preparing the recipient-specific care context…')).toBeHidden();
  await page.getByRole('textbox', { name: /message/i }).fill('What needs attention?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('What needs attention?', { exact: true })).toBeVisible();
  await expect(page.getByText('Checking the care plan…')).toBeHidden();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Care appointments', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const second = await secondRecipient(baseURL!, email);
  await page.getByRole('button', { name: 'Refresh care plan' }).click();
  await expect(page.getByLabel('Care recipient')).toBeEnabled();
  await page.getByLabel('Care recipient').selectOption(second.data.selectedRecipient.id);
  await expect(page.getByText('Carestead · Mobile Second Recipient', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Responsibilities', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Responsibilities', exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/state?recipientId=${second.data.selectedRecipient.id}`)).json()).tasks.some((item: { id: string }) => item.id === task.id)).toBe(false);

  await page.getByRole('button', { name: /Profile settings for/ }).click();
  await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Carestead' })).toBeVisible();
  expect((await page.request.get('/api/auth/session')).status()).toBe(401);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Carestead mobile pilot password 2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good morning, Mobile Pilot Owner', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
