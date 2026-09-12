import { expect, test } from '@playwright/test';
import { handoverTaskFilters } from '../lib/handover-filters';

test('due windows follow recipient days across daylight saving and match ownership', () => {
  const now = Date.parse('2026-03-08T04:30:00Z'); // March 7, 23:30 in Toronto.
  const classify = (due_at: string, owner = 'Alex') => handoverTaskFilters({ due_at, owner }, 'Alex', 'America/Toronto', now);
  expect(classify('2026-03-08T04:45:00Z')).toEqual({ due_window: 'Today', assignment: 'Assigned to me' });
  expect(classify('2026-03-08T05:15:00Z', 'Unassigned')).toEqual({ due_window: 'Next 7 days (after today)', assignment: 'Unassigned' });
  expect(classify('2026-03-08T04:00:00Z', 'Sam')).toEqual({ due_window: 'Overdue', assignment: 'Assigned to someone else' });
  expect(classify('2026-03-15T04:15:00Z').due_window).toBe('Later');
  expect(classify('').due_window).toBe('No due date');
});

test('handover filters prevent acknowledgement and directories stay compact', async ({ page }) => {
  const dashboard = await (await page.request.get('/api/state')).json();
  const result = await (await page.request.get(`/api/planning?recipientId=${dashboard.selectedRecipient.id}`)).json();
  result.state.handover.acknowledgedAt = '2026-01-01T12:00:00Z';
  result.state.handover.changes = [
    { id: 'change-1', label: 'New responsibility', kind: 'task', before: null, after: 'Arrange a visit' },
    { id: 'change-2', label: 'Updated care fact', kind: 'fact', before: 'Previous note', after: 'Updated note' },
    { id: 'change-3', label: 'Removed responsibility', kind: 'task', before: 'Old visit', after: null },
    { id: 'change-4', label: 'Another responsibility', kind: 'task', before: null, after: 'Call support' },
  ];
  dashboard.tasks = [
    { ...dashboard.tasks[0], id: 'due-mine', title: 'My overdue task', status: 'open', owner: dashboard.currentUser.displayName, due_at: new Date(Date.now() - 3600000).toISOString() },
    { ...dashboard.tasks[0], id: 'due-unassigned', title: 'Future unassigned task', status: 'open', owner: 'Unassigned', due_at: new Date(Date.now() + 3 * 86400000).toISOString() },
  ];
  await page.route('**/api/state*', route => route.fulfill({ json: dashboard }));
  await page.route('**/api/planning?*', route => route.fulfill({ json: result }));
  await page.goto('/?view=Handover');
  const acknowledge = page.getByRole('button', { name: 'I’ve reviewed this handover' });
  await expect(acknowledge).toBeEnabled();
  expect(await page.getByText('Filter and manage handover changes', { exact: true }).evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('article h3')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.getByRole('navigation', { name: 'Handover changes pagination' })).toContainText('1–3 of 4');
  await page.getByText('Filter and manage handover changes', { exact: true }).click();
  const filters = page.getByRole('group', { name: 'Filter Handover changes', exact: true });
  await filters.getByRole('combobox', { name: 'Change type', exact: true }).selectOption('removed');
  await expect(filters).toContainText('1 matching of 4');
  await expect(acknowledge).toBeDisabled();
  await expect(page.getByText('Clear handover filters and review all changes before acknowledging the full handover.')).toBeVisible();
  await filters.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(acknowledge).toBeEnabled();
  await filters.getByRole('combobox', { name: 'Information type', exact: true }).selectOption('fact');
  await expect(page.getByRole('heading', { name: 'Updated care fact', exact: true })).toBeVisible();
  await expect(acknowledge).toBeDisabled();
  await filters.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByText('Filter and manage handover changes', { exact: true }).click();
  await page.getByText('Filter and manage due next', { exact: true }).click();
  const dueFilters = page.getByRole('group', { name: 'Filter Due next', exact: true });
  await dueFilters.getByRole('combobox', { name: 'Assignment', exact: true }).selectOption('Assigned to me');
  await expect(dueFilters).toContainText('1 matching of 2');
  await expect(page.getByText('Future unassigned task', { exact: true })).toBeHidden();
  await dueFilters.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await dueFilters.getByRole('combobox', { name: 'Due time', exact: true }).selectOption('Next 7 days (after today)');
  await expect(page.getByText('Future unassigned task', { exact: true })).toBeVisible();
  await expect(page.getByText('My overdue task', { exact: true })).toBeHidden();
  await dueFilters.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByText('Filter and manage due next', { exact: true }).click();
  const directories = page.getByRole('complementary', { name: 'Handover directories' });
  await expect(directories.locator('details[open]')).toHaveCount(0);
  await page.screenshot({ path: '.playwright-runs/handover-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.playwright-runs/handover-mobile.png', fullPage: true });
});
