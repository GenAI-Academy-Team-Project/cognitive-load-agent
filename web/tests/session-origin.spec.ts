import { test, expect } from '@playwright/test';
import { requireMembership } from '../lib/auth';
import { checkOrigin } from '../lib/sessions';

const publicUrl = 'https://carestead.com:3001';
function request(origin?: string, site = 'same-origin', extra: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:8080/api/auth/forgot-password', {
    method: 'POST',
    headers: { ...(origin === undefined ? {} : { origin }), 'sec-fetch-site': site, ...extra },
  });
}

test('allows the configured public origin behind the local proxy', () => {
  expect(() => checkOrigin(request(publicUrl))).toThrow();
  expect(() => checkOrigin(request(publicUrl), publicUrl)).not.toThrow();
  expect(() => checkOrigin(request('http://127.0.0.1:8080'))).not.toThrow();
});

test('rejects missing, opaque, cross-site, and nonmatching origins', () => {
  for (const origin of [undefined, 'null', 'https://evil.example', 'https://carestead.com:3002', 'http://carestead.com:3001', 'https://carestead.com.evil.example:3001']) {
    expect(() => checkOrigin(request(origin), publicUrl)).toThrow();
  }
  expect(() => checkOrigin(request(publicUrl, 'cross-site'), publicUrl)).toThrow();
  expect(() => checkOrigin(request('https://evil.example', 'same-origin', {
    'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https',
  }), publicUrl)).toThrow();
});

test('invalid public URL configuration does not bypass origin validation', () => {
  for (const configured of ['invalid', 'null', 'file:///tmp/carestead', 'https://user:password@carestead.com:3001']) {
    expect(() => checkOrigin(request(publicUrl), configured)).toThrow();
    expect(() => checkOrigin(request(), configured)).toThrow();
  }
});

test('membership accepts the public proxy origin and still requires a session', async () => {
  // A request without a session must reach authentication, not fail origin validation.
  const db = {} as D1Database;
  const result = await requireMembership(db, request(publicUrl), publicUrl);
  expect('error' in result && result.error?.status).toBe(401);
  await expect(requireMembership(db, request(publicUrl), undefined)).rejects.toMatchObject({ code: 'invalid_origin', status: 403 });
  await expect(requireMembership(db, request('https://evil.example'), publicUrl)).rejects.toMatchObject({ code: 'invalid_origin', status: 403 });
});
