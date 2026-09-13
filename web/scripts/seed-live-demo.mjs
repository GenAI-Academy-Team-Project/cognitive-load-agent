import { request } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const baseURL = 'https://carestead.com:8083';
const folder = fileURLToPath(new URL('../.playwright-runs/live-demo/', import.meta.url));
mkdirSync(folder, { recursive: true });
const file = `${folder}/scenario.local.json`;
const meta = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const save = () => writeFileSync(file, JSON.stringify(meta, null, 2), { mode: 0o600 });
const owner = await request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${folder}/owner-auth.json`, extraHTTPHeaders: { Origin: baseURL } });
async function json(response) { const data = await response.json(); if (!response.ok()) throw new Error(`${response.status()}: ${data.error || JSON.stringify(data)}`); return data; }
const get = (path, actor = owner) => actor.get(path).then(json);
const post = (path, body, actor = owner) => actor.post(path, { data: body }).then(json);
try {
  if (meta.ready) { console.log(`Demo already prepared: ${baseURL}/?recipientId=${meta.recipientId}`); process.exitCode = 0; }
  else {
    const current = await get('/api/state');
    const calendar = await get(`/api/calendar?recipientId=${current.selectedRecipient.id}`);
    if (current.currentUser.role !== 'owner' || calendar.connection?.status !== 'connected' || !calendar.binding) throw new Error('Sign in as the owner with a connected and selected Google Calendar.');
    if (!meta.day) {
      const date = new Date(Date.now() + 2 * 86400000);
      meta.day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      meta.title = 'Alex - physiotherapy (DEMO)';
      meta.timeZone = 'America/Toronto';
      meta.calendarId = calendar.binding.calendar_id;
      meta.calendarName = calendar.binding.calendar_name;
      meta.helperEmail = `carestead-demo-noah-${Date.now()}@example.test`;
      meta.helperPassword = `Demo!${randomBytes(12).toString('hex')}Aa9`;
      meta.ownerName = current.currentUser.displayName;
      save();
    }
    if (!meta.recipientId) {
      const state = await post('/api/state', { action: 'create_recipient', displayName: 'Alex', timezone: meta.timeZone, templateKey: 'mobility-physio', consentAccepted: true, nonClinicalAcknowledged: true, responsibilities: [{ title: meta.title, category: 'appointment', due_offset_days: '2' }, { title: 'Review transport after the appointment changes', category: 'transport', due_offset_days: '2' }] });
      meta.recipientId = state.selectedRecipient.id;
      meta.taskId = state.tasks.find(task => task.title === meta.title).id;
      meta.transportTaskId = state.tasks.find(task => task.category === 'transport').id;
      save();
    }
    const recipientId = meta.recipientId;
    if (!meta.profileReady) {
      await post('/api/state', { action: 'update_profile', recipientId, preferredName: 'Alex', careContext: 'Synthetic pitch-demo recipient. Physiotherapy scheduling and caregiver handover.', communicationNotes: 'Keep appointment updates brief and written.', mobilityNotes: 'Review transport coverage whenever the appointment time changes.', homeBase: 'Demo household, Toronto' });
      const s = await post('/api/state', { action: 'add_memory', recipientId, kind: 'preference', value: 'Alex prefers one short written update when an appointment changes.', source: 'Synthetic demo preference confirmed with Alex', confidence: 'high' });
      const fact = s.memories.find(m => m.value.includes('one short written update'));
      await post('/api/state', { action: 'verify_memory', recipientId, id: fact.id });
      await post('/api/state', { action: 'add_support_contact', recipientId, name: 'Noah', relationship: 'Next caregiver', contactType: 'person', priority: 'primary', notes: 'Synthetic demo caregiver. Review the revised appointment and transport coverage at handover.' });
      meta.profileReady = true; save();
    }
    if (!meta.helperReady) {
      if (!meta.invitation) {
        const invitation = await post('/api/state', { action: 'invite_member', recipientId, displayName: 'Noah', email: meta.helperEmail, role: 'caregiver' });
        meta.invitation = new URLSearchParams(invitation.invitationUrl.split('#')[1]).get('invitation'); save();
      }
      const helper = await request.newContext({ baseURL, ignoreHTTPSErrors: true, extraHTTPHeaders: { Origin: baseURL } });
      try {
        const response = await helper.post('/api/auth/sign-up', { data: { displayName: 'Noah', email: meta.helperEmail, password: meta.helperPassword, confirmPassword: meta.helperPassword, invitation: meta.invitation } });
        if (!response.ok()) await post('/api/auth/sign-in', { email: meta.helperEmail, password: meta.helperPassword }, helper);
        await helper.storageState({ path: `${folder}/helper-auth.json` }); chmodSync(`${folder}/helper-auth.json`, 0o600);
      } finally { await helper.dispose(); }
      const state = await get(`/api/state?recipientId=${recipientId}`);
      meta.helperId = state.careCircle.find(member => member.email === meta.helperEmail).id;
      meta.helperReady = true; delete meta.invitation; save();
    }
    if (!meta.calendarProposalId) {
      await post('/api/calendar', { action: 'select_calendar', recipientId, calendarId: meta.calendarId });
      await post('/api/calendar', { action: 'propose', recipientId, kind: 'create', taskId: meta.taskId, title: meta.title, timeZone: meta.timeZone, startLocal: `${meta.day}T10:00`, endLocal: `${meta.day}T11:00`, location: 'Demo physiotherapy clinic', attendees: '', reminderMinutes: 30 });
      const state = await get(`/api/calendar?recipientId=${recipientId}`);
      meta.calendarProposalId = state.actions.find(action => action.kind === 'create' && action.payload.taskId === meta.taskId).id;
      save();
    }
    meta.ready = true; save();
    console.log(JSON.stringify({ recipientId, day: meta.day, title: meta.title, state: 'Real care records and Google appointment proposal prepared. No Google event or notification sent yet.', url: `${baseURL}/?view=Calendar&recipientId=${recipientId}` }));
  }
} finally { await owner.dispose(); }
