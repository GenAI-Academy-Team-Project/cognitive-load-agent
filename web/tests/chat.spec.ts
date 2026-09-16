import { expect, test } from '@playwright/test';

test('recipient chat answers with evidence and executes only after approval', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  await page.getByRole('button', { name: /ask carestead about/i }).click();
  await expect(page.getByRole('heading', { name: /ask about alex/i })).toBeVisible();

  await page.getByRole('button', { name: 'What should I review today?' }).click();
  await expect(page.getByText(/has \d+ open risk/i)).toBeVisible();
  await expect(page.getByText(/evidence used/i)).toBeVisible();
  const messages = page.getByRole('dialog').locator('article');
  await expect(messages).toHaveCount(2);
  await expect(messages.nth(0)).toHaveAttribute('aria-label', 'You said');
  await expect(messages.nth(0)).toContainText('What should I review today?');
  await expect(messages.nth(1)).toHaveAttribute('aria-label', 'Carestead said');

  await expect(page.getByText('Filter and manage chat history', { exact: true })).toHaveCount(0);

  const composer = page.getByRole('textbox', { name: /message carestead/i });
  await composer.fill('Reschedule the physiotherapy appointment to tomorrow at 3:30 PM');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText(/prepared this action/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeInViewport();
  await expect(page.getByText('No matches. Change or clear your filters to see more.')).toHaveCount(0);
  await expect(page.getByText(/move “physiotherapy appointment”/i)).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/physiotherapy appointment was rescheduled/i)).toBeVisible();
  await expect(page.getByText('executed', { exact: true })).toBeVisible();

  const spokenRepliesToggle = page.getByRole('button', { name: /Turn (on|off) spoken replies/ });
  await expect(spokenRepliesToggle).toBeVisible();
  const initialState = await spokenRepliesToggle.getAttribute('aria-pressed');
  await spokenRepliesToggle.click();
  const newState = await spokenRepliesToggle.getAttribute('aria-pressed');
  expect(newState).not.toBe(initialState);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /ask carestead about/i }).click();
  await expect(page.getByRole('button', { name: 'Show previous conversation' })).toBeVisible();
  await expect(messages).toHaveCount(0);
  await expect(page.getByText(/physiotherapy appointment was rescheduled/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show previous conversation' }).click();
  await expect(page.getByText(/physiotherapy appointment was rescheduled/i)).toBeVisible();
  await expect(page.getByText('Reschedule the physiotherapy appointment to tomorrow at 3:30 PM', { exact: true })).toBeVisible();
  await expect(messages).toHaveCount(5);
  expect(await messages.evaluateAll(items => items.map(item => item.getAttribute('aria-label')))).toEqual([
    'You said', 'Carestead said', 'You said', 'Carestead said', 'Carestead said',
  ]);
  await expect(page.getByText(/physiotherapy appointment was rescheduled/i)).toBeInViewport();
  await page.getByRole('button', { name: 'Hide previous conversation' }).click();
  await expect(messages).toHaveCount(0);
  await composer.fill('What does Alex prefer?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(messages).toHaveCount(2);
  await expect(messages.nth(0)).toContainText('What does Alex prefer?');
  await expect(messages.nth(1)).toHaveAttribute('aria-label', 'Carestead said');
  await expect(page.getByText(/physiotherapy appointment was rescheduled/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear chat history', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(messages).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear chat history', exact: true }).click();
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clear chat history?' })).toHaveCount(0);
  await expect(messages).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /ask carestead about/i }).click();
  await expect(page.getByRole('button', { name: 'What should I review today?' })).toBeVisible();
  await expect(messages).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show previous conversation' })).toHaveCount(0);
  const saved = await (await page.request.get('/api/chat?recipientId=recipient-alex')).json();
  expect(saved.messages).toEqual([]);
});
