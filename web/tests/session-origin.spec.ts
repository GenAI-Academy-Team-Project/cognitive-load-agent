import { expect, test } from '@playwright/test';
import { checkOrigin } from '../lib/sessions';
import { requireMembership } from '../lib/auth';
const publicUrl = 'https://carestead.com:8083';
const request = (origin?: string, site = 'same-origin') => new Request('http://127.0.0.1:8080/api/integrations', { method: 'POST', headers: { ...(origin === undefined ? {} : { origin }), 'sec-fetch-site': site } });

test('public HTTPS origin reaches authentication; invalid origins cannot', async () => {
  expect(() => checkOrigin(request('http://127.0.0.1:8080'))).not.toThrow();
  const result = await requireMembership({} as D1Database, request(publicUrl), publicUrl);
  expect(result.error?.status).toBe(401);
  for (const origin of [undefined, 'null', 'https://untrusted.example', 'https://carestead.com:8084', 'http://carestead.com:8083']) {
    await expect(requireMembership({} as D1Database, request(origin), publicUrl)).rejects.toMatchObject({ code: 'invalid_origin', status: 403 });
  }
  expect(() => checkOrigin(request(publicUrl, 'cross-site'), publicUrl)).toThrow();
});
test('invalid configuration and spoofed forwarding headers cannot grant access', () => {
  for (const configured of ['invalid', 'file:///tmp/example', 'https://user:password@carestead.com:8083']) {
    expect(() => checkOrigin(request(publicUrl), configured)).toThrow();
    expect(() => checkOrigin(request(), configured)).toThrow();
  }
  const spoofed = request('https://untrusted.example');
  spoofed.headers.set('x-forwarded-host', 'untrusted.example');
  spoofed.headers.set('x-forwarded-proto', 'https');
  expect(() => checkOrigin(spoofed, publicUrl)).toThrow();
});
