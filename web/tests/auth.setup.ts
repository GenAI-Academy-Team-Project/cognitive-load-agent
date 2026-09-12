import { expect, test as setup } from '@playwright/test';

setup('create the first care-circle owner', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill('Frincy');
  await page.getByLabel('Email address').fill('owner@example.test');
  await page
    .getByLabel('Password', { exact: true })
    .fill('Carestead test password 2026!');
  await page
    .getByLabel('Confirm password', { exact: true })
    .fill('Carestead test password 2026!');
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: /good morning/i }),
  ).toBeVisible();
  const state = await (await page.request.get('/api/state')).json();
  expect(state.currentUser.role).toBe('owner');
  await page.context().storageState({ path: `.playwright-runs/${process.env.CARESTEAD_TEST_PORT || 43179}/auth.json` });
});
