import { expect, test } from '@playwright/test';

test('settings navigation works on desktop and mobile without sidebar duplicates', async ({ page }) => {
  await page.goto('/');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Account settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Privacy & data', exact: true }).click();
    await expect(page.getByRole('heading', { name: /consent, retention & data/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name: /Calendar|Notifications|Privacy & data|Integrations|Memory/ })).toHaveCount(0);
    for (const [label, heading] of [['Integrations', 'Integrations'], ['Memory', 'Trusted care facts']] as const) {
      await page.getByRole('button', { name: 'Account settings', exact: true }).click();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    const calendar = page.locator('header').getByRole('button', { name: 'Calendar', exact: true });
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toHaveCount(1);
    await calendar.click();
    await expect(calendar).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    await page.locator('header').getByRole('button', { name: /^Notifications, / }).click();
    await expect(page.getByRole('button', { name: /^Notifications, / })).toHaveAttribute('aria-pressed', 'true');
    await expect(calendar).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Profile settings for/ }).click();
    await page.getByRole('menuitem', { name: 'Role details' }).click();
    await expect(page.getByRole('dialog')).toContainText('owner');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: /Profile settings for/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('password changes verify credentials and revoke other sessions', async ({ page, browser, baseURL }) => {
  const headers = { Origin: baseURL! };
  const initial = await (await page.request.get('/api/state')).json();
  const email = 'password-viewer@example.test';
  const password = 'Original password for settings 2026!';
  const newPassword = 'Updated password for settings 2026!';
  const invite = await page.request.post('/api/state', { headers, data: { action: 'invite_member', recipientId: initial.selectedRecipient.id, displayName: 'Password viewer', email, role: 'viewer' } });
  expect(invite.status()).toBe(200);
  const invitation = new URLSearchParams(new URL((await invite.json()).invitationUrl, baseURL).hash.slice(1)).get('invitation');
  const member = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const other = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    expect((await member.request.post('/api/auth/sign-up', { headers, data: { invitation, displayName: 'Password viewer', email, password, confirmPassword: password } })).status()).toBe(201);
    expect((await other.request.post('/api/auth/sign-in', { headers, data: { email, password } })).status()).toBe(200);
    const data = { currentPassword: password, newPassword, confirmPassword: newPassword };
    expect((await member.request.post('/api/auth/update-password', { headers: { Origin: 'https://untrusted.example' }, data })).status()).toBe(403);
    expect((await member.request.post('/api/auth/update-password', { headers, data: { ...data, newPassword: 'short' } })).status()).toBe(400);
    expect((await member.request.post('/api/auth/update-password', { headers, data: { ...data, confirmPassword: 'different' } })).status()).toBe(400);
    const memberPage = await member.newPage();
    await memberPage.goto('/');
    await memberPage.getByRole('button', { name: /Profile settings for/ }).click();
    await memberPage.getByRole('menuitem', { name: 'Update password' }).click();
    await memberPage.getByLabel('Current password', { exact: true }).fill('Incorrect password');
    await memberPage.getByLabel('New password', { exact: true }).fill(newPassword);
    await memberPage.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
    await memberPage.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(memberPage.getByRole('alert')).toContainText('current password is incorrect');
    await memberPage.getByLabel('Current password', { exact: true }).fill(password);
    await memberPage.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(memberPage.getByRole('dialog').getByRole('status')).toContainText('Password updated');
    expect((await member.request.get('/api/auth/session')).status()).toBe(200);
    expect((await other.request.get('/api/auth/session')).status()).toBe(401);
    expect((await other.request.post('/api/auth/sign-in', { headers, data: { email, password } })).status()).toBe(401);
    expect((await other.request.post('/api/auth/sign-in', { headers, data: { email, password: newPassword } })).status()).toBe(200);
    await memberPage.getByRole('button', { name: 'Close', exact: true }).click();
    await memberPage.getByRole('button', { name: /Profile settings for/ }).click();
    await memberPage.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(memberPage).toHaveURL(/sign-in/);
  } finally { await member.close(); await other.close(); }
});

test('moved destinations still open from direct links', async ({ page }) => {
  for (const [view, heading] of [['Calendar', 'Calendar'], ['Notifications', 'Notifications'], ['Integrations', 'Integrations'], ['Memory', 'Trusted care facts'], ['Privacy & data', 'Consent, retention & data']] as const) {
    await page.goto(`/?view=${encodeURIComponent(view)}`);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});


test('profile names persist without changing login credentials or other accounts', async ({ page, browser, baseURL }) => {
  const headers = { Origin: baseURL! };
  const original = await (await page.request.get('/api/state')).json();
  const anonymous = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const data = { displayName: 'Updated preferred name' };
    expect((await anonymous.request.post('/api/auth/update-profile', { headers, data })).status()).toBe(401);
    await anonymous.request.post('/api/auth/guest', { headers });
    expect((await anonymous.request.post('/api/auth/update-profile', { headers, data })).status()).toBe(403);
    expect((await page.request.post('/api/auth/update-profile', { headers: { Origin: 'https://untrusted.example' }, data })).status()).toBe(403);
    for (const invalid of [{ displayName: '   ' }, { displayName: 'x'.repeat(101) }, { displayName: 123 }, { ...data, email: 'changed@example.test' }, { ...data, id: 'another-user', role: 'owner' }]) {
      expect((await page.request.post('/api/auth/update-profile', { headers, data: invalid })).status()).toBe(400);
    }
    await page.goto('/');
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByRole('button', { name: /Profile settings for/ }).click();
    await page.getByRole('menuitem', { name: 'Edit profile' }).click();
    await expect(page.getByLabel('Email address', { exact: true })).toHaveAttribute('readonly', '');
    await page.getByLabel('Display name', { exact: true }).fill('  Updated preferred name  ');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Profile updated.');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Profile settings for Updated preferred name', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Profile settings for Updated preferred name', exact: true })).toBeVisible();
    const state = await (await page.request.get('/api/state')).json();
    expect(state.currentUser).toEqual({ ...original.currentUser, displayName: data.displayName });
    expect(state.careCircle).toEqual(original.careCircle.map((member: { email: string }) => member.email === original.currentUser.email ? { ...member, display_name: data.displayName, updated_at: expect.any(String) } : member));
    expect((await (await page.request.get('/api/auth/session')).json()).user.displayName).toBe(data.displayName);
  } finally {
    await page.request.post('/api/auth/update-profile', { headers, data: { displayName: original.currentUser.displayName } });
    await anonymous.close();
  }
});
