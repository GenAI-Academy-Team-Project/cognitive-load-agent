import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';
import type { DashboardState } from '../lib/types';
import type { PlanningState } from '../lib/planning-types';

async function newRecipient(request: APIRequestContext, origin: string, name: string) {
  const response = await request.post('/api/state', { headers: { Origin: origin }, data: { action: 'create_recipient', displayName: name, templateKey: 'aging-at-home', timezone: 'America/Toronto', consentAccepted: true, nonClinicalAcknowledged: true } });
  expect(response.ok(), await response.text()).toBe(true);
  return await response.json() as DashboardState;
}

test('planning tools are accessible on desktop and mobile; reviewed updates become real tasks', async ({ page, baseURL }) => {
  const dashboard = await newRecipient(page.request, baseURL!, 'Planning demo');
  const recipientId = dashboard.selectedRecipient.id;
  await page.goto(`/?view=Care%20planning&recipientId=${recipientId}`);
  await page.getByRole('button', { name: 'I need a break', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'When do you need a break?' })).toBeVisible();
  await expect(page.getByText('Loading care planning…')).toBeHidden();
  for (const title of ['I need a break', 'What if?', 'Organize an update', 'I can help', 'Task planning']) {
    await page.getByRole('button', { name: title, exact: true }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations, title).toEqual([]);
  }
  await page.getByRole('button', { name: 'Organize an update', exact: true }).click();
  await page.getByLabel('Your care update').fill('Confirm the community ride tomorrow at 10 AM; collect groceries tomorrow at 11 AM');
  await page.getByRole('button', { name: 'Organize my update' }).click();
  await expect(page.getByLabel('Responsibility title')).toHaveCount(2);
  await page.getByRole('button', { name: 'Prepare reviewed items for approval' }).click();
  const before = await (await page.request.get(`/api/state?recipientId=${recipientId}`)).json() as DashboardState;
  expect(before.tasks.some((task) => task.title.includes('Confirm the community ride'))).toBe(false);
  await page.getByRole('button', { name: 'Approve and apply', exact: true }).click();
  await expect(page.getByText('applied', { exact: true })).toBeVisible();
  const after = await (await page.request.get(`/api/state?recipientId=${recipientId}`)).json() as DashboardState;
  expect(after.tasks.some((task) => task.title.includes('Confirm the community ride'))).toBe(true);
  await page.getByRole('button', { name: 'I need a break', exact: true }).click();
  await page.screenshot({ path: `.playwright-runs/${process.env.CARESTEAD_TEST_PORT || 43179}/planning-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `.playwright-runs/${process.env.CARESTEAD_TEST_PORT || 43179}/planning-mobile.png`, fullPage: true });
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('handover highlights changed tasks after acknowledgement', async ({ page, baseURL }) => {
  const dashboard = await newRecipient(page.request, baseURL!, 'Handover demo');
  const recipientId = dashboard.selectedRecipient.id;
  await page.goto(`/?view=Handover&recipientId=${recipientId}`);
  await page.getByRole('button', { name: 'I’ve reviewed this handover' }).click();
  await expect(page.getByText('Handover acknowledged.')).toBeVisible();
  const response = await page.request.post('/api/state', { headers: { Origin: baseURL! }, data: { action: 'add_task', recipientId, title: 'New handover responsibility', dueAt: new Date(Date.now() + 86400000).toISOString(), owner: 'Unassigned', category: 'general' } });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '1 change since you were away' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New handover responsibility' })).toBeVisible();
});

test('planning API enforces identity, recipient access, consent and export lifecycle', async ({ page, browser, baseURL }) => {
  const dashboard = await newRecipient(page.request, baseURL!, 'Private planning');
  const recipientId = dashboard.selectedRecipient.id, headers = { Origin: baseURL! };
  const post = (action: string, payload: object = {}) => page.request.post('/api/planning', { headers, data: { action, recipientId, ...payload } });
  const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await guest.request.get(`/api/planning?recipientId=${recipientId}`)).status()).toBe(401);
  expect((await page.request.get('/api/planning?recipientId=not-authorized')).status()).toBe(403);
  expect((await post('save_task_details', { taskId: 'task-physio', ownerMemberId: '', durationMinutes: 20 })).status()).toBe(404);
  expect((await post('save_availability', { start: 'invalid', end: 'invalid', categories: [] })).status()).toBe(400);
  const start = new Date(Date.now() + 3600000).toISOString(), end = new Date(Date.now() + 7200000).toISOString();
  expect((await post('save_availability', { start, end, categories: ['general'], capabilities: [] })).ok()).toBe(true);
  const exported = await (await page.request.get(`/api/export?recipientId=${recipientId}`)).json() as { planning: { caregiver_availability: unknown[] } };
  expect(exported.planning.caregiver_availability).toHaveLength(1);
  const invitationResponse = await page.request.post('/api/state', { headers, data: { action: 'invite_member', recipientId, displayName: 'Planning viewer', email: 'planning-viewer@example.test', role: 'viewer' } });
  const invite = await invitationResponse.json() as { invitationUrl: string };
  const token = new URLSearchParams(invite.invitationUrl.split('#')[1]).get('invitation');
  const signedUp = await guest.request.post('/api/auth/sign-up', { headers, data: { displayName: 'Planning viewer', email: 'planning-viewer@example.test', password: 'Planning viewer password 2026!', confirmPassword: 'Planning viewer password 2026!', invitation: token } });
  expect(signedUp.ok(), await signedUp.text()).toBe(true);
  expect((await guest.request.get(`/api/planning?recipientId=${recipientId}`)).ok()).toBe(true);
  expect((await guest.request.post('/api/planning', { headers, data: { action: 'save_availability', recipientId, start, end, categories: ['general'], capabilities: [] } })).status()).toBe(403);
  const withdraw = await page.request.post('/api/state', { headers, data: { action: 'update_consent', recipientId, consentStatus: 'withdrawn', retentionDays: '30', purpose: 'Care coordination' } });
  expect(withdraw.ok()).toBe(true);
  expect((await post('extract', { message: 'A private note' })).status()).toBe(409);
  expect((await post('acknowledge', { snapshot: '[]' })).status()).toBe(409);
  const removed = await page.request.post('/api/state', { headers, data: { action: 'delete_recipient', recipientId, confirmName: 'Private planning' } });
  expect(removed.ok()).toBe(true);
  expect((await page.request.get(`/api/planning?recipientId=${recipientId}`)).status()).toBe(403);
  await guest.close();
});

test('real caregiver accepts a coverage request across signed-in sessions', async ({ page, browser, baseURL }) => {
  const dashboard = await newRecipient(page.request, baseURL!, 'Coverage demo');
  const recipientId = dashboard.selectedRecipient.id, headers = { Origin: baseURL! };
  const inviteResponse = await page.request.post('/api/state', { headers, data: { action: 'invite_member', recipientId, displayName: 'Coverage helper', email: 'coverage-helper@example.test', role: 'caregiver' } });
  const invite = await inviteResponse.json() as { invitationUrl: string };
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const token = new URLSearchParams(invite.invitationUrl.split('#')[1]).get('invitation');
  const signup = await context.request.post('/api/auth/sign-up', { headers, data: { displayName: 'Coverage helper', email: 'coverage-helper@example.test', password: 'Coverage helper password 2026!', confirmPassword: 'Coverage helper password 2026!', invitation: token } });
  expect(signup.ok(), await signup.text()).toBe(true);
  const ownerPost = (action: string, payload: object) => page.request.post('/api/planning', { headers, data: { action, recipientId, ...payload } });
  const helperPost = (action: string, payload: object) => context.request.post('/api/planning', { headers, data: { action, recipientId, ...payload } });
  const current = await (await page.request.get(`/api/planning?recipientId=${recipientId}`)).json() as { state: PlanningState };
  const dueAt = new Date(Date.now() + 86400000).toISOString();
  const added = await page.request.post('/api/state', { headers, data: { action: 'add_task', recipientId, title: 'Cover a short check-in', owner: dashboard.currentUser.displayName, dueAt, category: 'general' } });
  const addedState = await added.json() as DashboardState;
  const taskId = addedState.tasks.find((task) => task.title === 'Cover a short check-in')!.id;
  expect((await ownerPost('save_task_details', { taskId, ownerMemberId: current.state.memberId, durationMinutes: 20, requirements: [], dependsOn: '', backupMemberId: '' })).ok()).toBe(true);
  const start = new Date(Date.parse(dueAt) - 3600000).toISOString(), end = new Date(Date.parse(dueAt) + 3600000).toISOString();
  expect((await helperPost('save_availability', { start, end, categories: ['general'], capabilities: [] })).ok()).toBe(true);
  const proposed = await (await ownerPost('preview_relief', { start, end })).json() as { proposalId: string };
  expect((await ownerPost('apply_proposal', { id: proposed.proposalId })).ok()).toBe(true);
  const helperPage = await context.newPage();
  await helperPage.goto(`/?view=Care%20planning&recipientId=${recipientId}`);
  await helperPage.getByRole('button', { name: 'Accept coverage', exact: true }).click();
  await expect(helperPage.getByText('Confirmed coverage', { exact: true })).toBeVisible();
  const final = await (await page.request.get(`/api/planning?recipientId=${recipientId}`)).json() as { state: PlanningState };
  expect(final.state.tasks.find((task) => task.id === taskId)).toMatchObject({ owner: 'Coverage helper', accepted: true });
  await context.close();
});
