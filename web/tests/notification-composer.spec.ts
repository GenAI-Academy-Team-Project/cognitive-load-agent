import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('notification form reviews, cancels, and sends only after approval', async ({ page }) => {
  const requests: { action: string; actionId?: string; notification?: { detail: string } }[] = [];
  await page.route('**/api/notifications?*', (route) => route.fulfill({ json: { channels: ['in_app', 'sms'], deliveries: [], email: '', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false } }));
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: { recipientId: body.recipientId, messages: [{ content: body.action === 'approve_action' ? 'Notification posted to the caregiver’s Carestead inbox.' : 'Review notification', action: body.action === 'propose_notification' ? { id: 'form-action', action_type: 'send_notification', status: 'pending', payload: { ...body.notification, targetName: 'Selected caregiver', destinationLabel: 'Carestead inbox' } } : null }] } });
  });
  await page.goto('/?view=Notifications');
  await page.getByRole('button', { name: 'Send notification', exact: true }).click();
  const section = page.getByRole('region', { name: 'Send notification', exact: true });
  await section.getByRole('combobox', { name: 'Caregiver', exact: true }).selectOption({ index: 1 });
  await section.getByRole('textbox', { name: 'Title', exact: true }).fill('Tomorrow’s care update');
  await section.getByRole('textbox', { name: 'Message', exact: true }).fill('Bring the folder.\nPlease arrive at 10.');
  await section.getByRole('button', { name: 'Review notification', exact: true }).click();
  await expect(section.getByText('Bring the folder.\nPlease arrive at 10.', { exact: true })).toBeVisible();
  expect(requests.map((request) => request.action)).toEqual(['propose_notification']);
  expect(requests[0].notification?.detail).toBe('Bring the folder.\nPlease arrive at 10.');
  await section.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Notification cancelled. Nothing was sent.');
  await expect(section.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Bring the folder.\nPlease arrive at 10.');
  await section.getByRole('button', { name: 'Review notification', exact: true }).click();
  const accessibility = await new AxeBuilder({ page }).include('[aria-label="Send notification"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await section.getByRole('button', { name: 'Approve and send' }).click();
  await expect(section.getByRole('status')).toContainText('posted to the caregiver');
  expect(requests.map((request) => request.action)).toEqual(['propose_notification', 'reject_action', 'propose_notification', 'approve_action']);
  expect(requests.at(-1)?.actionId).toBe('form-action');
});

