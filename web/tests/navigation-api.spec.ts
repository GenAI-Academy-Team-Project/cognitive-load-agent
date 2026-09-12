import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`sidebar labels, icons and Demo disclosure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
    const demo = page.getByRole('button', { name: 'Demo', exact: true });
    const evaluations = page.getByRole('button', { name: 'Evaluations', exact: true });
    await expect(demo).toHaveAttribute('aria-expanded', 'false');
    await expect(evaluations).toHaveCount(0);
    await demo.click();
    await expect(demo).toHaveAttribute('aria-expanded', 'true');
    await evaluations.click();
    await expect(evaluations).toHaveAttribute('aria-current', 'page');
    await demo.click();
    await expect(demo).toHaveAttribute('aria-expanded', 'false');
    await expect(evaluations).toHaveCount(0);
    await page.getByRole('button', { name: 'Activity Log', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Activity Log', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activity Log', exact: true }).locator('svg')).toHaveClass(/lucide-list-checks/);
    await expect(page.getByRole('button', { name: 'Care Organizer', exact: true }).locator('svg')).toHaveClass(/lucide-panels-top-left/);
    await page.getByRole('button', { name: 'Account settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Integrations', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Integrations', exact: true })).toBeVisible();
    if (width === 1280) await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button')).toHaveText(['Overview', 'Care Plan', 'Care Organizer', 'Care Circle', 'Care Hand Over', 'Responsibilities', 'Activity Log', 'Demo']);
  });
}
test('existing deep links preserve their destination and expand Demo initially', async ({ page }) => {
  for (const view of ['Care planning', 'Care Organizer', 'Care organizer']) {
    await page.goto(`/?view=${encodeURIComponent(view)}`);
    await expect(page.getByRole('button', { name: 'Care Organizer', exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.goto('/?view=Evaluations');
  await expect(page.getByRole('button', { name: 'Demo', exact: true })).toHaveAttribute('aria-expanded', 'true');
});
test('backend routes accept trusted origins and reject mismatched ports', async ({ request, baseURL }) => {
  const state = await (await request.get('/api/state')).json();
  const recipientId = state.selectedRecipient.id;
  for (const route of ['health', 'auth/session', 'state', 'planning', 'integrations', 'notifications', 'chat', 'calendar', 'export']) {
    expect((await request.get(`/api/${route}?recipientId=${recipientId}`)).status(), route).toBe(200);
  }
  const callback = await request.get('/api/calendar/callback', { maxRedirects: 0 });
  expect(callback.status()).toBe(303);
  expect(callback.headers().location).toMatch(/^\/\?view=Calendar&/);
  for (const origin of baseURL!.startsWith('https:') ? [baseURL!] : [baseURL!, 'https://carestead.com:8083']) {
    for (const [route, data, status] of [
      ['state', { action: 'run_check', recipientId }, 200],
      ['integrations', { id: 'calendar', enabled: false }, 200],
      ['planning', { action: 'acknowledge', recipientId }, 200],
      ['notifications', { action: 'save_preferences', recipientId, emailEnabled: false, smsEnabled: false, phone: '' }, 200],
      ['calendar', { action: 'disconnect', recipientId }, 200],
      ['chat', { action: 'reject_action', recipientId }, 400],
    ] as const) {
      if (route === 'planning') {
        const planning = await (await request.get(`/api/planning?recipientId=${recipientId}`)).json();
        Object.assign(data, { snapshot: JSON.stringify(planning.state.handover.snapshot) });
      }
      const response = await request.post(`/api/${route}`, { headers: { Origin: origin }, data });
      expect(response.status(), `${route}: ${await response.text()}`).toBe(status);
      const blocked = await request.post(`/api/${route}`, { headers: { Origin: 'https://carestead.com:3009' }, data });
      expect(blocked.status(), route).toBe(403);
      expect((await blocked.json()).error).toContain('Open Carestead');
    }
  }
});
