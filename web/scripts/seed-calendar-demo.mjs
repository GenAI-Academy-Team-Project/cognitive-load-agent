// Preload the real app through its authenticated APIs. No mocked Google results.
// Run live-demo-login.mjs first. Existing user/email/Google credentials are preserved.
import { request } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { demoDay, demoInstant } from './calendar-demo-time.mjs';
import { demoApi } from './calendar-demo-api.mjs';
import { assertDemoAppointmentsSafe } from './calendar-demo-guard.mjs';

const baseURL = 'https://carestead.com:8083';
const dir = fileURLToPath(new URL('../.playwright-runs/live-demo/', import.meta.url));
mkdirSync(dir, { recursive: true });
const file = `${dir}/calendar-demo.local.json`;
const dateArg = process.argv.find(arg => arg.startsWith('--date='))?.slice(7);
// Validate a requested replacement date before removing the old rehearsal.
const nextDay = demoDay(dateArg);
if (process.argv.includes('--clean')) {
  const { cleanCalendarDemo } = await import('./clean-calendar-demo.mjs');
  await cleanCalendarDemo();
}
const reset = process.argv.includes('--reset');
const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
if (dateArg && data.day && dateArg !== data.day) throw new Error('This rehearsal already has a date. Use its existing date; do not silently move a prepared event to another day.');
data.day ??= nextDay;
demoDay(data.day);
data.recipientName = 'Alex (calendar demo)';
data.title = 'Alex physiotherapy (Carestead demo)';
const zone = 'America/Toronto';
const demoGuest = 'deventhusiast.ailearningsupport@gmail.com';
const instant = (hour, minute = 0) => demoInstant(data.day, hour, minute);
const save = () => writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${dir}/owner-auth.json`, extraHTTPHeaders: { Origin: baseURL } });
const { get, post } = demoApi(api);
const state = (action, fields = {}) => post('/api/state', { action, recipientId: data.recipientId, ...fields });
const plan = (action, fields = {}) => post('/api/planning', { action, recipientId: data.recipientId, ...fields });
const calendar = (action, fields = {}) => post('/api/calendar', { action, recipientId: data.recipientId, ...fields });
const calendarState = () => get(`/api/calendar?recipientId=${data.recipientId}`);
const proposal = (hour, appointmentId) => calendar('propose', { kind: 'reschedule', appointmentId, timeZone: zone, startLocal: `${data.day}T${String(hour).padStart(2, '0')}:00`, endLocal: `${data.day}T${String(hour + 1).padStart(2, '0')}:00`, title: data.title, attendees: '', location: 'Demo clinic', reminderMinutes: 30 });
try {
  const account = await get('/api/state');
  if (account.currentUser.role !== 'owner') throw new Error('Sign in with your existing owner account before preloading.');
  if (data.ownerId && data.ownerId !== account.currentUser.id) throw new Error('This rehearsal belongs to a different login. Sign in with its original owner.');
  data.ownerId = account.currentUser.id;
  data.ownerEmail = account.currentUser.email;
  data.ownerName = account.currentUser.displayName;
  const connected = await get(`/api/calendar?recipientId=${data.recipientId || account.selectedRecipient.id}`);
  if (!connected.capabilities?.linkedRescheduling) throw new Error('The running app needs the updated Calendar build. Restart your local preview with the latest code before seeding. No patient or Google event has been created by this run.');
  if (!connected.configured || connected.connection?.status !== 'connected') throw new Error('Setup required: enable Google Calendar, connect your existing Google account, and select a calendar in the app. Nothing will be simulated.');
  data.calendarId ??= connected.binding?.calendar_id;
  data.calendarName ??= connected.binding?.calendar_name;
  if (!data.calendarId) throw new Error('Select a calendar for the currently selected person in Calendar, then rerun.');
  save();
  if (!data.recipientId) {
    const created = await post('/api/state', { action: 'create_recipient', displayName: data.recipientName, timezone: zone, templateKey: 'mobility-physio', consentAccepted: true, nonClinicalAcknowledged: true, responsibilities: [{ title: data.title, category: 'appointment', due_offset_days: '2' }, { title: 'Drive Alex to physiotherapy', category: 'transport', due_offset_days: '2' }] });
    data.recipientId = created.selectedRecipient.id;
    data.taskId = created.tasks.find(task => task.category === 'appointment').id;
    data.rideId = created.tasks.find(task => task.category === 'transport').id;
    save();
  }
  if (!data.initialized) {
    await state('update_profile', { preferredName: data.recipientName, careContext: 'Synthetic demonstration of calendar-linked scheduling, transport coordination, and reviewed caregiver updates.', communicationNotes: 'Prefers one concise written update when the appointment changes.', homeBase: 'Toronto — synthetic demo' });
    const memories = await state('add_memory', { kind: 'preference', value: 'Alex prefers one concise written update when appointment times change.', source: 'Synthetic demo preference, reviewed with Alex', confidence: 'high' });
    await state('verify_memory', { id: memories.memories.find(item => item.value.startsWith('Alex prefers one concise')).id });
    data.memberId = (await get(`/api/planning?recipientId=${data.recipientId}`)).state.memberId;
    await plan('save_availability', { start: instant(8), end: instant(18), categories: ['appointment', 'transport'], capabilities: [] });
    await state('update_task', { id: data.taskId, title: data.title, owner: account.currentUser.displayName, dueAt: instant(10), status: 'scheduled', category: 'appointment' });
    await state('update_task', { id: data.rideId, title: 'Drive Alex to physiotherapy', owner: account.currentUser.displayName, dueAt: instant(9, 30), status: 'scheduled', category: 'transport' });
    await plan('save_task_details', { taskId: data.taskId, ownerMemberId: data.memberId, durationMinutes: 60, dependsOn: '', backupMemberId: '', requirements: [], factIds: [] });
    await plan('save_task_details', { taskId: data.rideId, ownerMemberId: data.memberId, durationMinutes: 30, dependsOn: data.taskId, backupMemberId: '', requirements: [], factIds: [] });
    await calendar('select_calendar', { calendarId: data.calendarId });
    data.initialized = true; save();
  }
  let current = await calendarState();
  if (reset) assertDemoAppointmentsSafe(current.appointments, data);
  if (!data.createId) {
    const existing = current.actions.find(a => a.kind === 'create' && a.payload.taskId === data.taskId && a.status !== 'rejected');
    data.createId = existing?.id || (await calendar('propose', { kind: 'create', taskId: data.taskId, title: data.title, timeZone: zone, startLocal: `${data.day}T10:00`, endLocal: `${data.day}T11:00`, attendees: '', location: 'Demo clinic', reminderMinutes: 30 })).actionId;
    save();
  }
  // Preload one real Google event with NO guests. No caregiver notification is sent.
  await calendar('approve', { actionId: data.createId });
  current = await calendarState();
  let appointment = current.appointments.find(a => a.task_id === data.taskId && a.status === 'confirmed');
  assert(appointment, 'Google appointment must be confirmed before preparing the demonstration.');
  data.appointmentId = appointment.id; save();
  if (reset) {
    for (const pending of current.actions.filter(a => a.kind === 'reschedule' && a.payload.taskId === data.taskId && !['executed', 'rejected'].includes(a.status))) {
      if (!['pending', 'failed'].includes(pending.status)) throw new Error('Resolve the incomplete Google action in Calendar before resetting.');
      await calendar('reject', { actionId: pending.id });
    }
    if (Date.parse(appointment.start_at) !== Date.parse(instant(10))) {
      const rollback = await proposal(10, appointment.id);
      // The live Google guest list can differ from the locally stored copy.
      const review = (await calendarState()).actions.find(action => action.id === rollback.actionId);
      if (!review || !Array.isArray(review.payload?.attendees) || review.payload.attendees.length) {
        await calendar('reject', { actionId: rollback.actionId });
        throw new Error('Reset stopped: Google guest details require manual review. Review cancellation in Carestead Calendar, then rerun with --clean. No rollback was approved.');
      }
      await calendar('approve', { actionId: rollback.actionId });
    }
    data.ready = false; data.rescheduleId = undefined; save();
  } else if (data.ready) {
    const pending = current.actions.find(a => a.id === data.rescheduleId);
    if (pending?.status !== 'pending') throw new Error('The recording proposal has already been used. Run with --reset for another take.');
  }
  if (!data.ready) {
    current = await calendarState();
    appointment = current.appointments.find(a => a.id === data.appointmentId);
    assert.equal(Date.parse(appointment.start_at), Date.parse(instant(10)), 'Reset the appointment to 10 AM before preparing another take.');
    await plan('accept_task', { taskId: data.taskId });
    await plan('accept_task', { taskId: data.rideId });
    const snapshot = (await get(`/api/planning?recipientId=${data.recipientId}`)).state.handover.snapshot;
    await plan('acknowledge', { snapshot: JSON.stringify(snapshot) });
    const existing = current.actions.find(a => a.kind === 'reschedule' && a.payload.taskId === data.taskId && a.status === 'pending');
    data.rescheduleId = existing?.id || (await proposal(14, data.appointmentId)).actionId;
    const checked = (await calendarState()).actions.find(a => a.id === data.rescheduleId);
    assert(checked.payload.carePlan, 'The running app needs the new Calendar build. The reschedule remains unapproved.');
    assert.equal(checked.payload.carePlan.changes.length, 2);
    assert.deepEqual(checked.payload.carePlan.conflicts, []);
    assert.equal(Date.parse(checked.payload.carePlan.changes.find(c => c.taskId === data.rideId).after), Date.parse(instant(13, 30)));
    data.ready = true; save();
  }
  // Prepare guest delivery for review; the original Google event stays unchanged.
  const readyState = await calendarState();
  const readyProposal = readyState.actions.find(action => action.id === data.rescheduleId);
  assert.equal(readyProposal?.status, 'pending', 'The reschedule must remain pending for guest review.');
  if (!readyProposal.payload.attendees.includes(demoGuest)) {
    await calendar('edit', { actionId: readyProposal.id, title: readyProposal.payload.title, timeZone: zone, startLocal: `${data.day}T14:00`, endLocal: `${data.day}T15:00`, attendees: [...readyProposal.payload.attendees, demoGuest].join(', '), location: readyProposal.payload.location, reminderMinutes: readyProposal.payload.reminderMinutes });
  }
  const guestReview = (await calendarState()).actions.find(action => action.id === data.rescheduleId);
  assert(guestReview.payload.attendees.includes(demoGuest), 'Restart the app with guest editing support, then rerun.');
  const url = `${baseURL}/?view=Calendar&recipientId=${data.recipientId}`;
  writeFileSync(`${dir}/calendar-demo.local.md`, `# Your prepared recording\n\nAccount: ${data.ownerName} (${data.ownerEmail})\n\nRecipient: **${data.recipientName}**\n\nDate: **${data.day}**, America/Toronto\n\nCalendar: **${data.calendarName}**\n\n[Open the prepared proposal](${url})\n\nAppointment: 10:00 AM → 2:00 PM. Ride: 9:30 AM → 1:30 PM.\n\nThe 10 AM Google event is real and has no guests. The 2 PM change includes ${demoGuest} under Guests receiving updates and awaits your on-camera approval. No guest update is sent before approval. Select **${data.ownerName}** as the notification recipient. Your own account owns both synthetic responsibilities.\n\n[Open evaluations](${baseURL}/?view=Evaluations&recipientId=${data.recipientId})\n\nScript: docs/calendar-demo-recording.md\n`, { mode: 0o600 });
  console.log(`Ready: ${data.recipientName}, ${data.day}. Open ${url}\nOne real Google event created/retained; reschedule awaits approval. No caregiver notification sent.\nRun sheet: web/.playwright-runs/live-demo/calendar-demo.local.md`);
} finally { await api.dispose(); }
