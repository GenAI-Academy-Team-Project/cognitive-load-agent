import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudSecrets, loadCloudSecrets, uploadCloudSecrets, runtimeSecretNames } from './cloud-secrets.mjs';

const email = { RESEND_API_KEY: 'synthetic-provider-secret', NOTIFICATION_EMAIL_FROM: 'Carestead <care@example.com>' };
test('selects complete groups, omits blank groups and rejects incomplete or malformed values', () => {
  assert.deepEqual(cloudSecrets({ ...email, GOOGLE_CLIENT_ID: '', CLOUDFLARE_API_TOKEN: 'never-upload' }), { ...email });
  assert.throws(() => cloudSecrets({}), /No cloud runtime/);
  assert.throws(() => cloudSecrets({ RESEND_API_KEY: email.RESEND_API_KEY }), /NOTIFICATION_EMAIL_FROM/);
  assert.throws(() => cloudSecrets({ ...email, RESEND_API_KEY: ' secret ' }), /whitespace/);
  assert.throws(() => cloudSecrets({ GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/calendar/callback' }), /GOOGLE_CLIENT_ID/);
  assert.throws(() => cloudSecrets({ TWILIO_ACCOUNT_SID: 'invalid', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM_NUMBER: '+14165550123' }), /TWILIO_ACCOUNT_SID/);
  assert.throws(() => cloudSecrets({ VAPID_PUBLIC_KEY: 'bad', VAPID_PRIVATE_KEY: 'bad', VAPID_SUBJECT: 'mailto:care@example.com' }), /VAPID_PUBLIC_KEY/);
});

test('reads only the chosen cloud file, honors environment overrides, rejects unknown file keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carestead-secrets-'));
  try {
    const file = join(dir, '.secrets.cloudflare');
    writeFileSync(join(dir, '.dev.vars'), 'NTFY_SERVER_URL=https://local.example.test');
    assert.throws(() => loadCloudSecrets(file, {}), /No cloud runtime/);
    writeFileSync(file, 'NTFY_SERVER_URL=https://cloud.example.test');
    assert.deepEqual(loadCloudSecrets(file, {}), { NTFY_SERVER_URL: 'https://cloud.example.test' });
    assert.deepEqual(loadCloudSecrets(file, { NTFY_SERVER_URL: 'https://ci.example.test', CLOUDFLARE_API_TOKEN: 'never-upload' }), { NTFY_SERVER_URL: 'https://ci.example.test' });
    writeFileSync(file, 'CLOUDFLARE_API_TOKEN=never-upload');
    assert.throws(() => loadCloudSecrets(file, {}), /unknown setting/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('uploads allowlisted values through stdin only and blocks placeholder targets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carestead-upload-'));
  try {
    const config = pathToFileURL(join(dir, 'worker.json'));
    for (const id of ['00000000-0000-4000-8000-000000000000', '11111111-1111-4111-8111-111111111111', 'invalid']) {
      writeFileSync(config, JSON.stringify({ name: 'test', d1_databases: [{ binding: 'DB', database_id: id }] }));
      assert.throws(() => uploadCloudSecrets(email, config, () => assert.fail('Must not upload')), /production Worker/);
    }
    writeFileSync(config, JSON.stringify({ name: 'test', d1_databases: [{ binding: 'DB', database_id: '12345678-1234-4234-8234-123456789abc' }] }));
    let calls = 0;
    uploadCloudSecrets({ ...email, CLOUDFLARE_API_TOKEN: 'never-upload' }, config, (_exe, args, options) => {
      calls++;
      assert.deepEqual(args.slice(1, 3), ['secret', 'bulk']);
      assert.ok(args.includes(config.pathname));
      assert.equal(args.join(' ').includes(email.RESEND_API_KEY), false);
      assert.deepEqual(JSON.parse(options.input), email);
      for (const name of runtimeSecretNames) assert.equal(options.env[name], undefined);
      return { status: 0 };
    });
    assert.equal(calls, 1);
    assert.throws(() => uploadCloudSecrets(email, config, () => ({ status: 1, stderr: email.RESEND_API_KEY })), (error) => error.message.includes('upload failed') && !error.message.includes(email.RESEND_API_KEY));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

 test('ntfy supports an optional token and rejects malformed server configuration', () => {
  assert.deepEqual(cloudSecrets({ NTFY_SERVER_URL: 'https://ntfy.sh' }), { NTFY_SERVER_URL: 'https://ntfy.sh' });
  assert.deepEqual(cloudSecrets({ NTFY_SERVER_URL: 'https://ntfy.sh', NTFY_ACCESS_TOKEN: 'synthetic' }), { NTFY_SERVER_URL: 'https://ntfy.sh', NTFY_ACCESS_TOKEN: 'synthetic' });
  for (const value of ['http://ntfy.sh', 'https://ntfy.sh/topic', 'https://user:pass@ntfy.sh', 'https://ntfy.sh?topic=x']) assert.throws(() => cloudSecrets({ NTFY_SERVER_URL: value }), /HTTPS server origin/);
  assert.throws(() => cloudSecrets({ NTFY_ACCESS_TOKEN: 'synthetic' }), /NTFY_SERVER_URL/);
});

test('public origin is uploaded and invalid cloud origins are rejected', () => {
  assert.deepEqual(cloudSecrets({ AUTH_PUBLIC_URL: 'https://carestead.example' }), { AUTH_PUBLIC_URL: 'https://carestead.example' });
  for (const value of ['http://carestead.example', 'https://user:password@carestead.example', 'https://carestead.example/path', 'not-a-url']) {
    assert.throws(() => cloudSecrets({ AUTH_PUBLIC_URL: value }), /AUTH_PUBLIC_URL/);
  }
});
