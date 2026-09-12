import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { integrationKeys } from '../lib/integration-types';

test('optional integrations are visible, accessible, and can be toggled when configured', async ({ page }) => {
  let enabled = false;
  await page.route('**/api/integrations', async (route) => {
    if (route.request().method() === 'POST') enabled = route.request().postDataJSON().enabled;
    await route.fulfill({ json: { canManage: true, integrations: [
      { id: 'calendar', configured: false, enabled: false },
      { id: 'sms', configured: true, enabled },
      { id: 'email', configured: false, enabled: false },
      { id: 'push', configured: false, enabled: false },
    ] } });
  });
  await page.goto('/?view=Integrations');
  await expect(page.getByRole('heading', { name: 'Integrations', exact: true })).toBeVisible();
  const calendar = page.getByRole('switch', { name: 'Google Calendar' });
  await expect(calendar).toBeDisabled();
  await expect(calendar).toHaveAttribute('aria-checked', 'false');
  const sms = page.getByRole('switch', { name: 'Twilio SMS' });
  await sms.focus(); await page.keyboard.press('Space');
  await expect(sms).toHaveAttribute('aria-checked', 'true');
  await sms.click(); await expect(sms).toHaveAttribute('aria-checked', 'false');
  expect((await new AxeBuilder({ page }).include('section[aria-labelledby="integrations-title"]').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(calendar).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '.playwright-runs/integrations-mobile.png', fullPage: true });
});

test('default-off API leaves core state and local recall available', async ({ page }) => {
  const response = await page.request.get('/api/integrations');
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.integrations).toHaveLength(Object.keys(integrationKeys).length);
  expect(data.integrations.every((item: { enabled: boolean }) => item.enabled === false)).toBe(true);
  for (const item of data.integrations) expect(Object.keys(item).sort()).toEqual(['configured', 'enabled', 'fields', 'id']);
  expect((await page.request.get('/api/state')).ok()).toBe(true);
  const chat = await (await page.request.get('/api/chat?recipientId=recipient-alex')).json();
  expect(chat.notificationChannels).toEqual(['in_app']);
  const calendar = await (await page.request.get('/api/calendar?recipientId=recipient-alex')).json();
  expect(calendar.configured).toBe(false);
  expect(calendar.calendars).toEqual([]);
});

test('masked inputs save and reset overrides without discarding other drafts', async ({ page }) => {
  let source = 'environment';
  await page.route('**/api/integrations', async route => {
    if (route.request().method() === 'POST') source = route.request().postDataJSON().config.NTFY_ACCESS_TOKEN === null ? 'environment' : 'override';
    await route.fulfill({ json: { canManage: true, integrations: [
      { id: 'ntfy', configured: true, enabled: false, fields: [{ key: 'NTFY_ACCESS_TOKEN', source }] },
      { id: 'sms', configured: false, enabled: false },
    ] } });
  });
  await page.goto('/?view=Integrations');
  await expect(page.getByRole('link', { name: 'ntfy mobile notifications setup guide (GitHub)' })).toHaveAttribute('href', /notification-setup.md#ntfy-mobile-push$/);
  for (const summary of await page.getByText('Environment configuration', { exact: true }).all()) await summary.click();
  const token = page.getByLabel('NTFY_ACCESS_TOKEN', { exact: true }), sms = page.getByLabel('TWILIO_AUTH_TOKEN', { exact: true });
  await expect(token).toHaveAttribute('type', 'password');
  await expect(token).toHaveAttribute('placeholder', '••••••••');
  await expect(token).toHaveValue('');
  await sms.fill('unsaved-secret'); await token.fill('synthetic-private-override');
  await expect(page.locator('body')).not.toContainText('synthetic-private-override');
  await page.getByRole('button', { name: 'Save configuration', exact: true }).first().click();
  await expect(token).toHaveValue(''); await expect(sms).toHaveValue('unsaved-secret');
  await page.getByRole('button', { name: 'Use environment value', exact: true }).click();
  await page.getByRole('button', { name: 'Save configuration', exact: true }).first().click();
  await expect(page.getByText('Environment · value hidden', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('section[aria-labelledby="integrations-title"]').analyze()).violations).toEqual([]);
});

test('saved ntfy overrides reach notification settings without returning secrets', async ({ page, baseURL }) => {
  const headers = { Origin: baseURL! };
  try {
    const response = await page.request.post('/api/integrations', { headers, data: { id: 'ntfy', enabled: true, config: { NTFY_SERVER_URL: 'https://ntfy.example.test', NTFY_ACCESS_TOKEN: 'synthetic-private-token' } } });
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toContain('synthetic-private-token');
    const status = await page.request.get('/api/integrations');
    expect(await status.text()).not.toContain('synthetic-private-token');
    const preferences = await page.request.get('/api/notifications?recipientId=recipient-alex');
    expect(preferences.ok()).toBe(true);
    const data = await preferences.json();
    expect(data.ntfyServerUrl).toBe('https://ntfy.example.test');
    expect(JSON.stringify(data)).not.toContain('synthetic-private-token');
  } finally {
    const reset = await page.request.post('/api/integrations', { headers, data: { id: 'ntfy', enabled: false, config: { NTFY_SERVER_URL: null, NTFY_ACCESS_TOKEN: null } } });
    expect(reset.ok()).toBe(true);
  }
});
