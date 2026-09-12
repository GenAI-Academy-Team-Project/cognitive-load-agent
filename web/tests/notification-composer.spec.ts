import { notificationActor } from './helpers/notification-actor';
import { expect, test } from '@playwright/test';

for (const stopOnSecond of [false, true]) {
  test(`bulk approval excludes discarded drafts and ${stopOnSecond ? 'stops safely on error' : 'sends remaining channels'}`, async ({
    page,
  }) => {
    const dashboard = await (await page.request.get('/api/state')).json();
    const chat = await (
      await page.request.get(
        `/api/chat?recipientId=${dashboard.selectedRecipient.id}`,
      )
    ).json();
    const member = dashboard.careCircle.find(
      (item: { status: string }) => item.status === 'active',
    );
    let drafts: {
      id: string;
      action_type: string;
      status: string;
      payload: Record<string, string>;
    }[] = [];
    const approvals: string[] = [];
    await page.route('**/api/chat*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.action === 'propose_notification') {
          expect(body.notification.channels).toEqual(['in_app', 'ntfy', 'sms']);
          drafts = body.notification.channels.map((channel: string) => ({
            id: channel,
            action_type: 'send_notification',
            status: 'pending',
            payload: {
              ...body.notification,
              channel,
              targetName: member.display_name,
            },
          }));
        } else if (body.action === 'edit_notification') {
          drafts = drafts.map((draft) =>
            draft.id === body.actionId
              ? {
                  ...draft,
                  id: draft.id + '-edited',
                  payload: { ...draft.payload, ...body.notification },
                }
              : draft,
          );
        } else if (body.action === 'reject_action')
          drafts = drafts.filter((draft) => draft.id !== body.actionId);
        else if (body.action === 'approve_action') {
          approvals.push(body.actionId);
          if (stopOnSecond && body.actionId === 'sms') {
            await route.fulfill({
              status: 409,
              json: { error: 'This caregiver disabled SMS.' },
            });
            return;
          }
          drafts = drafts.filter((draft) => draft.id !== body.actionId);
        } else throw new Error('Unexpected action');
      }
      await route.fulfill({
        json: {
          ...chat,
          notificationChannels: ['in_app', 'ntfy', 'sms'],
          messages: drafts.map((action) => ({
            id: action.id,
            role: 'assistant',
            content: 'Review',
            action,
          })),
        },
      });
    });
    await page.goto('/?view=Notifications');
    const composer = page.getByRole('region', { name: 'Compose notification' });
    const toggle = composer.getByRole('button', {
      name: 'Send a notification',
      exact: true,
    });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(composer.getByLabel('Receiving caregiver')).toBeHidden();
    await toggle.click();
    await composer.getByLabel('Receiving caregiver').selectOption(member.id);
    await composer
      .getByLabel('Notification title', { exact: true })
      .fill('Shared title');
    await composer
      .getByLabel('Message', { exact: true })
      .fill('Shared message');
    await composer.getByRole('checkbox', { name: 'Carestead inbox' }).uncheck();
    await expect(
      composer.getByRole('button', { name: 'Prepare notification' }),
    ).toBeDisabled();
    await composer.getByRole('checkbox', { name: 'Carestead inbox' }).check();
    await composer.getByRole('checkbox', { name: 'Mobile push' }).check();
    await composer.getByRole('checkbox', { name: 'SMS', exact: true }).check();
    await composer
      .getByRole('button', { name: 'Prepare notification' })
      .click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await composer.getByRole('tab', { name: 'Mobile push (1)' }).click();
    await composer
      .getByRole('button', { name: 'Edit draft', exact: true })
      .click();
    await composer
      .getByRole('textbox', { name: 'Draft message', exact: true })
      .fill('Mobile only');
    await expect(
      composer.getByRole('button', { name: 'Approve and send', exact: true }),
    ).toBeDisabled();
    await expect(
      composer.getByRole('button', {
        name: 'Approve and send all (3)',
        exact: true,
      }),
    ).toBeDisabled();
    await composer.getByRole('tab', { name: 'Carestead inbox (1)' }).click();
    await expect(
      composer
        .getByRole('tabpanel', { name: 'Carestead inbox (1)' })
        .getByText('Shared message', { exact: true }),
    ).toBeVisible();
    await composer.getByRole('tab', { name: 'Mobile push (1)' }).click();
    await expect(
      composer.getByRole('textbox', { name: 'Draft message', exact: true }),
    ).toHaveValue('Mobile only');
    await composer
      .getByRole('button', { name: 'Save draft', exact: true })
      .click();
    await expect(
      composer.getByText('Mobile only', { exact: true }),
    ).toBeVisible();
    await composer
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click();
    await expect(
      composer.getByRole('tab', { name: 'Mobile push (1)' }),
    ).toBeHidden();
    await expect(
      composer
        .getByRole('tabpanel', { name: 'Carestead inbox (1)' })
        .getByText('Shared message', { exact: true }),
    ).toBeVisible();
    if (!stopOnSecond) {
      const panel = composer.getByRole('tabpanel', {
        name: 'Carestead inbox (1)',
      });
      await panel
        .getByText('Filter and manage carestead inbox drafts', { exact: true })
        .click();
      await panel.screenshot({
        path: '.playwright-runs/draft-controls-container.png',
      });
    }
    await composer
      .getByRole('button', { name: 'Approve and send all (2)', exact: true })
      .click();
    if (stopOnSecond) {
      await expect(composer.getByRole('alert')).toContainText(
        '1 of 2 drafts approved before sending stopped.',
      );
      await expect(
        composer.getByRole('tab', { name: 'SMS (1)' }),
      ).toBeVisible();
    } else {
      await expect(
        composer.getByText('2 notification drafts approved.', { exact: false }),
      ).toBeVisible();
      await expect(composer.getByRole('tablist')).toBeHidden();
    }
    expect(approvals).toEqual(['in_app', 'sms']);
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('editing through the API requires fresh approval and preserves another draft', async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  const actor = await notificationActor(request, browser, baseURL!);
  await page.context().clearCookies();
  await page.context().addCookies(actor.cookies);
  const state = await (await page.request.get('/api/state')).json();
  const recipientId = state.selectedRecipient.id;
  const member = state.careCircle.find(
    (item: { email: string }) => item.email === state.currentUser.email,
  );
  const headers = { Origin: baseURL! };
  const create = async (title: string) => {
    const response = await page.request.post('/api/chat', {
      headers,
      data: {
        action: 'propose_notification',
        recipientId,
        notification: {
          channels: ['in_app'],
          memberId: member.id,
          title,
          detail: 'Original',
        },
      },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).messages.find(
      (message: { action?: { payload: { title: string } } }) =>
        message.action?.payload.title === title,
    ).action;
  };
  const first = await create('Edit only this'),
    other = await create('Leave this alone');
  const response = await page.request.post('/api/chat', {
    headers,
    data: {
      action: 'edit_notification',
      recipientId,
      actionId: first.id,
      notification: { title: 'Edited draft', detail: 'Updated' },
    },
  });
  expect(response.ok()).toBe(true);
  const chat = await response.json();
  expect(
    chat.messages.find(
      (message: { action?: { id: string } }) => message.action?.id === other.id,
    ).action,
  ).toEqual(other);
  const updated = chat.messages.find(
    (message: { action?: { payload: { title: string } } }) =>
      message.action?.payload.title === 'Edited draft',
  ).action;
  expect(updated.id).not.toBe(first.id);
  expect(
    (
      await page.request.post('/api/chat', {
        headers,
        data: { action: 'approve_action', recipientId, actionId: first.id },
      })
    ).status(),
  ).toBe(409);
  for (const actionId of [updated.id, other.id])
    expect(
      (
        await page.request.post('/api/chat', {
          headers,
          data: { action: 'reject_action', recipientId, actionId },
        })
      ).ok(),
    ).toBe(true);
});
