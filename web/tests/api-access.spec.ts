import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Match the public origin loaded by the local Worker without exposing other bindings.
const publicOrigin = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8').match(/^AUTH_PUBLIC_URL=["']?([^\s"']+)/m)?.[1] : undefined;

test('backend routes accept authenticated reads and trusted-origin updates', async ({ request, baseURL }) => {
  const dashboard = await (await request.get('/api/state')).json();
  const recipientId = dashboard.selectedRecipient.id;
  for (const route of ['health', 'auth/session', 'state', 'planning', 'integrations', 'notifications', 'chat', 'calendar', 'export']) {
    const careField = route === 'notifications' ? 'careRecipientId' : 'recipientId';
    const response = await request.get(`/api/${route}?${careField}=${recipientId}`);
    expect(response.status(), `GET /api/${route}`).toBe(200);
    if (process.env.CARESTEAD_TEST_HTTPS === '1') {
      const httpUrl = new URL(`/api/${route}?${careField}=${recipientId}`, baseURL);
      httpUrl.protocol = 'http:';
      httpUrl.port = process.env.CARESTEAD_HTTP_PORT || String(Number(httpUrl.port) + 1);
      const redirect = await request.get(httpUrl.href, { maxRedirects: 0 });
      expect(redirect.status()).toBe(307);
      expect(redirect.headers().location).toBe(`${baseURL}/api/${route}?${careField}=${recipientId}`);
    }
  }
  const callback = await request.get('/api/calendar/callback', { maxRedirects: 0 });
  expect(callback.status()).toBe(303);
  expect(callback.headers().location).toMatch(/^\/\?view=Calendar&/);

  for (const origin of new Set([baseURL!, ...(publicOrigin && process.env.CARESTEAD_TEST_HTTPS !== '1' ? [new URL(publicOrigin).origin] : [])])) {
    const headers = { Origin: origin, 'Sec-Fetch-Site': 'same-origin' };
    const updates = [
      { route: 'state', data: { action: 'run_check', recipientId }, status: 200 },
      { route: 'integrations', data: { id: 'calendar', enabled: false }, status: 200 },
      { route: 'planning', data: { action: 'acknowledge', recipientId }, status: 200 },
      { route: 'notifications', data: { action: 'save_preferences', careRecipientId: recipientId, emailEnabled: false, smsEnabled: false, phone: '' }, status: 200 },
      { route: 'calendar', data: { action: 'disconnect', recipientId }, status: 200 },
      // Reach chat's action validation without calling an external provider.
      { route: 'chat', data: { action: 'reject_action', recipientId }, status: 400 },
    ];
    for (const { route, data, status } of updates) {
      if (route === 'planning') {
        const planning = await (await request.get(`/api/planning?recipientId=${recipientId}`)).json();
        Object.assign(data, { snapshot: JSON.stringify(planning.state.handover.snapshot) });
      }
      const response = await request.post(`/api/${route}`, { headers, data });
      expect(response.status(), `POST /api/${route} from ${origin}: ${await response.text()}`).toBe(status);
      const blocked = await request.post(`/api/${route}`, { headers: { Origin: 'https://untrusted.example' }, data });
      expect(blocked.status(), `untrusted POST /api/${route}`).toBe(403);
    }
  }
});
