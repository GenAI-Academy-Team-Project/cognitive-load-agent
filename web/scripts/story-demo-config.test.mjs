import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyConfig, assertManifest, assertOwnedAppointments, notificationReadiness } from './story-demo-config.mjs';

test('deployment sessions are isolated and insecure/credential URLs rejected', () => {
  const a = storyConfig({ DEMO_BASE_URL: 'https://one.example/' });
  const b = storyConfig({ DEMO_BASE_URL: 'https://two.example' });
  assert.notEqual(a.dir, b.dir);
  assert.equal(a.baseURL, 'https://one.example');
  for (const url of ['http://one.example', 'https://me:secret@one.example', 'https://one.example/path', 'https://one.example/?x=1']) assert.throws(() => storyConfig({ DEMO_BASE_URL: url }));
  assert.throws(() => storyConfig({ DEMO_CHANNELS: 'email,email' }));
  assert.throws(() => storyConfig({ DEMO_CHANNELS: 'fake' }));
});
const config = storyConfig({});
const data = { version: 1, baseURL: config.baseURL, ownerId: 'owner', recipientId: 'recipient', recipientName: 'Alex (story demo abc)', taskIds: ['task'] };
test('cleanup requires matching origin, account, and dedicated recipient identity', () => {
  assertManifest(data, config, 'owner');
  for (const patch of [{ version: 2 }, { baseURL: 'https://other.example' }, { ownerId: 'someone' }, { recipientId: '' }, { recipientName: 'Alex' }]) assert.throws(() => assertManifest({ ...data, ...patch }, config, 'owner'));
});
test('cleanup stops on uncertain actions, unowned appointments, and any guests', () => {
  const appointment = { task_id: 'task', canManage: true, status: 'confirmed', attendees_json: '[]' };
  assertOwnedAppointments({ actions: [], appointments: [appointment] }, data);
  for (const status of ['executing', 'uncertain']) assert.throws(() => assertOwnedAppointments({ actions: [{ status }], appointments: [] }, data));
  for (const patch of [{ task_id: 'other' }, { canManage: false }, { attendees_json: '["guest@example.com"]' }, { attendees_json: '{}' }, { attendees_json: 'broken' }]) assert.throws(() => assertOwnedAppointments({ actions: [], appointments: [{ ...appointment, ...patch }] }, data));
  assertOwnedAppointments({ actions: [], appointments: [{ ...appointment, status: 'cancelled', task_id: 'other' }] }, data);
});
test('provider configuration alone does not mean a recipient can receive', () => {
  const requested = ['in_app', 'email', 'sms', 'push', 'ntfy'];
  const prefs = { channels: requested, email: 'me@example.com', phone: '+14165550123' };
  assert.deepEqual(notificationReadiness(prefs, requested), ['email', 'sms', 'push', 'ntfy']);
  assert.deepEqual(notificationReadiness({ ...prefs, emailEnabled: true, smsEnabled: true, pushEnabled: true, ntfyEnabled: true }, requested), []);
});
