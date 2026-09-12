import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('notification tool previews exact content, requires approval, and posts to the inbox', async ({ page, baseURL }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  const initial = await (await page.request.get('/api/state')).json();
  const recipientId = initial.selectedRecipient.id;
  const headers = { Origin: baseURL! };
  const member = initial.careCircle.find((item: { email: string }) => item.email === initial.currentUser.email);
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
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(detail, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText(/posted to the caregiver’s Carestead inbox/)).toBeVisible();
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
  await page.getByRole('button', { name: 'Notifications', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Your delivery preferences' })).toBeVisible();
  await expect(page.getByText('in_app · posted', { exact: false })).toBeVisible();
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

test('read receipts and targeted inbox messages stay separate for each caregiver', async ({ page, browser, baseURL }) => {
  const headers = { Origin: baseURL! };
  const initial = await (await page.request.get('/api/state')).json();
  const recipientId = initial.selectedRecipient.id;
  const invite = await page.request.post('/api/state', { headers, data: { action: 'invite_member', recipientId, displayName: 'Notification Viewer', email: 'notification-viewer@example.test', role: 'viewer' } });
  expect(invite.status()).toBe(200);
  const invitation = new URLSearchParams(new URL((await invite.json()).invitationUrl, baseURL).hash.slice(1)).get('invitation');
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const signup = await context.request.post('/api/auth/sign-up', { headers, data: { invitation, email: 'notification-viewer@example.test', displayName: 'Notification Viewer', password: 'A long notification test password', confirmPassword: 'A long notification test password' } });
    expect(signup.status()).toBe(201);
    const shared = initial.notifications.find((item: { title: string }) => item.title !== 'Notification tool test');
    expect(shared).toBeTruthy();
    expect((await page.request.post('/api/state', { headers, data: { action: 'mark_notification_read', recipientId, id: shared.id } })).status()).toBe(200);
    const otherState = await (await context.request.get('/api/state')).json();
    expect(otherState.notifications.find((item: { id: string }) => item.id === shared.id).read_at).toBeNull();
    const privateMessage = initial.notifications.find((item: { title: string }) => item.title === 'Notification tool test');
    expect(otherState.notifications.some((item: { id: string }) => item.id === privateMessage.id)).toBe(false);
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
    const exported = await (await page.request.get(`/api/export?recipientId=${recipientId}`)).json();
    expect(exported.notification_deliveries).toHaveLength(2);
    expect(exported.notification_reads.length).toBeGreaterThan(0);
  } finally { await context.close(); }
});

test('Pushover settings save a private key and support opt-out without browser push', async ({ page }) => {
  let enabled = false;
  const key = 'u'.repeat(30);
  await page.route('**/api/notifications?*', async (route) => route.fulfill({ json: { email: 'owner@example.test', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false, pushoverEnabled: enabled, vapidPublicKey: null, channels: ['in_app', 'pushover'], deliveries: [] } }));
  await page.route('**/api/notifications', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'enable_pushover') { expect(body.userKey).toBe(key); enabled = true; }
    else { expect(body.action).toBe('disable_pushover'); enabled = false; }
    await route.fulfill({ json: { email: 'owner@example.test', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false, pushoverEnabled: enabled, vapidPublicKey: null, channels: ['in_app', 'pushover'], deliveries: [] } });
  });
  await page.goto('/?view=Notifications');
  const input = page.getByLabel('Your Pushover user key');
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill(key);
  await page.getByRole('button', { name: 'Enable Pushover for me' }).click();
  await expect(page.getByText('Enabled for your Pushover account.')).toBeVisible();
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Disable and remove Pushover key' }).click();
  await expect(page.getByRole('button', { name: 'Enable Pushover for me' })).toBeVisible();
});
