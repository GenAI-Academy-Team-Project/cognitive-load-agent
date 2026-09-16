import { expect, test } from '@playwright/test';

test('mobile long lists paginate without horizontal overflow', async ({ page, baseURL }) => {
  expect((await page.request.post('/api/auth/guest', { headers: { Origin: baseURL! } })).status()).toBe(200);
  const state = await (await page.request.get('/api/state')).json();
  state.tasks = Array.from({ length: 13 }, (_, i) => ({ ...state.tasks[0], id: `mobile-task-${i}`, title: `Task ${i}`, status: 'open' }));
  state.notifications = Array.from({ length: 13 }, (_, i) => ({ ...state.notifications[0], id: `mobile-notice-${i}`, title: `Update ${i}`, detail: 'Care update', created_at: new Date().toISOString(), kind: 'reminder', read: 0, delivery_state: 'delivered' }));
  await page.route('**/api/state*', (route) => route.fulfill({ json: state }));
  state.currentUser.isGuest = false;
  await page.goto('/?view=Responsibilities');
  for (const label of ['Responsibilities', 'Notifications']) {
    if (label === 'Notifications') await page.getByRole('button', { name: /^Notifications,/ }).click();
    const nav = page.getByRole('navigation', { name: `${label} pagination` });
    await expect(nav).toContainText('1–6 of 13');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('7–12 of 13');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('13–13 of 13');
  }
  await page.goto('/?view=Responsibilities');
  const filters = page.getByRole('group', { name: 'Filter Responsibilities', exact: true });
  await filters.getByRole('searchbox').fill('Task 12');
  await expect(filters).toContainText('1 matching of 13');
  await expect(page.getByText('Task 12', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Responsibilities pagination' })).toHaveCount(0);
  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('navigation', { name: 'Responsibilities pagination' })).toContainText('1–6 of 13');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
