import test from 'node:test';
import assert from 'node:assert/strict';
import { demoDay, demoInstant } from './calendar-demo-time.mjs';

test('fresh recording date uses Toronto and rejects impossible or expired dates', () => {
  const now = new Date('2026-09-13T02:00:00Z');
  assert.equal(demoDay(undefined, now), '2026-09-14');
  assert.equal(demoDay(undefined, new Date('2026-03-08T04:30:00Z')), '2026-03-09');
  assert.throws(() => demoDay('2026-02-30', now), /valid/);
  assert.throws(() => demoDay('2026-09-12', now), /future/);
  assert.equal(demoDay('2026-09-13', now), '2026-09-13');
});
test('appointment and ride offsets remain correct across summer and winter dates', () => {
  assert.equal(demoInstant('2030-01-15', 10), '2030-01-15T15:00:00.000Z');
  assert.equal(demoInstant('2030-07-15', 10), '2030-07-15T14:00:00.000Z');
  for (const day of ['2030-01-15', '2030-07-15', '2026-11-01', '2026-03-08']) {
    assert.equal(Date.parse(demoInstant(day, 10)) - Date.parse(demoInstant(day, 9, 30)), 30 * 60000);
    assert.equal(Date.parse(demoInstant(day, 14)) - Date.parse(demoInstant(day, 13, 30)), 30 * 60000);
  }
});
