import { expect, test } from '@playwright/test';

test('recipient chat answers with evidence and executes only after approval', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  await page.getByRole('button', { name: /ask carestead about/i }).click();
  await expect(page.getByRole('heading', { name: /ask about alex/i })).toBeVisible();

  await page.getByRole('button', { name: 'What should I review today?' }).click();
  await expect(page.getByText(/has \d+ open risk/i)).toBeVisible();
  await expect(page.getByText(/evidence used/i)).toBeVisible();

  const composer = page.getByRole('textbox', { name: /message carestead/i });
  await composer.fill('Reschedule the physiotherapy appointment to tomorrow at 3:30 PM');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText(/prepared this action/i)).toBeVisible();
  await expect(page.getByText(/move “physiotherapy appointment”/i)).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/physiotherapy appointment was rescheduled/i)).toBeVisible();
  await expect(page.getByText('executed', { exact: true })).toBeVisible();
});
