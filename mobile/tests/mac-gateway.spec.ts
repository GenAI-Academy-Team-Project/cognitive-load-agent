import { test, expect } from '@playwright/test';
import { createMacGateway } from '../scripts/mac-gateway.mjs';
import type { AddressInfo } from 'node:net';

test('Mac gateway keeps origin enforcement and native-style sessions with the real local backend', async ({ request }) => {
  const gateway = createMacGateway({ publicOrigin: 'https://mobile.carestead.test', backendOrigin: `http://127.0.0.1:${process.env.CARESTEAD_MOBILE_TEST_BACKEND_PORT || 43980}` });
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
  try {
    const denied = await request.post(`${url}/api/auth/guest`, { headers: { Origin: 'https://untrusted.test' } });
    expect(denied.status()).toBe(403);
    const absent = await request.post(`${url}/api/auth/guest`);
    expect(absent.status()).toBe(403);
    const accepted = await request.post(`${url}/api/auth/guest`, { headers: { Origin: 'https://mobile.carestead.test' } });
    expect(accepted.status()).toBe(200);
    const cookie = accepted.headers()['set-cookie'];
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure');
    const session = await request.get(`${url}/api/auth/session`, { headers: { Cookie: cookie.split(';')[0] } });
    expect(session.status()).toBe(200);
    const signedOut = await request.post(`${url}/api/auth/sign-out`, { headers: { Origin: 'https://mobile.carestead.test', Cookie: cookie.split(';')[0] } });
    expect(signedOut.status()).toBe(200);
    expect((await request.get(`${url}/api/auth/session`, { headers: { Cookie: cookie.split(';')[0] } })).status()).toBe(401);
  } finally { await new Promise<void>((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve())); }
});
