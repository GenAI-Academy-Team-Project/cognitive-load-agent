import { expect, test } from '@playwright/test';

test('plan upgrades require a current review and preserve existing responsibilities', async ({ request, baseURL }) => {
  const initial = await (await request.get('/api/state')).json();
  const recipientId = initial.selectedRecipient.id;
  const post = (action: string, data: Record<string, unknown> = {}) => request.post('/api/state', {
    headers: { Origin: baseURL! }, data: { action, recipientId, ...data },
  });
  expect((await post('upgrade_plan')).status()).toBe(409);
  const previewResponse = await post('preview_plan_upgrade');
  expect(previewResponse.status()).toBe(200);
  const preview = await previewResponse.json();
  expect(preview.additions.length).toBeGreaterThan(0);
  const unchanged = await (await request.get('/api/state')).json();
  expect(unchanged.currentPlan.template_version).toBe(initial.currentPlan.template_version);
  expect(unchanged.tasks).toEqual(initial.tasks);

  // A caregiver adding one of the proposed tasks changes what must be reviewed.
  const addition = preview.additions[0];
  expect((await post('add_task', { title: addition.title, category: addition.category, dueAt: '2027-01-01T12:00:00Z' })).status()).toBe(200);
  expect((await post('upgrade_plan', { upgradeReview: preview.upgradeReview })).status()).toBe(409);
  const refreshed = await (await post('preview_plan_upgrade')).json();
  const applied = await post('upgrade_plan', { upgradeReview: refreshed.upgradeReview });
  expect(applied.status()).toBe(200);
  const updated = await applied.json();
  expect(updated.currentPlan.template_version).toBe(refreshed.toVersion);
  for (const task of initial.tasks) expect(updated.tasks).toContainEqual(task);
  expect(updated.tasks.filter((task: { title: string }) => task.title === addition.title)).toHaveLength(1);
  expect((await post('upgrade_plan', { upgradeReview: refreshed.upgradeReview })).status()).toBe(409);
});
