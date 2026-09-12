import { expect, test } from '@playwright/test';

test('saved mobile push topic can be revealed, replaced, and read after reload', async ({ page }) => {
  const dashboard = await (await page.request.get('/api/state')).json();
  const settings = await (await page.request.get(`/api/notifications?recipientId=${dashboard.selectedRecipient.id}`)).json();
  let topic: string | null = 'saved-care-topic';
  await page.route('**/api/notifications?*', route => route.fulfill({ json: { ...settings, ntfyEnabled: Boolean(topic), ntfyTopic: topic, channels: ['in_app', 'ntfy'] } }));
  await page.route('**/api/notifications', async route => {
    const payload = route.request().postDataJSON();
    expect(payload.recipientId).toBe(dashboard.selectedRecipient.id);
    topic = payload.action === 'disable_ntfy' ? null : payload.topic;
    await route.fulfill({ json: { ...settings, ntfyEnabled: Boolean(topic), ntfyTopic: topic, channels: ['in_app', 'ntfy'] } });
  });
  await page.goto('/?view=Notifications');
  await expect(page.getByText('saved-care-topic', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show current mobile push topic', exact: true }).click();
  await expect(page.getByText('saved-care-topic', { exact: true })).toBeVisible();
  await page.getByLabel('New mobile push topic', { exact: true }).fill('replacement-care-topic');
  await page.getByRole('button', { name: 'Replace mobile push topic', exact: true }).click();
  await page.getByRole('button', { name: 'Show current mobile push topic', exact: true }).click();
  await expect(page.getByText('replacement-care-topic', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Show current mobile push topic', exact: true }).click();
  await expect(page.getByText('replacement-care-topic', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Disable mobile push', exact: true }).click();
  await expect(page.getByText('Current mobile push topic:', { exact: true })).toBeHidden();
});
