import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cloudSecrets, loadCloudSecrets, uploadCloudSecrets, runtimeSecretNames } from './cloud-secrets.mjs';

const email = { RESEND_API_KEY: 'synthetic-provider-secret', NOTIFICATION_EMAIL_FROM: 'Carestead <care@example.com>' };
test('selects complete groups, omits blank groups and rejects incomplete or malformed values', () => {
  assert.deepEqual(cloudSecrets({ ...email, GOOGLE_CLIENT_ID: '', CLOUDFLARE_API_TOKEN: 'never-upload', MEM0_API_KEY: 'memory-key' }), { ...email, MEM0_API_KEY: 'memory-key' });
  assert.deepEqual(cloudSecrets({ PUSHOVER_API_TOKEN: 'a'.repeat(30) }), { PUSHOVER_API_TOKEN: 'a'.repeat(30) });
  assert.throws(() => cloudSecrets({ PUSHOVER_API_TOKEN: 'bad' }), /30-character/);
  assert.throws(() => cloudSecrets({}), /No cloud runtime/);
  assert.throws(() => cloudSecrets({ RESEND_API_KEY: email.RESEND_API_KEY }), /NOTIFICATION_EMAIL_FROM/);
  assert.throws(() => cloudSecrets({ ...email, MEM0_API_KEY: ' secret ' }), /whitespace/);
  assert.throws(() => cloudSecrets({ GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/calendar/callback' }), /GOOGLE_CLIENT_ID/);
  assert.throws(() => cloudSecrets({ TWILIO_ACCOUNT_SID: 'invalid', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM_NUMBER: '+14165550123' }), /TWILIO_ACCOUNT_SID/);
  assert.throws(() => cloudSecrets({ VAPID_PUBLIC_KEY: 'bad', VAPID_PRIVATE_KEY: 'bad', VAPID_SUBJECT: 'mailto:care@example.com' }), /VAPID_PUBLIC_KEY/);
});

test('reads only the chosen cloud file, honors environment overrides, rejects unknown file keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carestead-secrets-'));
  try {
    const file = join(dir, '.secrets.cloudflare');
    writeFileSync(join(dir, '.dev.vars'), 'MEM0_API_KEY=local-only');
    assert.throws(() => loadCloudSecrets(file, {}), /No cloud runtime/);
    writeFileSync(file, 'MEM0_API_KEY=cloud-only');
    assert.deepEqual(loadCloudSecrets(file, {}), { MEM0_API_KEY: 'cloud-only' });
    assert.deepEqual(loadCloudSecrets(file, { MEM0_API_KEY: 'ci-only', CLOUDFLARE_API_TOKEN: 'never-upload' }), { MEM0_API_KEY: 'ci-only' });
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
