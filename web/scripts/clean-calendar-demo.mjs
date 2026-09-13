import { request } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Only the recipient recorded by this seeder is eligible. Never search by name
// and delete matches: real recipients may share the same display name.
export async function cleanCalendarDemo() {
  const dir = fileURLToPath(new URL('../.playwright-runs/live-demo/', import.meta.url));
  const file = `${dir}/calendar-demo.local.json`;
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!data.recipientId) { writeFileSync(file, '{}', { mode: 0o600 }); return; }
  const baseURL = 'https://carestead.com:8083';
  const api = await request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${dir}/owner-auth.json`, extraHTTPHeaders: { Origin: baseURL } });
  async function json(r) { const value = await r.json(); if (!r.ok()) throw new Error(`${r.status()}: ${value.error}`); return value; }
  const get = path => api.get(path).then(json);
  const post = (path, body) => api.post(path, { data: body }).then(json);
  const calendar = (action, fields = {}) => post('/api/calendar', { action, recipientId: data.recipientId, ...fields });
  try {
    const account = await get('/api/state');
    if (account.currentUser.id !== data.ownerId) throw new Error('Clean mode requires the same login that created this demo.');
    const recipient = account.recipients.find(item => item.id === data.recipientId);
    if (!recipient) {
      if (!data.cleanupCalendarDone) throw new Error('The demo recipient is unavailable. Check its Google event manually before resetting; local deletion may have left an external event.');
      writeFileSync(file, '{}', { mode: 0o600 }); return;
    }
    if (recipient.display_name !== 'Alex (calendar demo)') throw new Error('The demo recipient was renamed. Clean mode stopped to protect edited care data.');
    const current = await get(`/api/calendar?recipientId=${data.recipientId}`);
    if (current.actions.some(action => ['executing', 'uncertain'].includes(action.status))) throw new Error('Resolve the incomplete Google action in Calendar using Retry / check result or Review remaining changes before running clean mode.');
    const appointments = current.appointments.filter(item => item.status === 'confirmed');
    if (appointments.some(item => item.task_id !== data.taskId || !item.canManage || JSON.parse(item.attendees_json).length)) throw new Error('This demo contains an additional, transferred, or guest-bearing appointment. Review those records manually before cleaning.');
    for (const action of current.actions.filter(item => ['pending', 'failed'].includes(item.status))) await calendar('reject', { actionId: action.id });
    for (const appointment of appointments) {
      const proposed = await calendar('propose', { kind: 'cancel', appointmentId: appointment.id });
      // Google supplies the current guest list; stored app data may be stale.
      const review = await get(`/api/calendar?recipientId=${data.recipientId}`);
      const action = review.actions.find(item => item.id === proposed.actionId);
      if (action.payload.attendees.length) {
        await calendar('reject', { actionId: action.id });
        throw new Error('Guests were added to the demo event in Google. Review cancellation manually; clean mode has not notified them.');
      }
      await calendar('approve', { actionId: proposed.actionId });
    }
    data.cleanupCalendarDone = true;
    writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
    await post('/api/state', { action: 'delete_recipient', recipientId: data.recipientId, confirmName: 'Alex (calendar demo)' });
    writeFileSync(file, '{}', { mode: 0o600 });
    console.log('Cleaned only the seed-owned Alex calendar demo and cancelled its guest-free Google event.');
  } finally { await api.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await cleanCalendarDemo();
  console.log('Demo cleanup complete. Your login, Google connection, and other recipients are preserved.');
}
