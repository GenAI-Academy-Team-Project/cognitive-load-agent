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
  test(`${view} keeps long lists on navigable pages`, async ({ page }) => {
    const state = await (await page.request.get('/api/state')).json();
    expect(state[field].length).toBeGreaterThan(0);
    state[field] = Array.from({ length: 13 }, (_, i) => ({ ...state[field][0], id: `page-item-${i}` }));
    await page.route('**/api/state*', (route) => route.fulfill({ json: state }));
    await page.goto(`/?view=${encodeURIComponent(view)}`);
    const nav = page.getByRole('navigation', { name: `${label} pagination`, exact: true }).first();
    await expect(nav).toContainText('1–6 of 13');
    await expect(nav.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('7–12 of 13');
    await nav.getByRole('button', { name: 'Next' }).click();
    await expect(nav).toContainText('13–13 of 13');
    await expect(nav.getByRole('button', { name: 'Next' })).toBeDisabled();
    await nav.getByRole('button', { name: 'Previous' }).click();
    await expect(nav).toContainText('7–12 of 13');
    expect((await new AxeBuilder({ page }).include(`nav[aria-label="${label} pagination"]`).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  });
}

test('inbox removal and clear all preserve approvals and restore entries', async ({ page, baseURL }) => {
  const state = await (await page.request.get('/api/state')).json();
  const recipientId = state.selectedRecipient.id;
  const member = state.careCircle.find((item: { email: string }) => item.email === state.currentUser.email);
  const headers = { Origin: baseURL! };
  const proposed = await page.request.post('/api/chat', { headers, data: { action: 'propose_notification', recipientId, notification: { channel: 'in_app', memberId: member.id, title: 'Removable inbox update', detail: 'Review the plan.' } } });
  const actionId = (await proposed.json()).messages.at(-1).action.id;
  expect((await page.request.post('/api/chat', { headers, data: { action: 'approve_action', recipientId, actionId } })).status()).toBe(200);
  await page.goto('/?view=Notifications');
  await page.getByRole('button', { name: 'Remove notification: Removable inbox update', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Removable inbox update', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Removable inbox update', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Removable inbox update', exact: true })).toHaveCount(0);
  const after = await (await page.request.get('/api/state')).json();
  expect(after.notifications.length).toBeGreaterThan(0);
  expect(after.notifications.every((item: { delivery_state: string }) => item.delivery_state === 'needs_approval')).toBe(true);
  expect((await page.request.post('/api/state', { headers, data: { action: 'dismiss_notification', recipientId, id: after.notifications[0].id } })).status()).toBe(409);
  await page.reload();
  await page.getByRole('button', { name: 'Restore notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Removable inbox update', exact: true })).toBeVisible();
});

test('inbox categories keep approvals, risks and delivery problems ahead of routine updates', async ({ page }) => {
  const state = await (await page.request.get('/api/state')).json();
  const base = { ...state.notifications[0], delivery_state: 'delivered', kind: 'reminder', read_at: null };
  state.notifications = [
    ...Array.from({ length: 8 }, (_, i) => ({ ...base, id: `routine-${i}`, title: `Routine notice ${i}` })),
    { ...base, id: 'approval', title: 'Review care assignment', delivery_state: 'needs_approval' },
    { ...base, id: 'failure', title: 'Failed SMS update', provider_status: 'failed', read_at: '2026-09-12T00:00:00Z' },
    { ...base, id: 'risk', title: 'Coverage gap', kind: 'risk' },
  ];
  await page.route('**/api/state*', (route) => route.fulfill({ json: state }));
  await page.goto('/?view=Notifications');
  const filters = page.getByRole('group', { name: 'Filter notifications' });
  await expect(page.getByRole('heading', { name: 'Review care assignment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Failed SMS update' })).toBeVisible();
  await filters.getByRole('button', { name: 'Needs attention (3)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Coverage gap' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Routine notice 0' })).toHaveCount(0);
  await filters.getByRole('button', { name: 'Care updates (8)', exact: true }).click();
  const pagination = page.getByRole('navigation', { name: 'Notifications pagination' });
  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(pagination).toContainText('7–8 of 8');
  await filters.getByRole('button', { name: 'Read (1)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Failed SMS update' })).toBeVisible();
  await filters.getByRole('button', { name: 'Care updates (8)', exact: true }).click();
  await expect(pagination).toContainText('1–6 of 8');
});

for (const [view, field, label, textField] of [
  ['Responsibilities', 'tasks', 'Responsibilities', 'title'],
  ['Memory', 'memories', 'Trusted facts', 'value'],
  ['Timeline', 'events', 'Activity log', 'title'],
  ['Care circle', 'careCircle', 'Care circle', 'display_name'],
] as const) {
  test(`${view} searches across pages and clears no-result filters`, async ({ page }) => {
    const state = await (await page.request.get('/api/state')).json();
    state[field] = Array.from({ length: 13 }, (_, i) => ({ ...state[field][0], id: `filter-${i}`, [textField]: `Searchable entry ${i}` }));
    await page.route('**/api/state*', (route) => route.fulfill({ json: state }));
    await page.goto(`/?view=${encodeURIComponent(view)}`);
    const filters = page.getByRole('group', { name: `Filter ${label}`, exact: true }).first();
    const search = filters.getByRole('searchbox');
    await search.fill('Searchable entry 12');
    await expect(filters.getByRole('status')).toContainText('1 matching of 13');
    await expect(page.getByText('Searchable entry 12', { exact: true }).first()).toBeVisible();
    await search.fill('no matching record');
    await expect(filters.getByRole('status')).toContainText('0 matching');
    await expect(page.getByText('No matches. Change or clear your filters to see more.').first()).toBeVisible();
    await filters.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByRole('navigation', { name: `${label} pagination`, exact: true }).first()).toContainText('1–6 of 13');
  });
}

test('task filters combine category, status and attention without including completed tasks', async ({ page }) => {
  const state = await (await page.request.get('/api/state')).json();
  const task = state.tasks[0];
  state.tasks = [
    { ...task, id: 'overdue', title: 'Overdue transport', category: 'transport', status: 'open', due_at: '2020-01-01T12:00:00Z' },
    { ...task, id: 'future', title: 'Future transport', category: 'transport', status: 'open', due_at: '2099-01-01T12:00:00Z' },
    { ...task, id: 'done', title: 'Completed transport', category: 'transport', status: 'complete', due_at: '2020-01-01T12:00:00Z' },
    { ...task, id: 'household', title: 'Household task', category: 'household', status: 'open', due_at: '2020-01-01T12:00:00Z' },
  ];
  await page.route('**/api/state*', (route) => route.fulfill({ json: state }));
  await page.goto('/?view=Responsibilities');
  const filters = page.getByRole('group', { name: 'Filter Responsibilities', exact: true });
  await filters.getByRole('combobox', { name: 'Category', exact: true }).selectOption('transport');
  await filters.getByRole('combobox', { name: 'Status', exact: true }).selectOption('open');
  await filters.getByRole('checkbox', { name: /Needs attention only/ }).check();
  await expect(page.getByRole('heading', { name: 'Overdue transport', exact: true })).toBeVisible();
  for (const name of ['Future transport', 'Completed transport', 'Household task']) await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include('fieldset[aria-label="Filter Responsibilities"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
});

test('activity log separates sources from known contributors', async ({ page }) => {
  const state = await (await page.request.get('/api/state')).json();
  const name = state.careCircle[0].display_name;
  state.events = ['Grocery receipt', name, 'Shared calendar'].map((source, index) => ({
    ...state.events[0], id: `provenance-${index}`, title: `Provenance update ${index}`, source,
  }));
  await page.route('**/api/state*', (route) => route.fulfill({ json: state }));
  await page.goto('/?view=Timeline');
  const filters = page.getByRole('group', { name: 'Filter Activity log', exact: true });
  const source = filters.getByRole('combobox', { name: 'Source', exact: true });
  const contributor = filters.getByRole('combobox', { name: 'Contributor', exact: true });
  await expect(source.locator('option')).toHaveText(['Any source', 'Grocery receipt', 'Shared calendar']);
  await expect(contributor.locator('option')).toHaveText(['Any contributor', name]);
  await contributor.selectOption(name);
  await expect(filters).toContainText('1 matching of 3');
  await expect(page.getByText(`Contributor · ${name}`, { exact: true })).toBeVisible();
  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await source.selectOption('Grocery receipt');
  await expect(filters).toContainText('1 matching of 3');
  await expect(page.getByText('Source · Grocery receipt', { exact: true })).toBeVisible();
});
