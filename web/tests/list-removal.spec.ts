import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function createRecipient(
  page: import('@playwright/test').Page,
  baseURL: string,
) {
  const initial = await (await page.request.get('/api/state')).json();
  const response = await page.request.post('/api/state', {
    headers: { Origin: baseURL },
    data: {
      action: 'create_recipient',
      displayName: `List controls ${Date.now()}`,
      templateKey: initial.templates[0].template_key,
      consentAccepted: true,
      nonClinicalAcknowledged: true,
    },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test('removal persists and clear all includes filtered items across pages', async ({
  page,
  baseURL,
}) => {
  let state = await createRecipient(page, baseURL!);
  const recipientId = state.selectedRecipient.id;
  for (let i = 0; i < 7; i++) {
    const response = await page.request.post('/api/state', {
      headers: { Origin: baseURL! },
      data: {
        action: 'add_task',
        recipientId,
        title: `Removal test ${i}`,
        dueAt: '2027-01-01T12:00:00Z',
      },
    });
    expect(response.status()).toBe(200);
    state = await response.json();
  }
  await page.goto(`/?view=Responsibilities&recipientId=${recipientId}`);
  const count = state.tasks.length;
  await expect(
    page.getByRole('button', {
      name: `Clear all responsibilities (${count})`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Search responsibilities' })
    .fill('Removal test 6');
  await page
    .getByRole('button', {
      name: `Clear all responsibilities (${count})`,
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toContainText('every page');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(
    (
      await (
        await page.request.get(`/api/state?recipientId=${recipientId}`)
      ).json()
    ).tasks,
  ).toHaveLength(count);
  await page
    .getByRole('button', {
      name: `Clear all responsibilities (${count})`,
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Clear all', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(
    page.getByText('No responsibilities to show.', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.get(`/api/state?recipientId=${recipientId}`)
      ).json()
    ).tasks,
  ).toHaveLength(0);
  const other = await (await page.request.get('/api/state')).json();
  const denied = await page.request.post('/api/state', {
    headers: { Origin: baseURL! },
    data: {
      action: 'remove_list_items',
      recipientId,
      list: 'tasks',
      ids: [other.tasks[0].id],
    },
  });
  expect(denied.status()).toBe(404);
});

test('notification templates and custom messages preview, approve, and remove persistently', async ({
  page,
  baseURL,
}) => {
  const state = await createRecipient(page, baseURL!);
  const recipientId = state.selectedRecipient.id;
  await page.goto(`/?view=Notifications&recipientId=${recipientId}`);
  const form = page.getByRole('region', { name: 'Compose notification' });
  await form.getByRole('button', { name: 'Send a notification', exact: true }).click();
  await form.getByLabel('Message template').selectOption('handover');
  await expect(form.getByLabel('Notification title')).toHaveValue(
    'Handover ready for review',
  );
  await form.getByLabel('Message template').selectOption('custom');
  await form.getByLabel('Notification title').fill('A custom notification');
  await form
    .getByLabel('Message', { exact: true })
    .fill('Please review our new care plan.');
  await form
    .getByLabel('Receiving caregiver')
    .selectOption(state.careCircle[0].id);
  await form.getByRole('button', { name: 'Prepare notification' }).click();
  await expect(
    form.getByRole('button', { name: 'Approve and send', exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.get(`/api/state?recipientId=${recipientId}`)
      ).json()
    ).notifications.some(
      (item: { title: string }) => item.title === 'A custom notification',
    ),
  ).toBe(false);
  await page.reload();
  await form.getByRole('button', { name: 'Approve and send', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A custom notification', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Remove A custom notification from notifications',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove item', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'A custom notification', exact: true }),
  ).toBeHidden();
  const settings = await (
    await page.request.get(`/api/notifications?recipientId=${recipientId}`)
  ).json();
  expect(
    settings.deliveries.some(
      (item: { title: string }) => item.title === 'A custom notification',
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-label="Compose notification"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('removing the last page returns to the preceding page without clearing filters', async ({
  page,
}) => {
  const state = await (await page.request.get('/api/state')).json();
  state.notifications = Array.from({ length: 7 }, (_, index) => ({
    ...state.notifications[0],
    id: `page-notice-${index}`,
    kind: ['approval', 'risk', 'reminder', 'system'][index % 4],
    title: `Page notice ${index}`,
  }));
  await page.route('**/api/state*', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      state.notifications = state.notifications.filter(
        (item: { id: string }) => !payload.ids.includes(item.id),
      );
    }
    await route.fulfill({ json: state });
  });
  await page.goto('/?view=Notifications');
  const nav = page.getByRole('navigation', {
    name: 'Notifications pagination',
    exact: true,
  });
  await expect(
    page.getByText('Approval request', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('Care risk', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText('System update', { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Search notifications', exact: true })
    .fill('Page notice');
  await nav.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Remove Page notice 6 from notifications',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove item', exact: true })
    .click();
  await expect(nav).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Page notice 0', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('searchbox', { name: 'Search notifications', exact: true }),
  ).toHaveValue('Page notice');
});

test('dismissals stay personal and viewers cannot clear shared records or owner access', async ({
  page,
  browser,
  baseURL,
}) => {
  const state = await (await page.request.get('/api/state')).json();
  const recipientId = state.selectedRecipient.id;
  const headers = { Origin: baseURL! };
  const response = await page.request.post('/api/state', {
    headers,
    data: {
      action: 'invite_member',
      recipientId,
      role: 'viewer',
      displayName: 'List Viewer',
      email: 'list-viewer@example.test',
    },
  });
  expect(response.status()).toBe(200);
  const invitation = new URLSearchParams(
    new URL((await response.json()).invitationUrl, baseURL).hash.slice(1),
  ).get('invitation');
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const signup = await context.request.post('/api/auth/sign-up', {
      headers,
      data: {
        invitation,
        email: 'list-viewer@example.test',
        displayName: 'List Viewer',
        password: 'A long list test password 2026!',
        confirmPassword: 'A long list test password 2026!',
      },
    });
    expect(signup.status()).toBe(201);
    const viewer = await (await context.request.get('/api/state')).json();
    const notification = viewer.notifications[0];
    expect(notification).toBeTruthy();
    expect(
      (
        await context.request.post('/api/state', {
          headers,
          data: {
            action: 'remove_list_items',
            recipientId,
            list: 'notifications',
            ids: [notification.id],
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await (await context.request.get('/api/state')).json()
      ).notifications.some(
        (item: { id: string }) => item.id === notification.id,
      ),
    ).toBe(false);
    expect(
      (await (await page.request.get('/api/state')).json()).notifications.some(
        (item: { id: string }) => item.id === notification.id,
      ),
    ).toBe(true);
    expect(
      (
        await context.request.post('/api/state', {
          headers,
          data: {
            action: 'remove_list_items',
            recipientId,
            list: 'tasks',
            ids: [state.tasks[0].id],
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.post('/api/state', {
          headers,
          data: {
            action: 'remove_list_items',
            recipientId,
            list: 'careCircle',
            ids: [
              state.careCircle.find(
                (member: { role: string }) => member.role === 'owner',
              ).id,
            ],
          },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await context.close();
  }
});