test('SMS opt-in failure keeps the draft and explains how to enable delivery', async ({ page }) => {
  await page.route('**/api/notifications?*', (route) => route.fulfill({ json: { channels: ['in_app', 'sms'], deliveries: [], email: '', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false } }));
  await page.route('**/api/chat', (route) => route.fulfill({ status: 409, json: { error: 'This caregiver must enable SMS and save a phone number with country code.' } }));
  await page.goto('/?view=Notifications');
  await page.getByRole('button', { name: 'Send notification', exact: true }).click();
  const section = page.getByRole('region', { name: 'Send notification', exact: true });
  await section.getByRole('combobox', { name: 'Caregiver', exact: true }).selectOption({ index: 1 });
  await section.getByRole('combobox', { name: 'Channel', exact: true }).selectOption('sms');
  await section.getByRole('textbox', { name: 'Message', exact: true }).fill('Please review today.');
  await section.getByRole('button', { name: 'Review notification', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('check SMS consent, and save');
  await expect(section.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Please review today.');
  await expect(section.getByRole('button', { name: 'Approve and send' })).toHaveCount(0);
});

for (const channel of ['in_app', 'email', 'sms', 'whatsapp', 'push']) {
  test(`form supports enabled ${channel} delivery`, async ({ page }) => {
    await page.route('**/api/notifications?*', (route) => route.fulfill({ json: { channels: ['in_app', 'email', 'sms', 'whatsapp', 'push'], deliveries: [], email: '', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false } }));
    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON();
      expect(body.action).toBe('propose_notification');
      expect(body.notification.channel).toBe(channel);
      await route.fulfill({ json: { messages: [{ action: { id: 'channel-action', action_type: 'send_notification', status: 'pending', payload: { ...body.notification, targetName: 'Caregiver', destinationLabel: 'Saved destination' } } }] } });
    });
    await page.goto('/?view=Notifications');
    await page.getByRole('button', { name: 'Send notification', exact: true }).click();
    const section = page.getByRole('region', { name: 'Send notification', exact: true });
    await section.getByRole('combobox', { name: 'Caregiver', exact: true }).selectOption({ index: 1 });
    await section.getByRole('combobox', { name: 'Channel', exact: true }).selectOption(channel);
    await section.getByRole('textbox', { name: 'Message', exact: true }).fill('Please review the care plan.');
    await section.getByRole('button', { name: 'Review notification', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Review before sending' })).toBeVisible();
    await expect(section.getByText('Saved destination', { exact: false })).toBeVisible();
  });
}


for (const outcome of ['The push delivery result is unknown. Check the provider before sending again; it may already have been sent.', 'The sms notification failed. Check notification delivery history.']) {
  test(`delivery problems appear as alerts: ${outcome}`, async ({ page }) => {
    await page.route('**/api/notifications?*', (route) => route.fulfill({ json: { channels: ['in_app'], deliveries: [], email: '', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false } }));
    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { messages: [{ content: outcome, action: body.action === 'propose_notification' ? { id: 'problem-action', action_type: 'send_notification', status: 'pending', payload: { ...body.notification, targetName: 'Caregiver', destinationLabel: 'Saved destination' } } : null }] } });
    });
    await page.goto('/?view=Notifications');
    await page.getByRole('button', { name: 'Send notification', exact: true }).click();
    const section = page.getByRole('region', { name: 'Send notification', exact: true });
    await section.getByRole('combobox', { name: 'Caregiver', exact: true }).selectOption({ index: 1 });
    await section.getByRole('textbox', { name: 'Message', exact: true }).fill('Please review today.');
    await section.getByRole('button', { name: 'Review notification', exact: true }).click();
    await section.getByRole('button', { name: 'Approve and send' }).click();
    const alert = section.getByRole('alert');
    await expect(alert).toContainText(outcome);
    await expect(alert).toContainText(outcome.includes('unknown') ? 'Do not resend yet.' : 'Notification failed');
    await expect(section.getByRole('status')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).include('[aria-label="Send notification"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  });
}

test('templates fill editable content and preserve the custom draft before review', async ({ page }) => {
  let proposal: { title: string; detail: string } | undefined;
  await page.route('**/api/notifications?*', (route) => route.fulfill({ json: { channels: ['in_app'], deliveries: [], email: '', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false } }));
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.action).toBe('propose_notification');
    proposal = body.notification;
    await route.fulfill({ json: { messages: [{ action: { id: 'template-action', action_type: 'send_notification', status: 'pending', payload: { ...body.notification, targetName: 'Caregiver', destinationLabel: 'Carestead inbox' } } }] } });
  });
  await page.goto('/?view=Notifications');
  await page.getByRole('button', { name: 'Send notification', exact: true }).click();
  const section = page.getByRole('region', { name: 'Send notification', exact: true });
  const title = section.getByRole('textbox', { name: 'Title', exact: true });
  const message = section.getByRole('textbox', { name: 'Message', exact: true });
  const templates = section.getByRole('combobox', { name: 'Message template' });
  await title.fill('My custom title');
  await message.fill('My custom message');
  for (const id of ['review-plan', 'check-in', 'availability', 'responsibilities', 'appointment', 'handover']) {
    await templates.selectOption(id);
    await expect(message).not.toHaveValue('');
    await expect(title).not.toHaveValue('My custom title');
  }
  await templates.selectOption('custom');
  await expect(title).toHaveValue('My custom title');
  await expect(message).toHaveValue('My custom message');
  await templates.selectOption('review-plan');
  await expect(title).toHaveValue('Care plan review');
  await message.fill('Please review the plan before our call.');
  expect(proposal).toBeUndefined();
  await section.getByRole('combobox', { name: 'Caregiver', exact: true }).selectOption({ index: 1 });
  await section.getByRole('button', { name: 'Review notification', exact: true }).click();
  await expect(section.getByText('Please review the plan before our call.', { exact: true })).toBeVisible();
  expect(proposal).toMatchObject({ title: 'Care plan review', detail: 'Please review the plan before our call.' });
});

