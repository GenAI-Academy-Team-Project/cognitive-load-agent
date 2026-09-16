import { expect, request } from '@playwright/test';

// The backend allows one bootstrap owner; every later account needs an invitation.
export async function inviteCaregiver(baseURL: string, email: string, displayName: string) {
  const admin = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const credentials = { email: 'mobile-test-admin@example.test', password: 'Carestead test admin 2026!' };
    const created = await admin.post('/api/auth/sign-up', { data: { ...credentials, displayName: 'Mobile Test Admin', confirmPassword: credentials.password } });
    if (!created.ok()) expect((await admin.post('/api/auth/sign-in', { data: credentials })).ok()).toBe(true);
    const state = await (await admin.get('/api/state')).json();
    const invited = await admin.post('/api/state', { data: { action: 'invite_member', recipientId: state.selectedRecipient.id, email, displayName, role: 'caregiver' } });
    expect(invited.ok(), await invited.text()).toBe(true);
    return new URL((await invited.json()).invitationUrl, baseURL).hash.slice('#invitation='.length);
  } finally { await admin.dispose(); }
}

export async function secondRecipient(baseURL: string, email: string) {
  const admin = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    expect((await admin.post('/api/auth/sign-in', { data: { email: 'mobile-test-admin@example.test', password: 'Carestead test admin 2026!' } })).ok()).toBe(true);
    const created = await admin.post('/api/state', { data: { action: 'create_recipient', displayName: 'Mobile Second Recipient', templateKey: 'aging-at-home', timezone: 'America/Toronto', consentAccepted: true, nonClinicalAcknowledged: true } });
    expect(created.ok(), await created.text()).toBe(true);
    const data = await created.json();
    expect((await admin.post('/api/state', { data: { action: 'invite_member', recipientId: data.selectedRecipient.id, email, role: 'caregiver' } })).ok()).toBe(true);
    return { status: created.status(), data };
  } finally { await admin.dispose(); }
}
