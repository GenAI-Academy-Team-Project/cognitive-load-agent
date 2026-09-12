import { expect, test } from '@playwright/test';

test('template upgrade requires reviewing and confirming, and cancel does not apply', async ({ page }) => {
  const state = await (await page.request.get('/api/state')).json();
  state.currentPlan.update_available = true;
  state.currentPlan.latest_version = '2';
  let applied = 0;
  await page.route('**/api/state*', async (route) => {
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    if (body.action === 'preview_plan_upgrade') return route.fulfill({ json: { fromVersion: '1', toVersion: '2', upgradeReview: 'reviewed-version', additions: [{ title: 'Review weekly coverage', category: 'coordination', dueOffsetDays: 2 }] } });
    if (body.action === 'upgrade_plan') { expect(body.upgradeReview).toBe('reviewed-version'); applied++; state.currentPlan.update_available = false; }
    return route.fulfill({ json: state });
  });
  await page.goto('/?view=Care%20plan');
  await page.getByRole('button', { name: 'Review and apply' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review template upgrade' });
  await expect(dialog.getByText('Review weekly coverage')).toBeVisible();
  expect(applied).toBe(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(applied).toBe(0);
  await page.getByRole('button', { name: 'Review and apply' }).click();
  await dialog.getByRole('button', { name: 'Apply reviewed changes' }).click();
  await expect(dialog).not.toBeVisible();
  expect(applied).toBe(1);
});
