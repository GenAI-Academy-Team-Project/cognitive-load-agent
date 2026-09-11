import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations, results.violations.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
}

test('core caregiver surfaces meet automated WCAG checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: /ask carestead about/i }).click();
  await expect(page.getByRole('heading', { name: /ask about alex/i })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Handover', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /at a glance/i })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Privacy & data', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /consent, retention & data/i })).toBeVisible();
  await expectAccessible(page);
});