test('OneSignal is opt-in per message and the approval identifies the selected provider', async ({ page }) => {
  const sends: { provider: string; channel: string }[] = [];
  await page.route('**/api/notifications?*', route => route.fulfill({ json: { channels: ['in_app', 'email'], providerChannels: { legacy: ['in_app', 'email'], onesignal: ['email', 'sms', 'push'] }, onesignal: { available: true, devices: [] }, deliveries: [], email: '', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: false } }));
  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON();
    if (body.notification) sends.push(body.notification);
    await route.fulfill({ json: { messages: [{ action: body.notification ? { id: 'one-signal-action', action_type: 'send_notification', status: 'pending', payload: { ...body.notification, targetName: 'Caregiver', destinationLabel: 'Registered OneSignal devices' } } : null }] } });
  });
  await page.goto('/?view=Notifications');
  await page.getByRole('button', { name: 'Send notification', exact: true }).click();
  const section = page.getByRole('region', { name: 'Send notification', exact: true });
  await expect(section.getByRole('combobox', { name: 'Delivery provider' })).toHaveValue('legacy');
  await section.getByRole('combobox', { name: 'Delivery provider' }).selectOption('onesignal');
  await section.getByRole('combobox', { name: 'Channel', exact: true }).selectOption('push');
  await section.getByRole('combobox', { name: 'Caregiver', exact: true }).selectOption({ index: 1 });
  await section.getByRole('textbox', { name: 'Message', exact: true }).fill('Please review today.');
  await section.getByRole('button', { name: 'Review notification', exact: true }).click();
  expect(sends).toMatchObject([{ provider: 'onesignal', channel: 'push' }]);
  await expect(section.getByText('Provider: OneSignal', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Cancel', exact: true }).click();
  await section.getByRole('combobox', { name: 'Delivery provider' }).selectOption('legacy');
  await expect(section.getByRole('combobox', { name: 'Channel', exact: true })).toHaveValue('in_app');
});

test('OneSignal web setup requests permission only after the second click and keeps VAPID separate', async ({ page }) => {
  const actions: string[] = [];
  const id = '11111111-2222-4333-8444-555555555555';
  const settings = { channels: ['in_app', 'push'], onesignal: { available: true, devices: [] as { platform: string }[] }, deliveries: [], email: 'care@example.test', emailEnabled: false, smsEnabled: false, phone: '', pushEnabled: true, vapidPublicKey: null };
  await page.route('**/api/notifications**', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); actions.push(body.action);
      if (body.action === 'begin_onesignal_push') return route.fulfill({ json: { appId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', externalId: 'private-test-alias' } });
      if (body.action === 'subscribe_onesignal_push') { expect(body.subscriptionId).toBe(id); settings.onesignal.devices = [{ platform: 'web' }]; }
    }
    return route.fulfill({ json: settings });
  });
  await page.route('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.oneSignalTestCalls = [];
    const calls = window.oneSignalTestCalls;
    const sdk = {
      init: async options => { calls.push(['init', options]); },
      login: async alias => { calls.push(['login', alias]); },
      logout: async () => {},
      User: { PushSubscription: { id: '${id}', optedIn: true, optIn: async () => calls.push(['optIn']), optOut: async () => {} } },
      Notifications: { requestPermission: async () => calls.push(['permission']) }
    };
    const queue = window.OneSignalDeferred || [];
    window.OneSignalDeferred = { push: fn => fn(sdk) };
    queue.forEach(fn => fn(sdk));
  ` }));
  await page.goto('/?view=Notifications');
  await page.getByRole('button', { name: 'Enable OneSignal on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Allow OneSignal notifications', exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { oneSignalTestCalls: unknown[][] }).oneSignalTestCalls);
  expect(calls.some(call => call[0] === 'permission')).toBe(false);
  expect(calls[0][1]).toMatchObject({ serviceWorkerPath: 'onesignal/OneSignalSDKWorker.js', serviceWorkerParam: { scope: '/onesignal/' }, welcomeNotification: { disable: true } });
  await page.getByRole('button', { name: 'Allow OneSignal notifications', exact: true }).click();
  await expect(page.getByText('1 devices enabled for this care recipient.', { exact: true })).toBeVisible();
  expect(actions).toEqual(['begin_onesignal_push', 'subscribe_onesignal_push']);
  await expect(page.getByText('Browser push: enabled for this profile', { exact: true })).toBeVisible();
});
