import { expect, test } from '@playwright/test';
import type { DashboardState } from '../lib/types';

test('use a template, customize responsibilities, and preserve the original', async ({ page }) => {
  await page.goto('/?view=Care%20plan');
  const state = await (await page.request.get('/api/state')).json() as DashboardState;
  const template = state.templates[1];
  const card = page.getByRole('article').filter({ has: page.getByText(template.name, { exact: true }) });
  await card.getByRole('button', { name: 'Use template' }).click();
  await expect(page.getByLabel('Starting template')).toHaveValue(template.template_key);
  await page.getByLabel("Person's display name").fill('Template test');
  await page.getByLabel('Customize responsibilities', { exact: true }).check();
  await page.getByLabel('Title', { exact: true }).first().fill('Arrange a weekly walk');
  await page.getByLabel('Due in days').first().fill('3');
  await page.getByLabel('Category', { exact: true }).first().selectOption('medication');
  await page.getByRole('button', { name: 'Create category', exact: true }).first().click();
  await page.getByLabel('New category name').fill('Social support');
  await page.getByRole('button', { name: 'Use category', exact: true }).click();
  await expect(page.getByLabel('Category', { exact: true }).first()).toHaveValue('social support');
  const count = template.responsibilities!.length;
  if (count > 1) await page.getByRole('button', { name: `Remove responsibility ${count}`, exact: true }).click();
  await page.getByRole('button', { name: 'Add responsibility', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).last().fill('Confirm a friendly visit');
  await page.getByLabel('I confirm that appropriate consent').check();
  await page.getByLabel('I understand Carestead').check();
  const response = page.waitForResponse((response) => response.url().endsWith('/api/state') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  const result = await response;
  expect(result.ok(), await result.text()).toBe(true);
  const created = await result.json() as DashboardState;
  expect(created.currentPlan.template_key).toBe(template.template_key);
  expect(created.tasks.find((task) => task.title === 'Arrange a weekly walk')?.category).toBe('social support');
  expect(created.tasks.map((task) => task.title)).toContain('Arrange a weekly walk');
  expect(created.tasks.map((task) => task.title)).toContain('Confirm a friendly visit');
  expect(created.tasks).toHaveLength(count > 1 ? count : count + 1);
  expect(created.templates.find((item) => item.id === template.id)?.responsibilities).toEqual(template.responsibilities);
  await expect(page.getByRole('heading', { name: "Template test's active plan" })).toBeVisible();
});

test('default templates work and invalid custom responsibilities are rejected before creation', async ({ page, baseURL }) => {
  const state = await (await page.request.get('/api/state')).json() as DashboardState;
  const template = state.templates[0];
  const data = { action: 'create_recipient', displayName: 'Default template test', templateKey: template.template_key, timezone: 'America/Toronto', consentAccepted: true, nonClinicalAcknowledged: true };
  const response = await page.request.post('/api/state', { headers: { Origin: baseURL! }, data });
  expect(response.ok(), await response.text()).toBe(true);
  const created = await response.json() as DashboardState;
  expect(created.tasks).toHaveLength(template.task_count);
  const invalid = await page.request.post('/api/state', { headers: { Origin: baseURL! }, data: { ...data, responsibilities: [{ title: 'Invalid date', category: 'general', due_offset_days: '-1' }] } });
  expect(invalid.status()).toBe(400);
  const after = await (await page.request.get('/api/state')).json() as DashboardState;
  expect(after.recipients).toHaveLength(created.recipients.length);
});

for (const role of ['caregiver', 'viewer'] as const) {
  test(`${role} category permissions and Guest role labels`, async ({ page, browser, baseURL }) => {
    const state = await (await page.request.get('/api/state')).json() as DashboardState;
    const recipientId = state.selectedRecipient.id;
    const email = `category-${role}@example.test`;
    const headers = { Origin: baseURL! };
    const invite = await page.request.post('/api/state', { headers, data: { action: 'invite_member', recipientId, displayName: `Category ${role}`, email, role } });
    expect(invite.ok(), await invite.text()).toBe(true);
    const { invitationUrl } = await invite.json();
    const invitation = new URLSearchParams(invitationUrl.split('#')[1]).get('invitation');
    const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const registered = await context.request.post('/api/auth/sign-up', { headers, data: { displayName: `Category ${role}`, email, password: 'Category test password 2026!', confirmPassword: 'Category test password 2026!', invitation } });
      expect(registered.ok(), await registered.text()).toBe(true);
      const memberPage = await context.newPage();
      await memberPage.goto(`/?view=Responsibilities&recipientId=${recipientId}`);
      const add = memberPage.getByRole('button', { name: 'Add responsibility', exact: true });
      if (role === 'caregiver') {
        await add.click();
        await memberPage.getByLabel('Responsibility', { exact: true }).fill('Arrange music time');
        await memberPage.getByRole('button', { name: 'Create category', exact: true }).click();
        await memberPage.getByLabel('New category name').fill('Music');
        await memberPage.getByRole('button', { name: 'Use category', exact: true }).click();
        await memberPage.getByLabel('Due date and time').fill('2026-10-10T10:00');
        await memberPage.getByRole('button', { name: 'Add to plan', exact: true }).click();
        await expect(memberPage.getByRole('heading', { name: 'Arrange music time' })).toBeVisible();
        await memberPage.reload();
        await add.click();
        await expect(memberPage.getByLabel('Category', { exact: true }).getByRole('option', { name: 'Music', exact: true })).toHaveCount(1);
      } else {
        await expect(add).toBeDisabled();
        await expect(memberPage.getByRole('button', { name: 'Create category' })).toHaveCount(0);
        const blocked = await context.request.post('/api/state', { headers, data: { action: 'add_task', recipientId, title: 'Guest custom category', category: 'music', dueAt: '2026-10-10T14:00:00Z' } });
        expect(blocked.status()).toBe(403);
        await memberPage.goto(`/?view=Care%20circle&recipientId=${recipientId}`);
        await expect(memberPage.getByLabel('Role for Category viewer').getByRole('option', { name: 'Guest', exact: true })).toHaveCount(1);
      }
    } finally { await context.close(); }
  });
}
