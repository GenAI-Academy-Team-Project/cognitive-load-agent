import { expect, test } from '@playwright/test';

test('evaluation history filters combine, clear, and disappear when redundant; score cards explain their meaning', async ({ page }) => {
  const state = await (await page.request.get('/api/state')).json();
  let traces = [
    { id: 'eval-one', trigger: 'Review pickup', evidence: 'Pickup unassigned', decision: 'Ask caregiver', policy_status: 'human approval required', tool: 'care-state rules', outcome: 'Approval requested', created_at: '2026-09-12T10:00:00Z' },
    { id: 'eval-two', trigger: 'Review coverage', evidence: 'Coverage assigned', decision: 'Keep plan', policy_status: 'allowed', tool: 'care-state rules', outcome: 'Check completed', created_at: '2026-09-12T11:00:00Z' },
    { id: 'eval-three', trigger: 'Save care note', evidence: 'Caregiver approved', decision: 'Save fact', policy_status: 'approved by human', tool: 'Carestead memory', outcome: 'Verified fact saved', created_at: '2026-09-12T12:00:00Z' },
  ];
  await page.route('**/api/state', route => route.fulfill({ json: { ...state, traces } }));
  await page.goto('/?view=Evaluations');
  const filters = page.getByRole('group', { name: 'Filter Evaluations', exact: true });
  await filters.getByRole('combobox', { name: 'Policy result', exact: true }).selectOption('allowed');
  await expect(page.getByRole('heading', { name: 'Review coverage', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review pickup', exact: true })).toBeHidden();
  await filters.getByRole('combobox', { name: 'Tool used', exact: true }).selectOption('Carestead memory');
  await expect(page.getByRole('heading', { name: 'Review coverage', exact: true })).toBeHidden();
  await filters.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await filters.getByRole('searchbox').fill('approved by human');
  await expect(page.getByRole('heading', { name: 'Save care note', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review coverage', exact: true })).toBeHidden();
  for (const label of ['Retrieval', 'Decision', 'Policy', 'Action']) {
    const card = page.getByRole('button', { name: new RegExp(`^${label}.*what this means`) });
    await card.focus();
    await page.keyboard.press('Enter');
    const back = page.getByRole('button', { name: `${label}: show score`, exact: true });
    await expect(back).toHaveAttribute('aria-pressed', 'true');
    await expect(back.locator('[aria-hidden="false"]')).toContainText('Can Carestead');
    await page.keyboard.press('Space');
    await expect(card).toHaveAttribute('aria-pressed', 'false');
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  traces = [traces[0]];
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Review pickup', exact: true })).toBeVisible();
  await expect(filters.getByRole('combobox')).toHaveCount(0);
});
