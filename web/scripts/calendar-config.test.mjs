import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarSecrets } from './calendar-config.mjs';

const valid = { GOOGLE_CLIENT_ID: '123-example.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'synthetic-client-secret', GOOGLE_REDIRECT_URI: 'https://carestead.example/api/calendar/callback', GOOGLE_TOKEN_KEY: 'abcd'.repeat(16) };

test('requires every value and validates exact production callback without exposing secrets', () => {
  assert.deepEqual(calendarSecrets(valid), valid);
  for (const name of Object.keys(valid)) assert.throws(() => calendarSecrets({ ...valid, [name]: '' }), new RegExp(name));
  for (const uri of ['http://carestead.example/api/calendar/callback', 'https://localhost/api/calendar/callback', 'https://carestead.example/other', 'https://carestead.example/api/calendar/callback?code=private', 'https://user:private@carestead.example/api/calendar/callback']) {
    assert.throws(() => calendarSecrets({ ...valid, GOOGLE_REDIRECT_URI: uri }), (error) => error.message.includes('GOOGLE_REDIRECT_URI') && !error.message.includes('private'));
  }
  assert.throws(() => calendarSecrets({ ...valid, GOOGLE_TOKEN_KEY: 'private-invalid-key' }), (error) => !error.message.includes('private-invalid-key'));
  assert.throws(() => calendarSecrets({ ...valid, GOOGLE_CLIENT_SECRET: ' private-secret ' }), /whitespace/);
});

