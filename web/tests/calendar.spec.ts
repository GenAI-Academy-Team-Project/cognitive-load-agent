import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { CalendarState } from '../lib/calendar-types';

test('calendar shows integration availability and protects disabled and unauthorized requests', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByText(/Google Calendar is off or needs credentials/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Google Calendar', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Schedule appointment', exact: true })).toBeDisabled();
  await expect(page.getByText('Google Calendar setup is required for scheduling, rescheduling, and cancellation.', { exact: false })).toBeVisible();
  const unknown = await page.request.get('/api/calendar?recipientId=someone-else');
  expect(unknown.status()).toBe(403);
  const crossOrigin = await page.request.post('/api/calendar', { headers: { Origin: 'https://other.example' }, data: { action: 'connect', recipientId: 'recipient-alex' } });
  expect(crossOrigin.status()).toBe(403);
  const callback = await page.request.get('/api/calendar/callback?state=invalid', { maxRedirects: 0 });
  expect(callback.status()).toBe(303);
  expect(callback.headers().location).toContain('Invalid+Google+authorization');
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('linked responsibility navigation offers reschedule and cancel, shows combined preview, and prefills an approved update', async ({ page }) => {
  const dashboard = await (await page.request.get('/api/state')).json();
  const task = dashboard.tasks.find((item: { category: string }) => item.category === 'appointment');
  const data: CalendarState = {
    configured: true, connection: { email: 'organizer@example.test', status: 'connected' },
    binding: { calendar_id: 'primary', calendar_name: 'Care calendar' }, calendars: [{ id: 'primary', summary: 'Care calendar' }],
    appointments: [{ id: 'visit', task_id: task.id, member_id: 'owner', connection_id: 'google', calendar_id: 'primary', event_id: 'event', title: task.title, start_at: '2030-01-15T15:00:00Z', end_at: '2030-01-15T16:00:00Z', timezone: 'America/Toronto', location: 'Clinic', attendees_json: '[]', reminder_minutes: '30', status: 'confirmed', html_link: 'https://calendar.google.com/calendar/event?eid=test', canManage: true }], actions: [],
  };
  const calls: string[] = [];
  await page.route('**/api/calendar?*', route => route.fulfill({ json: data }));
  await page.route('**/api/calendar', async route => {
    const body = route.request().postDataJSON(); calls.push(body.action);
    if (body.action === 'propose') data.actions = [{ id: 'combined', kind: 'reschedule', status: 'pending', error: null, htmlLink: null, payload: { title: task.title, start: '2030-01-15T19:00:00Z', end: '2030-01-15T20:00:00Z', timeZone: 'America/Toronto', location: 'Clinic', attendees: [], reminderMinutes: 30, taskId: task.id, appointmentId: 'visit', eventId: 'event', etag: 'v1', calendarId: 'primary', calendarName: 'Care calendar', organizer: 'organizer@example.test', carePlan: { changes: [{ taskId: task.id, title: task.title, owner: 'Owner', before: '2030-01-15T15:00:00Z', after: '2030-01-15T19:00:00Z', signature: 'root', status: 'scheduled' }, { taskId: 'ride', title: 'Drive Alex', owner: 'Noah', before: '2030-01-15T14:30:00Z', after: '2030-01-15T18:30:00Z', signature: 'ride', status: 'scheduled' }], conflicts: [] } } }];
    if (body.action === 'approve') data.actions[0].status = 'executed';
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/?view=Responsibilities');
  const card = page.locator('.care-responsibilities div[data-care-tone]').filter({ has: page.getByRole('heading', { name: task.title, exact: true }) });
  await card.getByRole('button', { name: 'Schedule / manage calendar' }).click();
  const selected = page.getByRole('region', { name: 'Selected care responsibility' });
  await expect(selected.getByRole('button', { name: 'Reschedule', exact: true })).toBeEnabled();
  await expect(selected.getByRole('button', { name: 'Cancel appointment', exact: true })).toBeEnabled();
  await selected.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await page.getByRole('button', { name: 'Review change', exact: true }).click();
  const linked = page.getByRole('region', { name: 'Linked care changes' });
  await expect(linked).toContainText('Drive Alex');
  await expect(linked).toContainText('Caregivers must reconfirm');
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Approve change and notify guests' }).click();
  await page.getByRole('button', { name: 'Prepare caregiver update' }).click();
  const composer = page.getByRole('region', { name: 'Compose notification' });
  await expect(composer.getByLabel('Notification title', { exact: true })).toHaveValue(/rescheduled/);
  await expect(composer.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/Drive Alex/);
  await expect(composer.getByLabel('Receiving caregiver')).toHaveValue('');
  expect(calls).toEqual(['propose', 'approve']);
});

test('an incomplete calendar save offers recovery without a completion message or notification', async ({ page }) => {
  const data: CalendarState = { configured: true, connection: { email: 'owner@example.test', status: 'connected' }, binding: { calendar_id: 'primary', calendar_name: 'Care calendar' }, calendars: [{ id: 'primary', summary: 'Care calendar' }], appointments: [], actions: [{ id: 'partial', kind: 'reschedule', status: 'uncertain', htmlLink: null, error: 'Google Calendar was updated, but the care-plan save is incomplete.', payload: { title: 'Physiotherapy', start: '2030-01-15T19:00:00Z', end: '2030-01-15T20:00:00Z', timeZone: 'America/Toronto', location: '', attendees: [], reminderMinutes: 0, taskId: 'task', appointmentId: 'visit', eventId: 'event', etag: 'v1', calendarId: 'primary', calendarName: 'Care calendar', organizer: 'owner@example.test', googleConfirmed: true, carePlan: { changes: [], conflicts: ['Noah is unavailable at the new time.'] } } }] };
  await page.route('**/api/calendar?*', route => route.fulfill({ json: data }));
  await page.goto('/?view=Calendar');
  await expect(page.getByText(/care-plan save is incomplete/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve remaining care changes' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Review remaining changes' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Prepare caregiver update' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Discard proposal' })).toHaveCount(0);
  data.binding = null;
  await page.reload();
  await expect(page.getByText('Choose a calendar below to enable scheduling, rescheduling, and cancellation for this person.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review remaining changes' })).toBeDisabled();
});

