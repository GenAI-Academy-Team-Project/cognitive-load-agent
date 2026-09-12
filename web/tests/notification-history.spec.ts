import { expect, test } from '@playwright/test';

test('remove one, clear all and restore preserve delivery records and show new attempts', async ({ page, baseURL }) => {
  const state = await (await page.request.get('/api/state')).json();
  const careRecipientId = state.selectedRecipient.id;
  const member = state.careCircle.find((item: { email: string }) => item.email === state.currentUser.email);
  const headers = { Origin: baseURL! };
  async function send(title: string) {
    const proposed = await page.request.post('/api/chat', { headers, data: { action: 'propose_notification', recipientId: careRecipientId, notification: { channel: 'in_app', memberId: member.id, title, detail: 'History test' } } });
    expect(proposed.status()).toBe(200);
    const actionId = (await proposed.json()).messages.at(-1).action.id;
    expect((await page.request.post('/api/chat', { headers, data: { action: 'approve_action', recipientId: careRecipientId, actionId } })).status()).toBe(200);
    return actionId;
  }
  const first = await send('First history entry');
  await send('Second history entry');
  await page.goto('/?view=Notifications');
  const settings = page.getByRole('region', { name: 'Notification preferences' });
  await settings.getByRole('button', { name: /Remove delivery attempt: First history entry/ }).click();
  await expect(settings.getByText(/First history entry →/)).toHaveCount(0);
  await expect(settings.getByText(/Second history entry →/)).toBeVisible();
  await page.reload();
  await expect(settings.getByText(/Second history entry →/)).toBeVisible();
  await expect(settings.getByText(/First history entry →/)).toHaveCount(0);
  await settings.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(settings.getByText('No delivery attempts to show.')).toBeVisible();
  await send('New history entry');
  await page.reload();
  await expect(settings.getByText(/New history entry →/)).toBeVisible();
  await expect(settings.getByText(/Second history entry →/)).toHaveCount(0);
  await settings.getByRole('button', { name: 'Restore history' }).click();
  await expect(settings.getByText(/First history entry →/)).toBeVisible();
  await expect(settings.getByText(/Second history entry →/)).toBeVisible();
  expect((await page.request.post('/api/chat', { headers, data: { action: 'approve_action', recipientId: careRecipientId, actionId: first } })).status()).toBe(409);
  expect((await page.request.post('/api/notifications', { headers, data: { action: 'dismiss_history', careRecipientId, actionId: 'unrelated' } })).status()).toBe(404);
  expect((await page.request.post('/api/notifications', { headers, data: { action: 'clear_history', careRecipientId: 'unrelated' } })).status()).toBe(403);
});
