import { expect, test } from '@playwright/test';

test('signed-out account links navigate without client errors', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('[vinext]')) {
      errors.push(message.text());
    }
  });
  try {
    await page.goto('/sign-in');
    await expect(page.getByLabel('Email address')).toBeEnabled();
    await page.getByRole('link', { name: 'Create an account' }).hover();
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByLabel('Your name')).toBeEnabled();
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByLabel('Email address')).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
