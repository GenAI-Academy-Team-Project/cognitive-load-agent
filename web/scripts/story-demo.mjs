// Uses deployed authenticated APIs only. No direct D1 writes or fake provider results.
import { request } from 'playwright';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { storyConfig, assertManifest, assertOwnedAppointments, notificationReadiness } from './story-demo-config.mjs';
import { demoApi } from './calendar-demo-api.mjs';
import { demoDay, demoInstant } from './calendar-demo-time.mjs';

const config = storyConfig();
const command = process.argv[2];
if (!['seed', 'clean', 'check'].includes(command)) throw new Error('Use story-demo.mjs seed|check|clean');
if (command === 'seed') {
  demoDay(config.day);
  if (!existsSync(config.image)) throw new Error('Appointment image missing: ' + config.image);
  if (config.day !== '2026-10-20' && !process.env.DEMO_IMAGE) throw new Error('A different DEMO_DATE requires a matching DEMO_IMAGE.');
}
mkdirSync(config.dir, { recursive: true, mode: 0o700 });
const file = `${config.dir}/manifest.json`;
const lock = `${config.dir}/operation.lock`;
// Exclusive creation prevents two terminals from deleting/replacing the same take.
writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
let api;
let data = {};
const save = () => { writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 }); renameSync(`${file}.tmp`, file); };
try {
  data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  api = await request.newContext({ baseURL: config.baseURL, storageState: `${config.dir}/auth.json`, extraHTTPHeaders: { Origin: config.baseURL } });
  const { get, post } = demoApi(api);
  const account = await get('/api/state');
  if (account.currentUser.email?.toLowerCase() !== config.ownerEmail.toLowerCase()) throw new Error('Sign in as ' + config.ownerEmail);
  if (account.currentUser.role !== 'owner') throw new Error('Sign in as the existing demo owner.');
  const scoped = (path, action, fields = {}) => post(path, { action, recipientId: data.recipientId, ...fields });
  const state = (action, fields) => scoped('/api/state', action, fields);
  const plan = (action, fields) => scoped('/api/planning', action, fields);
  const calendar = (action, fields) => scoped('/api/calendar', action, fields);
  const calendarState = () => get(`/api/calendar?recipientId=${data.recipientId}`);

  async function clean() {
    if (!data.recipientId && data.phase === 'creating') throw new Error('Recipient creation did not return a confirmed ID. Inspect the dedicated demo profile in the app before recovering this manifest; do not create another take blindly.');
    if (!data.recipientId) return;
    assertManifest(data, config, account.currentUser.id);
    const recipient = account.recipients.find(r => r.id === data.recipientId);
    if (!recipient) {
      if (!data.calendarClean) throw new Error('Recipient missing before external cleanup was verified. Inspect Google before recovering this manifest.');
    } else {
      if (recipient.display_name !== data.recipientName) throw new Error('Demo renamed; cleanup stopped to protect edited data.');
      let current = await calendarState();
      assertOwnedAppointments(current, data);
      for (const action of current.actions.filter(a => ['pending', 'failed'].includes(a.status))) await calendar('reject', { actionId: action.id });
      for (const appointment of current.appointments.filter(a => a.status === 'confirmed')) {
        const proposal = await calendar('propose', { kind: 'cancel', appointmentId: appointment.id });
        current = await calendarState();
        const review = current.actions.find(a => a.id === proposal.actionId);
        if (!Array.isArray(review?.payload?.attendees) || review.payload.attendees.length) {
          await calendar('reject', { actionId: proposal.actionId });
          throw new Error('Live Google guest list changed. Review cancellation in the app.');
        }
        await calendar('approve', { actionId: proposal.actionId });
      }
      current = await calendarState();
      if (current.appointments.some(a => a.status === 'confirmed')) throw new Error('Google cleanup did not complete.');
      data.calendarClean = true; save();
      await state('delete_recipient', { confirmName: data.recipientName });
    }
    data = {}; save();
    for (const name of ['run-sheet.md', 'appointment.png', 'check.json']) {
      if (existsSync(`${config.dir}/${name}`)) unlinkSync(`${config.dir}/${name}`);
    }
  }

  async function check() {
    assertManifest(data, config, account.currentUser.id);
    const current = await calendarState();
    if (!current.configured || current.connection?.status !== 'connected' || current.binding?.calendar_id !== data.calendarId) throw new Error('Restore the demo Google connection/calendar binding.');
    const prefs = await get(`/api/notifications?recipientId=${data.recipientId}`);
    const missing = notificationReadiness(prefs, config.channels);
    const chat = await get(`/api/chat?recipientId=${data.recipientId}`);
    const recipientState = await get(`/api/state?recipientId=${data.recipientId}`);
    const receiver = recipientState.careCircle.find(member => member.id === data.caregiverId);
    const report = { receivingCaregiver: receiver ? { name: receiver.display_name, status: receiver.status, email: receiver.email } : null, checkedAt: new Date().toISOString(), baseURL: config.baseURL, recipientId: data.recipientId, calendarConnected: true, requestedChannels: config.channels, missingChannels: missing, modelEnabled: chat.agentMode === 'model', deliveries: prefs.deliveries, note: 'Configuration readiness is not proof of provider delivery or device receipt. SMS currently uses a fixed trial template; inspect its received content.' };
    writeFileSync(`${config.dir}/check.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    if (missing.length) throw new Error(`Enable recipient-scoped notification settings for: ${missing.join(', ')}. Open ${config.baseURL}/?view=Notifications&recipientId=${data.recipientId}, then run demo:check. Report: ${config.dir}/check.json`);
    if (receiver?.status !== 'active') throw new Error(`The receiving caregiver must accept the invitation before the handoff demo. Open the private run sheet for the sign-up link. Then run demo:check.`);
    if (!report.modelEnabled) throw new Error('Enable the model integration for image extraction.');
    console.log('Calendar and requested notification settings ready. No delivery was sent or claimed.');
  }

  if (command === 'clean') { await clean(); console.log('Demo cleanup complete.'); }
  if (command === 'check') await check();
  if (command === 'seed') {
    // Validate the source integration before deleting an existing take.
    const sourceId = process.env.DEMO_SOURCE_RECIPIENT_ID || data.sourceId || account.selectedRecipient.id;
    if (sourceId === data.recipientId) throw new Error('DEMO_SOURCE_RECIPIENT_ID must be a persistent setup recipient, not the disposable demo.');
    const connected = await get(`/api/calendar?recipientId=${sourceId}`);
    if (!connected.configured || connected.connection?.status !== 'connected' || !connected.binding?.calendar_id || !connected.capabilities?.linkedRescheduling) throw new Error('Connect Google and select a calendar for the persistent setup recipient first.');
    const prefs = await get(`/api/notifications?recipientId=${sourceId}`);
    const chat = await get(`/api/chat?recipientId=${sourceId}`);
    if (chat.agentMode !== 'model') throw new Error('Enable the model integration before seeding image intake.');
    const unavailable = config.channels.filter(c => !prefs.channels.includes(c));
    if (unavailable.length) throw new Error(`Configure and enable providers first: ${unavailable.join(', ')}`);
    const push = process.env.DEMO_PUSH_SUBSCRIPTION_FILE ? JSON.parse(readFileSync(process.env.DEMO_PUSH_SUBSCRIPTION_FILE, 'utf8')) : null;
    await clean();
    const nonce = randomUUID().slice(0, 8);
    data = { version: 1, baseURL: config.baseURL, ownerId: account.currentUser.id, recipientName: `Alex (story demo ${nonce})`, sourceId, day: config.day, calendarId: connected.binding.calendar_id, phase: 'creating', liveIntake: !process.argv.includes('--preload') };
    save();
    const titles = data.liveIntake ? ['Existing home-care visit'] : ['Physiotherapy at Lakeside Clinic', 'Drive Alex to physiotherapy', 'Confirm appointment with Lakeside Clinic', 'Arrange transportation', 'Existing home-care visit'];
    const categories = data.liveIntake ? ['appointment'] : ['appointment', 'transport', 'general', 'general', 'appointment'];
    const created = await post('/api/state', { action: 'create_recipient', displayName: data.recipientName, timezone: 'America/Toronto', templateKey: 'mobility-physio', consentAccepted: true, nonClinicalAcknowledged: true, responsibilities: titles.map((title, i) => ({ title, category: categories[i], due_offset_days: '2' })) });
    data.recipientId = created.selectedRecipient.id;
    data.phase = 'created';
    data.taskIds = created.tasks.map(t => t.id);
    save(); // Persist ownership before further mutations so partial runs can be cleaned.
    if (config.caregiverEmail.toLowerCase() === account.currentUser.email.toLowerCase()) throw new Error('The receiving caregiver must be a different account.');
    const circle = await state('invite_member', { email: config.caregiverEmail, displayName: config.caregiverName, role: 'caregiver' });
    const receiving = circle.careCircle.find(member => member.email.toLowerCase() === config.caregiverEmail.toLowerCase());
    if (!receiving) throw new Error('The receiving caregiver was not added.');
    data.caregiverId = receiving.id; data.caregiverName = receiving.display_name;
    data.caregiverInvitation = circle.invitationUrl ? `${config.baseURL}${circle.invitationUrl}` : null;
    save();
    const planning = (await get(`/api/planning?recipientId=${data.recipientId}`)).state;
    data.memberId = planning.memberId; save();
    const instant = (h, m = 0) => demoInstant(data.day, h, m);
    await state('update_profile', { preferredName: data.recipientName, careContext: 'Synthetic Alex scenario. Maya coordinates physiotherapy. Clinic confirmation remains required until explicitly completed.', communicationNotes: 'Alex prefers a concise written update when appointment times change.', mobilityNotes: 'Transportation required for clinic appointments.', homeBase: 'Toronto (synthetic demo)' });
    await state('add_support_contact', { name: 'Lakeside Clinic', relationship: 'Physiotherapy clinic', contactType: 'provider', organization: 'Lakeside Clinic', phone: '555-0108', notes: 'Synthetic contact. Do not send to this address. Clinic confirmation required.', priority: 'important' });
    await plan('save_availability', { start: instant(8), end: instant(18), categories: ['appointment', 'transport', 'general'], capabilities: [] });
    for (const task of created.tasks) {
      const i = titles.indexOf(task.title);
      if (i < 0) throw new Error('Unexpected template task; inspect demo before continuing.');
      const times = data.liveIntake ? [[15, 0, 60]] : [[15, 0, 60], [14, 30, 30], [10, 0, 15], [18, 0, 15], [15, 0, 60]];
      const [hour, minute, durationMinutes] = times[i];
      await state('update_task', { id: task.id, title: task.title, owner: account.currentUser.displayName, dueAt: !data.liveIntake && [2, 3].includes(i) ? demoInstant(new Date(Date.parse(`${data.day}T12:00:00Z`) - (i === 2 ? 2 : 1) * 86400000).toISOString().slice(0, 10), hour, minute) : instant(hour, minute), status: 'scheduled', category: categories[i] });
      await plan('save_task_details', { taskId: task.id, ownerMemberId: data.memberId, durationMinutes, dependsOn: !data.liveIntake && i === 1 ? created.tasks.find(t => t.title === titles[0]).id : '', backupMemberId: '', requirements: [], factIds: [] });
    }
    await calendar('select_calendar', { calendarId: data.calendarId });
    // Recreate only this account's opted-in settings; never change account identity.
    await scoped('/api/notifications', 'save_preferences', { emailEnabled: config.channels.includes('email') && prefs.emailEnabled, smsEnabled: config.channels.includes('sms') && prefs.smsEnabled, phone: prefs.phone || '' });
    if (config.channels.includes('ntfy') && prefs.ntfyTopic) await scoped('/api/notifications', 'enable_ntfy', { topic: prefs.ntfyTopic });
    if (config.channels.includes('push') && push) await scoped('/api/notifications', 'subscribe_push', { subscription: push });
    if (!data.liveIntake) {
      data.taskId = created.tasks.find(t => t.title === titles[0]).id; save();
      const conflict = await plan('simulate', { taskId: data.taskId, dueAt: instant(15) });
      if (!conflict.simulation.conflicts.length) throw new Error('Expected 3 PM conflict was not detected.');
      const alternative = await plan('simulate', { taskId: data.taskId, dueAt: instant(13) });
      if (alternative.simulation.conflicts.length || alternative.simulation.changes.length !== 2) throw new Error('1 PM appointment / 12:30 PM transport alternative is not valid.');
      // Real guest-free baseline supports Calendar's linked reschedule review.
      const proposal = await calendar('propose', { kind: 'create', taskId: data.taskId, title: titles[0], timeZone: 'America/Toronto', startLocal: `${data.day}T15:00`, endLocal: `${data.day}T16:00`, attendees: '', location: 'Lakeside Clinic', reminderMinutes: 30 });
      data.createActionId = proposal.actionId; save();
      await calendar('approve', { actionId: proposal.actionId });
      const appointment = (await calendarState()).appointments.find(a => a.task_id === data.taskId && a.status === 'confirmed');
      if (!appointment) throw new Error('Google did not confirm the baseline event.');
      const move = await calendar('propose', { kind: 'reschedule', appointmentId: appointment.id, timeZone: 'America/Toronto', startLocal: `${data.day}T13:00`, endLocal: `${data.day}T14:00`, attendees: config.guest });
      const review = (await calendarState()).actions.find(a => a.id === move.actionId);
      if (review?.payload?.carePlan?.conflicts.length !== 0 || review.payload.carePlan.changes.length !== 2) throw new Error('Calendar alternative validation failed.');
      data.moveActionId = move.actionId; save();
    }
    await plan('acknowledge', { snapshot: JSON.stringify((await get(`/api/planning?recipientId=${data.recipientId}`)).state.handover.snapshot) });
    copyFileSync(config.image, `${config.dir}/appointment.png`);
    writeFileSync(`${config.dir}/run-sheet.md`, `# Alex story demo\n\nOrigin: ${config.baseURL}\nDate: ${data.day}, America/Toronto\nActor: ${account.currentUser.displayName} (playing Maya; existing account preserved)\nReceiving caregiver: ${data.caregiverName} (${config.caregiverEmail})\n${data.caregiverInvitation ? `Accept invitation once: ${data.caregiverInvitation}` : `Receiving caregiver account is already registered.`}\n\n[Start document review](${config.baseURL}/?view=Care%20Organizer&tool=intake&recipientId=${data.recipientId})\n\nImage: ${config.dir}/appointment.png\n\nMode: ${data.liveIntake ? 'Live intake: only the conflicting 3 PM visit is seeded. Upload the image and approve actual extracted items. Click Review schedule conflicts on the resulting appointment. Save Maya as responsible caregiver and review its duration. The seeded 3 PM visit appears in the conflict calendar. Choose a validated alternative, approve the care-plan change, then Schedule this responsibility and add the configured guest. Use Prepare caregiver update, Review notification delivery, Continue to handover, then Ask about this handover.' : 'Preloaded rehearsal: appointment is already in Google at 3 PM. Review image extraction WITHOUT adding duplicate tasks. Calendar has a pending 1 PM alternative; ride moves to 12:30 PM.'}\n\nApprove the change, then prepare and approve the handoff update to ${data.caregiverName}. Use their Carestead inbox first; external channels require their own notification preferences. Test all five channels to ${account.currentUser.displayName} separately if Noah has not enabled them. Clinic confirmation stays open. Refresh Handover and ask by voice what changed. Claim notification delivery only after checking actual outcomes.\n\nCalendar guest: ${config.guest}. Include this guest when scheduling; preload already includes it in the pending change. After the take, manually approve cancellation in Calendar to notify the guest, then run cleanup. Caregiver channels target your own opted-in account.\n\nRun demo:check before recording. Run demo:seed for a fresh take, demo:clean after recording.\n`, { mode: 0o600 });
    console.log(`Seed created. Run sheet: ${config.dir}/run-sheet.md`);
    await check();
  }
} finally {
  if (api) await api.dispose();
  unlinkSync(lock);
}
