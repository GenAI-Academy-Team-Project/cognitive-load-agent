import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewConfig, runtimeSettings, redirectLocation } from './local-preview.mjs';

test('Docker selects HTTPS only with a complete certificate pair and respects published port', () => {
  assert.equal(previewConfig({}, () => true).origin, 'https://carestead.com:8080');
  assert.equal(previewConfig({}, () => false).origin, 'http://carestead.com:8080');
  assert.equal(previewConfig({}, path => path.endsWith('/carestead.pem')).https, false);
  assert.equal(previewConfig({ CARESTEAD_PUBLIC_HOST: 'localhost', CARESTEAD_PUBLIC_PORT: '8443' }, () => true).origin, 'https://localhost:8443');
  assert.throws(() => previewConfig({ CARESTEAD_PUBLIC_PORT: 'invalid' }), /PORT/);
});
test('runtime URL replacement preserves secrets and cannot redirect to a supplied external origin', () => {
  const source = 'RESEND_API_KEY=example\nAUTH_PUBLIC_URL=http://localhost:3001\nOTHER="keep this"\n';
  const settings = runtimeSettings(source, 'https://carestead.com:8080');
  assert.match(settings, /RESEND_API_KEY=example/);
  assert.match(settings, /OTHER="keep this"/);
  assert.match(settings, /AUTH_PUBLIC_URL="https:\/\/carestead.com:8080"/);
  assert.equal(settings.match(/AUTH_PUBLIC_URL=/g).length, 1);
  assert.equal(redirectLocation('/reset-password?from=email', 'https://carestead.com:8080'), 'https://carestead.com:8080/reset-password?from=email');
  assert.equal(redirectLocation('//evil.example/path', 'https://carestead.com:8080'), 'https://carestead.com:8080/path');
});