test('invitation editor shows review before approval and a confirmed calendar link', async ({ page }) => {
  const data: CalendarState = { configured: true, connection: { email: 'organizer@example.test', status: 'connected' }, binding: { calendar_id: 'primary', calendar_name: 'Care calendar' }, calendars: [{ id: 'primary', summary: 'Care calendar' }], appointments: [], actions: [] };
  const calls: string[] = [];
  await page.route('**/api/calendar?*', (route) => route.fulfill({ json: data }));
  await page.route('**/api/calendar', async (route) => {
    const body = route.request().postDataJSON(); calls.push(body.action);
    if (body.action === 'propose') data.actions = [{ id: 'proposal-one', kind: 'create', status: 'pending', error: null, htmlLink: null, payload: { title: body.title, start: '2030-01-15T20:30:00.000Z', end: '2030-01-15T21:30:00.000Z', timeZone: body.timeZone, location: body.location, attendees: [body.attendees], reminderMinutes: 30, taskId: 'new-task', appointmentId: 'new-appointment', eventId: 'google-event', etag: '', calendarId: 'primary', calendarName: 'Care calendar', organizer: 'organizer@example.test' } }];
    if (body.action === 'edit') Object.assign(data.actions[0].payload, { title: body.title, location: body.location, attendees: [body.attendees] });
    if (body.action === 'approve') { data.actions[0].status = 'executed'; data.actions[0].htmlLink = 'https://calendar.google.com/calendar/event?eid=test'; }
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Schedule appointment', exact: true }).click();
  await page.getByLabel('Event title').fill('Physiotherapy visit');
  for (const label of ['Starts', 'Ends']) {
    await page.getByRole('button', { name: `${label} date`, exact: true }).click();
    await page.getByRole('combobox', { name: 'Choose the Year' }).selectOption('2030');
    await page.getByRole('combobox', { name: 'Choose the Month' }).selectOption('0');
    await page.getByRole('button', { name: /Tuesday, January 15th, 2030/ }).click();
    await page.getByRole('button', { name: `${label} time`, exact: true }).click();
    await page.getByRole('combobox', { name: `${label} time hour`, exact: true }).click();
    await page.getByRole('option', { name: label === 'Starts' ? '03' : '04', exact: true }).click();
    await page.getByRole('combobox', { name: `${label} time minute`, exact: true }).click();
    await page.getByRole('option', { name: '30', exact: true }).click();
    await page.getByRole('combobox', { name: `${label} time am/pm`, exact: true }).click();
    await page.getByRole('option', { name: 'PM', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('button', { name: `${label} time`, exact: true })).toContainText(label === 'Starts' ? '03:30 PM' : '04:30 PM');
  }
  await page.getByLabel('Guest email addresses').fill('maya@example.test');
  await page.getByLabel('Location', { exact: true }).fill('Clinic');
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Review invitation' }).click();
  await expect(page.getByRole('heading', { name: 'Review before sending' })).toBeVisible();
  await expect(page.getByText('maya@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('organizer@example.test · Care calendar')).toBeVisible();
  expect(calls).toEqual(['propose']);
  await page.getByRole('button', { name: 'Edit proposal', exact: true }).click();
  await expect(page.getByLabel('Event title')).toHaveValue('Physiotherapy visit');
  await expect(page.getByLabel('Guest email addresses')).toHaveValue('maya@example.test');
  await expect(page.getByRole('button', { name: 'Starts time', exact: true })).toContainText('03:30 PM');
  await page.getByLabel('Event title').fill('Updated physiotherapy visit');
  await page.getByLabel('Location', { exact: true }).fill('New clinic');
  await page.getByRole('button', { name: 'Save and review' }).click();
  await expect(page.getByText('New clinic', { exact: true })).toBeVisible();
  expect(calls).toEqual(['propose', 'edit']);
  await page.getByRole('button', { name: 'Approve and send invite' }).click();
  await expect(page.getByRole('link', { name: 'View event' })).toHaveAttribute('href', 'https://calendar.google.com/calendar/event?eid=test');
  expect(calls).toEqual(['propose', 'edit', 'approve']);

});
