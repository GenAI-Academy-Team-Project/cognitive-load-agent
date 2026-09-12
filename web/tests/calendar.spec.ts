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

test('invitation editor shows review before approval and a confirmed calendar link', async ({ page }) => {
  const data: CalendarState = { configured: true, connection: { email: 'organizer@example.test', status: 'connected' }, binding: { calendar_id: 'primary', calendar_name: 'Care calendar' }, calendars: [{ id: 'primary', summary: 'Care calendar' }], appointments: [], actions: [] };
  const calls: string[] = [];
  await page.route('**/api/calendar?*', (route) => route.fulfill({ json: data }));
  await page.route('**/api/calendar', async (route) => {
    const body = route.request().postDataJSON(); calls.push(body.action);
    if (body.action === 'propose') data.actions = [{ id: 'proposal-one', kind: 'create', status: 'pending', error: null, htmlLink: null, payload: { title: body.title, start: '2030-01-15T20:30:00.000Z', end: '2030-01-15T21:30:00.000Z', timeZone: body.timeZone, location: body.location, attendees: [body.attendees], reminderMinutes: 30, taskId: 'new-task', appointmentId: 'new-appointment', eventId: 'google-event', etag: '', calendarId: 'primary', calendarName: 'Care calendar', organizer: 'organizer@example.test' } }];
    if (body.action === 'approve') { data.actions[0].status = 'executed'; data.actions[0].htmlLink = 'https://calendar.google.com/calendar/event?eid=test'; }
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Schedule appointment', exact: true }).click();
  await page.getByLabel('Event title').fill('Physiotherapy visit');
  await page.getByLabel('Starts', { exact: true }).fill('2030-01-15T15:30');
  await page.getByLabel('Ends', { exact: true }).fill('2030-01-15T16:30');
  await page.getByLabel('Guest email addresses').fill('maya@example.test');
  await page.getByLabel('Location', { exact: true }).fill('Clinic');
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Review invitation' }).click();
  await expect(page.getByRole('heading', { name: 'Review before sending' })).toBeVisible();
  await expect(page.getByText('maya@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('organizer@example.test · Care calendar')).toBeVisible();
  expect(calls).toEqual(['propose']);
  await page.getByRole('button', { name: 'Approve and send invite' }).click();
  await expect(page.getByRole('link', { name: 'View event' })).toHaveAttribute('href', 'https://calendar.google.com/calendar/event?eid=test');
  expect(calls).toEqual(['propose', 'approve']);
  await page.screenshot({ path: 'test-results/calendar-confirmed.png', fullPage: true });
});
