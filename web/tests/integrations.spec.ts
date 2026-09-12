import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  expect(data.integrations).toHaveLength(6);
  expect(data.integrations.every((item: { enabled: boolean }) => item.enabled === false)).toBe(true);
  for (const item of data.integrations) expect(Object.keys(item).sort()).toEqual(['configured', 'enabled', 'id']);
  expect((await page.request.get('/api/state')).ok()).toBe(true);
  const chat = await (await page.request.get('/api/chat?recipientId=recipient-alex')).json();
  expect(chat.notificationChannels).toEqual(['in_app']);
  expect(chat.memory.configured).toBe(false);
  const calendar = await (await page.request.get('/api/calendar?recipientId=recipient-alex')).json();
  expect(calendar.configured).toBe(false);
  expect(calendar.calendars).toEqual([]);
});
