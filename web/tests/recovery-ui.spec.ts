import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ storageState: { cookies: [], origins: [] } });
test('recovery navigation, email help and generic confirmation', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Forgot password or email?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByText('Forgot your email address?').click();
  await expect(page.getByText(/Check your password manager/)).toBeVisible();
  await page.route('**/api/auth/forgot-password', async route => {
    expect(route.request().postDataJSON()).toEqual({ email: 'someone@example.test' });
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByLabel('Email address').fill('someone@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account uses that email');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test('reset validates confirmation, removes fragment and shows success', async ({ page }) => {
  const token = 'ab'.repeat(32);
  await page.goto(`/reset-password#token=${token}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('New password', { exact: true }).fill('Replacement password 2026!');
  await page.getByLabel('Confirm new password').fill('different password');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await page.route('**/api/auth/reset-password', async route => {
    expect(route.request().postDataJSON()).toEqual({ token, password: 'Replacement password 2026!', confirmPassword: 'Replacement password 2026!' });
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByLabel('Confirm new password').fill('Replacement password 2026!');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your password has been reset');
});
test('missing token offers a fresh link and API rejects cross-origin requests', async ({ page, request, baseURL }) => {
  await page.goto('/reset-password');
  await expect(page.getByRole('alert')).toContainText('missing or invalid');
  await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toHaveCount(0);
  const crossOrigin = await request.post('/api/auth/forgot-password', { headers: { Origin: 'https://other.example' }, data: { email: 'person@example.test' } });
  expect(crossOrigin.status()).toBe(403);
  const invalid = await request.post('/api/auth/reset-password', { headers: { Origin: baseURL! }, data: { token: 'invalid', password: 'Replacement password 2026!', confirmPassword: 'Replacement password 2026!' } });
  expect(invalid.status()).toBe(400);
  expect(invalid.headers()['cache-control']).toBe('no-store');
});
