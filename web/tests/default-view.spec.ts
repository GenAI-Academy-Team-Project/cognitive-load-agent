import { expect, test } from '@playwright/test';

test('Overview is the default and leaving a Calendar link clears its stale view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Good morning/ })).toBeVisible();
  await page.goto('/?view=Calendar&recipientId=recipient-alex');
  await expect(page.getByRole('button', { name: 'Refresh calendar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).first().click();
  await expect(page).not.toHaveURL(/view=Calendar/);
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Good morning/ })).toBeVisible();
});
