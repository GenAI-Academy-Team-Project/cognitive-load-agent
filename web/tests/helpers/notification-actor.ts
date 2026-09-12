import { expect, type APIRequestContext, type Browser } from '@playwright/test';

export async function notificationActor(request: APIRequestContext, browser: Browser, baseURL: string) {
  const state = await (await request.get('/api/state')).json();
  const email = `notification-actor-${crypto.randomUUID()}@example.test`;
  const invited = await request.post('/api/state', {
    headers: { Origin: baseURL },
    data: { action: 'invite_member', recipientId: state.selectedRecipient.id, displayName: 'Notification actor', email, role: 'caregiver' },
  });
  expect(invited.status()).toBe(200);
  const invitation = new URLSearchParams(new URL((await invited.json()).invitationUrl, baseURL).hash.slice(1)).get('invitation');
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const password = 'Notification actor password 2026!';
    const signup = await context.request.post('/api/auth/sign-up', {
      headers: { Origin: baseURL }, data: { invitation, email, displayName: 'Notification actor', password, confirmPassword: password },
    });
    expect(signup.status()).toBe(201);
    return await context.storageState();
  } finally {
    await context.close();
  }
}
