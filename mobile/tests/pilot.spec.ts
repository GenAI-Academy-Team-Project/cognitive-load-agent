import { test, expect } from '@playwright/test';

test('shared sign-up, task completion, scoped chat, recipient switching, calendar, and sign-out use the real backend', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill('Mobile Pilot Owner');
  await page.getByLabel('Email address').fill('mobile-owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Carestead mobile pilot password 2026');
  await page.getByLabel('Confirm password').fill('Carestead mobile pilot password 2026');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Keep the next step clear.', level: 1 })).toBeVisible();
  const initial = await (await page.request.get('/api/state')).json();
  const task = initial.tasks.find((item: { status: string }) => !['complete', 'archived'].includes(item.status));
  expect(task).toBeTruthy();
  await page.getByRole('button', { name: `Complete ${task.title}`, exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Responsibility completed.');
  const changed = await (await page.request.get(`/api/state?recipientId=${initial.selectedRecipient.id}`)).json();
  expect(changed.tasks.find((item: { id: string }) => item.id === task.id).status).toBe('complete');
  await page.screenshot({ path: 'test-results/mobile-today.png', fullPage: true });

  await page.getByRole('button', { name: 'Handover', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Latest update' })).toBeVisible();
  await page.getByRole('button', { name: /Ask Carestead about/ }).click();
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
  // Create an isolated recipient through the unchanged API; mobile selection reads it directly.
  const second = await page.evaluate(async (templateKey) => {
    const response = await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_recipient', displayName: 'Mobile Second Recipient', templateKey, timezone: 'America/Toronto', consentAccepted: 'true', nonClinicalAcknowledged: 'true' }) });
    return { status: response.status, data: await response.json() };
  }, initial.templates[0].template_key);
  expect(second.status).toBe(200);
  await page.getByRole('button', { name: 'Refresh care plan' }).click();
  await expect(page.getByLabel('Care recipient')).toBeEnabled();
  await page.getByLabel('Care recipient').selectOption(second.data.selectedRecipient.id);
  await expect(page.getByRole('button', { name: 'Ask Carestead about Mobile Second Recipient' })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('button', { name: `Complete ${task.title}`, exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Carestead' })).toBeVisible();
  expect((await page.request.get('/api/auth/session')).status()).toBe(401);
  await page.getByLabel('Email address').fill('mobile-owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Carestead mobile pilot password 2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Keep the next step clear.', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
