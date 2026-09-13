import test from 'node:test';
import assert from 'node:assert/strict';
import { demoApi } from './calendar-demo-api.mjs';

function fixture(statuses, headers = {}) {
  const calls = [], waits = [], disposed = [];
  const request = async (...args) => {
    calls.push(args);
    const status = statuses.shift();
    return {
      status: () => status, headers: () => headers, ok: () => status === 200,
      json: async () => status === 200 ? { done: true } : { error: 'Request failed' },
      dispose: async () => disposed.push(status),
    };
  };
  const client = demoApi({ get: request, post: request }, {
    sleep: async ms => waits.push(ms), log: () => {}, now: () => Date.parse('2030-01-01T00:00:00Z'),
  });
  return { client, calls, waits, disposed };
}

test('cleanup waits out the deletion window and retries the same payload', async () => {
  const f = fixture([429, 200]);
  const body = { action: 'delete_recipient', recipientId: 'demo-only' };
  assert.deepEqual(await f.client.post('/api/state', body), { done: true });
  assert.deepEqual(f.waits, [3601000]);
  assert.deepEqual(f.calls, [['/api/state', { data: body }], ['/api/state', { data: body }]]);
  assert.deepEqual(f.disposed, [429, 200]);
});

test('reset uses the minute window and honors Retry-After seconds or dates', async () => {
  for (const [headers, expected] of [
    [{}, 61000], [{ 'retry-after': '5' }, 6000],
    [{ 'retry-after': 'Tue, 01 Jan 2030 00:00:10 GMT' }, 11000],
    [{ 'retry-after': 'invalid' }, 61000],
  ]) {
    const f = fixture([429, 200], headers);
    await f.client.post('/api/calendar', { action: 'approve', actionId: 'existing-action' });
    assert.deepEqual(f.waits, [expected]);
  }
});

test('persistent throttling stops after two retries', async () => {
  const f = fixture([429, 429, 429]);
  await assert.rejects(f.client.get('/api/state'), /429/);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.waits, [61000, 61000]);
});

test('other HTTP errors and ambiguous network failures are never replayed', async () => {
  for (const status of [400, 401, 403, 500, 503]) {
    const f = fixture([status]);
    await assert.rejects(f.client.post('/api/calendar', { action: 'approve' }), new RegExp(String(status)));
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.waits, []);
  }
  let calls = 0;
  const client = demoApi({ post: async () => { calls++; throw new Error('connection lost'); } });
  await assert.rejects(client.post('/api/calendar', { action: 'approve' }), /connection lost/);
  assert.equal(calls, 1);
});
