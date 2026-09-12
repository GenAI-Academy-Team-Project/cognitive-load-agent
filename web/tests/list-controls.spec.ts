import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const [view, field, label] of [
  ['Notifications', 'notifications', 'Notifications'],
  ['Responsibilities', 'tasks', 'Responsibilities'],
  ['Timeline', 'events', 'Activity log'],
  ['Memory', 'memories', 'Trusted facts'],
  ['Care circle', 'careCircle', 'Care circle'],
  ['Evaluations', 'traces', 'Evaluations'],
] as const) {
  test(`${label} supports search and all pages`, async ({ page }) => {
    const state = await (await page.request.get('/api/state')).json();
    expect(state[field].length).toBeGreaterThan(0);
    state[field] = Array.from({ length: 13 }, (_, i) => ({ ...state[field][0], id: `list-${i}`, title: `Searchable record ${i}`, name: `Searchable record ${i}`, source: i % 2 ? 'calendar' : 'caregiver' }));
    await page.route('**/api/state*', route => route.fulfill({ json: state }));
    await page.goto('/?view=' + encodeURIComponent(view));
    const nav = page.getByRole('navigation', { name: `${label} pagination`, exact: true }).first();
    await expect(nav).toContainText('1–6 of 13');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('7–12 of 13');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('13–13 of 13');
    await expect(nav.getByRole('button', { name: 'Next' })).toBeDisabled();
    const filters = page.getByRole('group', { name: `Filter ${label}`, exact: true });
    await filters.getByRole('searchbox').fill('Searchable record 12');
    await expect(filters).toContainText('1 matching of 13');
    await expect(nav).toBeHidden();
    await filters.getByRole('searchbox').fill('nothing matches this');
    await expect(page.getByText('No matches. Change or clear your filters to see more.', { exact: true })).toBeVisible();
    await filters.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(nav).toContainText('1–6 of 13');
    if (view === 'Timeline') {
      await filters.getByRole('combobox', { name: 'Source', exact: true }).selectOption('calendar');
      await expect(filters).toContainText('6 matching of 13');
      await filters.getByRole('button', { name: 'Clear filters', exact: true }).click();
    }
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).include('.care-filters').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
  });
}

test('organizer task and routine lists paginate independently', async ({ page }) => {
  const dashboard = await (await page.request.get('/api/state')).json();
  const result = await (await page.request.get('/api/planning?recipientId=' + dashboard.selectedRecipient.id)).json();
  const planning = result.state;
  planning.tasks = Array.from({ length: 13 }, (_, i) => ({ ...planning.tasks[0], id: `task-page-${i}`, title: `Planned task ${i}`, status: 'open' }));
  planning.anticipation.routines = Array.from({ length: 13 }, (_, i) => ({ category: 'wellbeing', every_days: 7, next_at: '2026-10-12T12:00:00Z', updated_at: '2026-09-12T12:00:00Z', id: `routine-page-${i}`, title: `Care routine ${i}` }));
  await page.route('**/api/planning?*', route => route.fulfill({ json: result }));
  await page.goto('/?view=Care%20Organizer');
  const tools = page.getByRole('group', { name: 'Planning tools', exact: true });
  for (const [tab, label] of [['Task planning', 'Task planning'], ['Recurring care', 'Care routines']]) {
    await tools.getByRole('button', { name: tab, exact: true }).click();
    const nav = page.getByRole('navigation', { name: `${label} pagination`, exact: true });
    await expect(nav).toContainText('1–6 of 13');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('7–12 of 13');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('13–13 of 13');
  }
  await tools.getByRole('button', { name: 'What if?', exact: true }).click();
  await expect(page.locator('select fieldset')).toHaveCount(0);
});
