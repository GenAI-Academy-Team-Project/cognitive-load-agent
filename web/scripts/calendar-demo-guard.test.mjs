import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDemoAppointmentsSafe } from './calendar-demo-guard.mjs';

const data = { taskId: 'demo-task', appointmentId: 'demo-event' };
const appointment = { id: 'demo-event', task_id: 'demo-task', status: 'confirmed', canManage: true, attendees_json: '[]' };

test('allows the owned guest-free demo and already cancelled events', () => {
  assert.doesNotThrow(() => assertDemoAppointmentsSafe([appointment], data));
  assert.doesNotThrow(() => assertDemoAppointmentsSafe([{ ...appointment, status: 'cancelled', attendees_json: '["guest@example.test"]' }], data));
});

test('blocks guest notifications with actionable cleanup instructions', () => {
  assert.throws(() => assertDemoAppointmentsSafe([{ ...appointment, attendees_json: '["guest@example.test"]' }], data), /Cancel appointment.*--clean.*Do not use --reset/);
});

test('protects additional events, transferred events, and invalid guest records', () => {
  for (const [changes, message] of [
    [{ task_id: 'other-task' }, /additional appointment/],
    [{ id: 'other-event' }, /additional appointment/],
    [{ canManage: false }, /cannot manage/],
    [{ attendees_json: 'broken' }, /unreadable/],
    [{ attendees_json: 'null' }, /unreadable/],
    [{ attendees_json: '{}' }, /unreadable/],
  ]) assert.throws(() => assertDemoAppointmentsSafe([{ ...appointment, ...changes }], data), message);
});
