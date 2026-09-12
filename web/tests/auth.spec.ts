import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('signed-out access is protected and password visibility is accessible', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  for (const route of [
    '/api/state',
    '/api/chat?recipientId=recipient-alex',
    '/api/export?recipientId=recipient-alex',
  ]) {
    expect((await context.request.get(route)).status()).toBe(401);
  }
  // Client-supplied identity headers no longer bypass sign-in.
  expect(
    (
      await context.request.get('/api/state', {
        headers: {
          'oai-authenticated-user-id': 'local-demo-owner',
          'oai-authenticated-user-email': 'frincy@example.test',
          'x-carestead-test-user-id': 'local-demo-owner',
          'x-carestead-test-user-email': 'frincy@example.test',
        },
      })
    ).status(),
  ).toBe(401);
  for (const route of ['/sign-in', '/sign-up']) {
    await page.goto(route);
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('A password to reveal');
    await expect(password).toHaveAttribute('type', 'password');
    await page
      .getByRole('button', { name: 'Show password', exact: true })
      .click();
    await expect(password).toHaveAttribute('type', 'text');
    await page
      .getByRole('button', { name: 'Hide password', exact: true })
      .click();
    await expect(password).toHaveAttribute('type', 'password');
    if (route === '/sign-up') {
      await page
        .getByRole('button', { name: 'Show confirmation password' })
        .click();
      await expect(
        page.getByLabel('Confirm password', { exact: true }),
      ).toHaveAttribute('type', 'text');
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/sign-up-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'test-results/sign-up-desktop.png',
    fullPage: true,
  });
  await context.close();
});

test('invitation sign-up, sign-in, viewer authorization, and sign-out', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /good morning/i }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Care Circle', exact: true })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Invite member', exact: true })
    .click();
  await page.getByLabel('Display name', { exact: true }).fill('Maya');
  await page.getByLabel('Email', { exact: true }).fill('maya@example.test');
  await page.getByRole('dialog').locator('#member-role').selectOption('viewer');
  await page.getByRole('button', { name: 'Record invitation' }).click();
  const link = await page.getByLabel('Invitation link').inputValue();
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const memberPage = await context.newPage();
  const headers = { Origin: baseURL! };
  const credentials = {
    email: 'maya@example.test',
    displayName: 'Maya',
    password: 'A long caregiver password 2026!',
    confirmPassword: 'A long caregiver password 2026!',
  };
  expect(
    (
      await context.request.post('/api/auth/sign-up', {
        headers,
        data: credentials,
      })
    ).status(),
  ).toBe(409);
  const invitation = new URLSearchParams(new URL(link).hash.slice(1)).get(
    'invitation',
  );
  expect(
    (
      await context.request.post('/api/auth/sign-up', {
        headers,
        data: { ...credentials, email: 'wrong@example.test', invitation },
      })
    ).status(),
  ).toBe(409);
  await memberPage.goto(link);
  await memberPage.getByLabel('Your name').fill('Maya');
  await memberPage.getByLabel('Email address').fill(credentials.email);
  await memberPage
    .getByLabel('Password', { exact: true })
    .fill(credentials.password);
  await memberPage
    .getByLabel('Confirm password', { exact: true })
    .fill(credentials.password);
  await memberPage
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    memberPage.getByRole('heading', { name: /good morning/i }),
  ).toBeVisible();
  const state = await (await context.request.get('/api/state')).json();
  expect(state.currentUser.role).toBe('viewer');
  expect(
    (
      await context.request.post('/api/state', {
        headers,
        data: { action: 'run_check', recipientId: 'recipient-alex' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.post('/api/auth/sign-up', {
        headers,
        data: { ...credentials, invitation },
      })
    ).status(),
  ).toBe(409);
  const cookies = await context.cookies();
  const session = cookies.find(
    (cookie) => cookie.name === 'carestead_session',
  )!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Lax');
  expect(
    (
      await context.request.post('/api/auth/sign-out', {
        headers: { Origin: 'https://untrusted.example' },
      })
    ).status(),
  ).toBe(403);
  await memberPage.getByRole('button', { name: /Profile settings for/ }).click();
  await memberPage.getByRole('menuitem', { name: 'Log out', exact: true }).click();
  await expect(memberPage).toHaveURL(/\/sign-in$/);
  expect(
    (
      await context.request.get('/api/state', {
        headers: { Cookie: `carestead_session=${session.value}` },
      })
    ).status(),
  ).toBe(401);
  await memberPage.getByLabel('Email address').fill(credentials.email);
  await memberPage
    .getByLabel('Password', { exact: true })
    .fill('incorrect password');
  await memberPage
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  await expect(memberPage.getByRole('alert')).toContainText(
    'Email or password is incorrect',
  );
  await memberPage
    .getByLabel('Password', { exact: true })
    .fill(credentials.password);
  await memberPage
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  await expect(memberPage).toHaveURL(baseURL + '/');
  await memberPage.reload();
  await expect(
    memberPage.getByRole('heading', { name: /good morning/i }),
  ).toBeVisible();
  await context.close();
});

test('guest preview is isolated, read-only, persistent, and revocable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  const headers = { Origin: baseURL! };
  expect((await context.request.post('/api/auth/guest', { headers: { Origin: 'https://untrusted.example' } })).status()).toBe(403);
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.getByRole('status')).toContainText('Guest preview');
  const state = await (await context.request.get('/api/state')).json();
  expect(state.currentUser.isGuest).toBe(true);
  expect(state.currentUser.role).toBe('viewer');
  expect(state.recipients.map((item: { id: string }) => item.id)).toEqual(['guest-sample']);
  for (const route of ['/api/state?recipientId=recipient-alex', '/api/chat?recipientId=recipient-alex', '/api/export?recipientId=recipient-alex', '/api/integrations', '/api/planning?recipientId=recipient-alex', '/api/calendar?recipientId=recipient-alex', '/api/notifications?recipientId=recipient-alex']) {
    expect((await context.request.get(route)).status(), route).toBe(403);
  }
  expect((await context.request.post('/api/state', { headers, data: { action: 'run_check', recipientId: 'guest-sample' } })).status()).toBe(403);
  await expect(page.getByRole('button', { name: 'Run care check' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Guest preview');
  const session = (await context.cookies()).find((cookie) => cookie.name === 'carestead_session')!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Lax');
  await page.getByRole('button', { name: /Profile settings for/ }).click();
  await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await context.request.get('/api/state', { headers: { Cookie: `carestead_session=${session.value}` } })).status()).toBe(401);
  await page.goto('/sign-up');
  await expect(page.getByRole('button', { name: 'Continue as guest' })).toBeVisible();
  await context.close();
});
