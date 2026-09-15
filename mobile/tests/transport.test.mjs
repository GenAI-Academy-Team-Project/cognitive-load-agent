import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileFetch } from '../src/transport.mjs';
import { apiOrigin } from '../src/config.mjs';

function client(overrides = {}) {
  return createMobileFetch({ native: true, localOrigin: 'capacitor://localhost',
    request: async () => ({ status: 200, data: '{"ok":true}' }),
    openCalendar: async () => {}, browserFetch: async () => new Response('asset'),
    onUnauthorized: () => {}, ...overrides });
}
test('native POST keeps JSON payload but never passes cookies or arbitrary headers through the bridge', async () => {
  let captured;
  const fetch = client({ request: async (options) => { captured = options; return { status: 200, data: '{"ok":true}' }; } });
  const response = await fetch('/api/state', { method: 'POST', headers: { Cookie: 'secret', Origin: 'https://other.test' }, body: JSON.stringify({ action: 'complete_task', recipientId: 'r1', id: 't1' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(captured, { path: '/api/state', method: 'POST', body: '{"action":"complete_task","recipientId":"r1","id":"t1"}' });
});
test('an arbitrary remote request never receives the privileged native adapter', async () => {
  const fetch = client({ request: async () => assert.fail('native request used'), browserFetch: async () => new Response('external') });
  assert.equal(await (await fetch('https://other.test/api/state')).text(), 'external');
  await assert.rejects(fetch('/api/admin'), /not available/);
});
test('Google connect opens hosted Calendar without sending OAuth through the embedded view', async () => {
  let recipient;
  const fetch = client({ request: async () => assert.fail('native connect used'), openCalendar: async (id) => { recipient = id; } });
  const response = await fetch('/api/calendar', { method: 'POST', body: '{"action":"connect","recipientId":"r2"}' });
  assert.equal(recipient, 'r2'); assert.equal(response.status, 409);
  assert.match((await response.json()).error, /same Carestead account/);
});
test('expired API sessions signal sign-in; invalid credentials remain on the account form', async () => {
  let count = 0;
  const fetch = client({ request: async () => ({ status: 401, data: '{"error":"Sign in"}' }), onUnauthorized: () => count++ });
  await fetch('/api/state'); await fetch('/api/auth/sign-in', { method: 'POST', body: '{}' });
  assert.equal(count, 1);
});
test('pre-aborted requests never start and completed cancelled reads cannot overwrite UI state', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client({ request: async () => assert.fail('request started') })('/api/state', { signal: controller.signal }), { name: 'AbortError' });
  const delayed = new AbortController();
  const fetch = client({ request: async () => { delayed.abort(); return { status: 200, data: '{}' }; } });
  await assert.rejects(fetch('/api/state', { signal: delayed.signal }), { name: 'AbortError' });
});
test('browser development uses the same-origin proxy and retains fetch semantics', async () => {
  const signal = new AbortController().signal;
  const fetch = client({ native: false, localOrigin: 'http://127.0.0.1:5174', browserFetch: async (input, init) => {
    assert.equal(input, '/api/state'); assert.equal(init.signal, signal); return Response.json({ ok: true });
  } });
  assert.deepEqual(await (await fetch('/api/state', { signal })).json(), { ok: true });
});
test('release origin rejects missing, placeholder, insecure, credentialed, and path-bearing addresses', () => {
  for (const value of [undefined, 'http://care.test', 'https://carestead.example.com', 'https://localhost', 'https://a:b@care.test', 'https://care.test/api', 'https://care.test?token=x']) {
    assert.throws(() => apiOrigin(value));
  }
  assert.equal(apiOrigin('https://care.test/'), 'https://care.test');
  assert.equal(apiOrigin('http://127.0.0.1:3000', { allowLocal: true }), 'http://127.0.0.1:3000');
});
