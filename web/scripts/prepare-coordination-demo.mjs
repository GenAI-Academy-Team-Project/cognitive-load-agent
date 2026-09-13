import { request } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const baseURL = 'https://carestead.com:8083';
const dir = fileURLToPath(new URL('../.playwright-runs/live-demo/', import.meta.url));
const file = `${dir}/coordination.local.json`;
const original = JSON.parse(readFileSync(`${dir}/scenario.local.json`, 'utf8'));
const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { day: '2026-09-14', recipientName: 'Alex (coordination demo)' };
const save = () => writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
const owner = await request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${dir}/owner-auth.json`, extraHTTPHeaders: { Origin: baseURL } });
const helper = await request.newContext({ baseURL, ignoreHTTPSErrors: true, storageState: `${dir}/helper-auth.json`, extraHTTPHeaders: { Origin: baseURL } });
async function json(r) { const value = await r.json(); if (!r.ok()) throw new Error(`${r.status()}: ${value.error}`); return value; }
const get = (path, actor = owner) => actor.get(path).then(json);
const post = (path, body, actor = owner) => actor.post(path, { data: body }).then(json);
const planning = (action, payload = {}, actor = owner) => post('/api/planning', { recipientId: data.recipientId, action, ...payload }, actor);
try {
  if (!data.recipientId) {
    const s = await post('/api/state', { action: 'create_recipient', displayName: data.recipientName, timezone: 'America/Toronto', templateKey: 'mobility-physio', consentAccepted: true, nonClinicalAcknowledged: true, responsibilities: [{ title: 'Alex physiotherapy appointment', category: 'appointment', due_offset_days: '2' }, { title: 'Drive Alex to physiotherapy', category: 'transport', due_offset_days: '2' }] });
    data.recipientId = s.selectedRecipient.id;
    data.appointmentId = s.tasks.find(t => t.category === 'appointment').id;
    data.rideId = s.tasks.find(t => t.category === 'transport').id;
    save();
  }
  if (!data.initialized) {
    await post('/api/state', { action: 'invite_member', recipientId: data.recipientId, displayName: 'Noah', email: original.helperEmail, role: 'caregiver' });
    const p = (await get(`/api/planning?recipientId=${data.recipientId}`)).state;
    data.ownerId = p.memberId;
    data.helperId = original.helperId;
    await post('/api/state', { action: 'update_profile', recipientId: data.recipientId, preferredName: data.recipientName, careContext: 'Synthetic demonstration: coordinate Alex’s physiotherapy appointment, transport, and handover.', communicationNotes: 'One short written update when plans change.', homeBase: 'Toronto — synthetic demonstration household' });
    await post('/api/state', { action: 'add_support_contact', recipientId: data.recipientId, name: 'Noah', relationship: 'Next caregiver / transport', contactType: 'person', priority: 'primary', notes: 'Synthetic caregiver; receives the in-app update and reviews the revised plan.' });
    const s = await post('/api/state', { action: 'add_memory', recipientId: data.recipientId, kind: 'preference', value: 'Alex prefers one short written update when appointment times change.', source: 'Synthetic demo preference reviewed with Alex', confidence: 'high' });
    await post('/api/state', { action: 'verify_memory', recipientId: data.recipientId, id: s.memories[0].id });
    for (const actor of [owner, helper]) await planning('save_availability', { start: `${data.day}T12:00:00Z`, end: `${data.day}T22:00:00Z`, categories: ['appointment', 'transport'], capabilities: [] }, actor);
    data.initialized = true; save();
  }
  if (!data.ready || process.argv.includes('--reset-times')) {
    for (const [id, title, hour, category] of [[data.appointmentId, 'Alex physiotherapy appointment', '14:00', 'appointment'], [data.rideId, 'Drive Alex to physiotherapy', '13:30', 'transport']]) {
      await post('/api/state', { action: 'update_task', recipientId: data.recipientId, id, title, dueAt: `${data.day}T${hour}:00Z`, owner: 'Unassigned', status: 'scheduled', category });
    }
    await planning('save_task_details', { taskId: data.appointmentId, ownerMemberId: data.ownerId, durationMinutes: 60, dependsOn: '', backupMemberId: '', requirements: [], factIds: [] });
    await planning('save_task_details', { taskId: data.rideId, ownerMemberId: data.helperId, durationMinutes: 30, dependsOn: data.appointmentId, backupMemberId: '', requirements: [], factIds: [] });
    await planning('accept_task', { taskId: data.appointmentId });
    await planning('accept_task', { taskId: data.rideId }, helper);
    for (const actor of [owner, helper]) {
      const p = (await get(`/api/planning?recipientId=${data.recipientId}`, actor)).state;
      await planning('acknowledge', { snapshot: JSON.stringify(p.handover.snapshot) }, actor);
    }
    const preview = await planning('simulate', { taskId: data.appointmentId, dueAt: `${data.day}T18:00:00Z` });
    assert.equal(preview.simulation.changes.length, 2);
    assert.deepEqual(preview.simulation.conflicts, []);
    assert.equal(preview.simulation.changes.find(c => c.taskId === data.rideId).after, `${data.day}T17:30:00.000Z`);
    data.ready = true; save();
  }
  writeFileSync(`${dir}/noah-login.local.txt`, `Synthetic demo account only\nEmail: ${original.helperEmail}\nPassword: ${original.helperPassword}\nRecipient: ${data.recipientName}\nOpen: ${baseURL}/?view=Notifications&recipientId=${data.recipientId}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...data, url: `${baseURL}/?view=Responsibilities&recipientId=${data.recipientId}`, verified: 'Two linked tasks; 10 AM appointment / 9:30 AM ride → 2 PM appointment / 1:30 PM ride; zero preview conflicts. Owner and Noah handover baselines saved.' }));
} finally { await owner.dispose(); await helper.dispose(); }
