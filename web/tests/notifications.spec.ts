import { notificationActor } from './helpers/notification-actor';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// A dedicated actor keeps this suite independent of other chat tests' limits.
// The request fixture retains the owner session for invitations and exports.
let actor: Awaited<ReturnType<typeof notificationActor>>;
test.beforeAll(async ({ request, browser, baseURL }) => {
  actor = await notificationActor(request, browser, baseURL!);
});
test.beforeEach(async ({ page }) => {
  await page.context().clearCookies();
  await page.context().addCookies(actor.cookies);
});

test('notification tool previews exact content, requires approval, and posts to the inbox', async ({ page, request, baseURL }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  const initial = await (await page.request.get('/api/state')).json();
  const recipientId = initial.selectedRecipient.id;
  const headers = { Origin: baseURL! };
  const member = initial.careCircle.find((item: { email: string }) => item.email === initial.currentUser.email);
  const exportBefore = await (await request.get(`/api/export?recipientId=${recipientId}`)).json();
  const title = 'Notification tool test';
  const detail = 'Please review the care plan before tomorrow.';
  const response = await page.request.post('/api/chat', { headers, data: { action: 'propose_notification', recipientId, notification: { channel: 'in_app', memberId: member.id, title, detail } } });
  expect(response.status()).toBe(200);
  const chat = await response.json();
  const action = chat.messages.at(-1).action;
  expect(action.status).toBe('pending');
  expect(chat.tools[0].name).toBe('send_notification');
  const before = await (await page.request.get('/api/state')).json();
  expect(before.notifications.some((n: { title: string }) => n.title === title)).toBe(false);
  await page.getByRole('button', { name: /ask carestead about/i }).click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  const drafts = await (await page.request.get(`/api/chat?recipientId=${recipientId}&scope=notifications`)).json();
  expect(drafts.messages.some((message: { action?: { id: string } }) => message.action?.id === action.id)).toBe(true);
  const conversationBefore = await (await page.request.get(`/api/chat?recipientId=${recipientId}`)).json();
  expect(conversationBefore.messages.some((message: { action?: { id: string } }) => message.action?.id === action.id)).toBe(false);
  const approved = await page.request.post('/api/chat', { headers, data: { action: 'approve_action', recipientId, actionId: action.id, scope: 'notifications' } });
  expect(approved.status()).toBe(200);
  const conversationAfter = await (await page.request.get(`/api/chat?recipientId=${recipientId}`)).json();
  expect(conversationAfter.messages).toEqual(conversationBefore.messages);
  const exportResponse = await request.get(`/api/export?recipientId=${recipientId}`);
  expect(exportResponse.ok()).toBe(true);
  expect((await exportResponse.json()).chat_messages).toEqual(exportBefore.chat_messages);
  const repeat = await page.request.post('/api/chat', { headers, data: { action: 'approve_action', recipientId, actionId: action.id } });
  expect(repeat.status()).toBe(409);
  const after = await (await page.request.get('/api/state')).json();
  const notification = after.notifications.find((n: { title: string }) => n.title === title);
  expect(notification.detail).toBe(detail);
  expect(notification.read_at).toBeNull();
  const marked = await page.request.post('/api/state', { headers, data: { action: 'mark_notification_read', recipientId, id: notification.id } });
  expect(marked.status()).toBe(200);
  expect((await marked.json()).notifications.find((n: { id: string }) => n.id === notification.id).read_at).toBeTruthy();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).first().click();
  await expect(page.getByRole('region', { name: 'Recent delivery attempts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your delivery preferences' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Account settings → Integrations' })).toHaveAttribute('href', `/?view=Integrations&recipientId=${recipientId}`);
  await expect(page.getByText('in_app · posted', { exact: false })).toBeVisible();
  await page.goto('/?view=Notifications');
  const filters = page.getByRole('group', { name: 'Filter Notifications', exact: true });
  await filters.getByRole('combobox', { name: 'Read status', exact: true }).selectOption('read');
  await expect(page.locator('article.care-notification').filter({ hasText: title })).toBeVisible();
  await filters.getByRole('combobox', { name: 'Notification type', exact: true }).selectOption(notification.kind);
  await expect(page.locator('article.care-notification').filter({ hasText: title })).toHaveAttribute('data-care-tone', { approval: 'amber', risk: 'rose', reminder: 'sky', system: 'plum' }[notification.kind as 'system']);
  await expect(filters.getByRole('combobox', { name: 'Delivery status', exact: true })).toBeVisible();
  await filters.getByRole('button', { name: /Clear filters/i }).click();
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('notification settings and structured tool calls enforce access and validation', async ({ page, browser, baseURL }) => {
  const headers = { Origin: baseURL! };
  const state = await (await page.request.get('/api/state')).json();
  const recipientId = state.selectedRecipient.id;
  const unauthenticated = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await unauthenticated.request.get(`/api/notifications?recipientId=${recipientId}`)).status()).toBe(401);
  await unauthenticated.close();
  expect((await page.request.get('/api/notifications?recipientId=other-recipient')).status()).toBe(403);
  expect((await page.request.post('/api/notifications', { headers, data: { action: 'save_preferences', recipientId, emailEnabled: false, smsEnabled: true, phone: 'bad-phone' } })).status()).toBe(400);
  expect((await page.request.post('/api/chat', { headers, data: { action: 'propose_notification', recipientId, notification: { channel: 'in_app', memberId: 'unrelated-member', title: 'No', detail: 'No' } } })).status()).toBe(403);
  const saved = await page.request.post('/api/notifications', { headers, data: { action: 'save_preferences', recipientId, emailEnabled: false, smsEnabled: false, phone: '' } });
  expect(saved.status()).toBe(200);
  const settings = await saved.json();
  expect(settings.emailEnabled).toBe(false);
  expect(settings).not.toHaveProperty('push_json');
});

test('read receipts and targeted inbox messages stay separate for each caregiver', async ({ page, request, browser, baseURL }) => {
  const headers = { Origin: baseURL! };
  const initial = await (await page.request.get('/api/state')).json();
  const recipientId = initial.selectedRecipient.id;
  const invite = await request.post('/api/state', { headers, data: { action: 'invite_member', recipientId, displayName: 'Notification Viewer', email: 'notification-viewer@example.test', role: 'viewer' } });
  expect(invite.status()).toBe(200);
  const invitation = new URLSearchParams(new URL((await invite.json()).invitationUrl, baseURL).hash.slice(1)).get('invitation');
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const signup = await context.request.post('/api/auth/sign-up', { headers, data: { invitation, email: 'notification-viewer@example.test', displayName: 'Notification Viewer', password: 'A long notification test password 2026!', confirmPassword: 'A long notification test password 2026!' } });
    expect(signup.status()).toBe(201);
    const shared = initial.notifications.find((item: { title: string }) => item.title !== 'Notification tool test');
    expect(shared).toBeTruthy();
    expect((await page.request.post('/api/state', { headers, data: { action: 'mark_notification_read', recipientId, id: shared.id } })).status()).toBe(200);
    const otherState = await (await context.request.get('/api/state')).json();
    expect(otherState.notifications.find((item: { id: string }) => item.id === shared.id).read_at).toBeNull();
    const member = initial.careCircle.find((item: { email: string }) => item.email === initial.currentUser.email);
    const privateProposal = await page.request.post('/api/chat', { headers, data: { action: 'propose_notification', recipientId, notification: { channel: 'in_app', memberId: member.id, title: 'Private receipt test', detail: 'Only this caregiver should see this.' } } });
    expect(privateProposal.status()).toBe(200);
    const privateAction = (await privateProposal.json()).messages.at(-1).action;
    expect((await page.request.post('/api/chat', { headers, data: { action: 'approve_action', recipientId, actionId: privateAction.id } })).status()).toBe(200);
    const privateState = await (await page.request.get('/api/state')).json();
    const privateMessage = privateState.notifications.find((item: { title: string }) => item.title === 'Private receipt test');
    const otherAfterPrivate = await (await context.request.get('/api/state')).json();
    expect(otherAfterPrivate.notifications.some((item: { id: string }) => item.id === privateMessage.id)).toBe(false);
    expect((await context.request.post('/api/state', { headers, data: { action: 'mark_notification_read', recipientId, id: privateMessage.id } })).status()).toBe(404);
    const proposed = await page.request.post('/api/chat', { headers, data: { action: 'message', recipientId, message: 'In-app Notification Viewer: Please review today.' } });
    expect(proposed.status()).toBe(200);
    const action = (await proposed.json()).messages.at(-1).action;
    expect(action.payload.targetName).toBe('Notification Viewer');
    expect((await page.request.post('/api/chat', { headers, data: { action: 'approve_action', recipientId, actionId: action.id } })).status()).toBe(200);
    const updated = await (await context.request.get('/api/state')).json();
    expect(updated.notifications.some((item: { detail: string }) => item.detail === 'Please review today.')).toBe(true);
    const ownerState = await (await page.request.get('/api/state')).json();
    expect(ownerState.notifications.some((item: { detail: string }) => item.detail === 'Please review today.')).toBe(false);
    const denied = await context.request.post('/api/chat', { headers, data: { action: 'propose_notification', recipientId, notification: { channel: 'in_app', memberId: action.payload.memberId, title: 'Viewer write', detail: 'No' } } });
    expect(denied.status()).toBe(403);
    const exported = await (await request.get(`/api/export?recipientId=${recipientId}`)).json();
    expect(exported.notification_deliveries.filter((delivery: { action_id: string }) => [privateAction.id, action.id].includes(delivery.action_id))).toHaveLength(2);
    expect(exported.notification_reads.length).toBeGreaterThan(0);
  } finally { await context.close(); }
});
