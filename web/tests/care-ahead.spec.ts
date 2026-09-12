import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('care ahead supports personalized planning, approved recurrence, visit notes, and a digest', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /good morning/i }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Care planning', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'A little less to remember.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Your week ahead', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page
      .getByRole('group', { name: 'Seven-day care forecast' })
      .or(page.locator('[aria-label="Seven-day care forecast"]')),
  ).toBeVisible();
  await page
    .getByText('Make this plan fit your family', { exact: true })
    .click();
  await page
    .getByLabel('Daily care limit for this person (minutes)')
    .fill('75');
  await page.getByLabel('In-app digest hour').fill('18');
  await page.getByRole('button', { name: 'Save my preferences' }).click();
  await expect(
    page.getByText('Saved to the care plan.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label="Seven-day care forecast"]'),
  ).toContainText('75 min');
  let accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page
    .getByRole('button', { name: 'Recurring care', exact: true })
    .click();
  await page
    .getByLabel('Responsibility', { exact: true })
    .fill('Weekly supply check');
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await page
    .getByLabel('Next date and time', { exact: true })
    .fill(`${day}T15:00`);
  await page.getByRole('button', { name: 'Save routine', exact: true }).click();
  await page
    .getByRole('button', { name: 'Review next occurrence', exact: true })
    .click();
  await expect(
    page.getByText(
      'Proposal ready for review below. No responsibilities changed.',
    ),
  ).toBeVisible();
  const proposal = page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Next occurrence: Weekly supply check',
      exact: true,
    }),
  });
  await proposal
    .getByRole('button', { name: 'Approve and apply', exact: true })
    .click();
  await expect(proposal).toContainText('applied');
  await page.reload();
  await page
    .getByRole('button', { name: 'Care planning', exact: true })
    .first()
    .click();
  await page
    .getByText('Make this plan fit your family', { exact: true })
    .click();
  await expect(
    page.getByLabel('Daily care limit for this person (minutes)'),
  ).toHaveValue('75');

  await page
    .getByRole('button', { name: 'Visit preparation', exact: true })
    .click();
  await page
    .getByLabel('Questions to ask', { exact: true })
    .fill('Which paperwork should we bring?');
  await page
    .getByRole('button', { name: 'Save appointment notes', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Saved visit brief' })).toHaveValue(/Which paperwork should we bring\?/);
  accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'My attention', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Start with what needs a decision.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your routine update digest' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: '.playwright-runs/care-ahead-mobile.png',
    fullPage: true,
  });
});

test('new planning actions reject unrelated recipients and respect consent withdrawal', async ({
  request,
  baseURL,
}) => {
  const stateResponse = await request.get('/api/state');
  const current = await stateResponse.json();
  const forbidden = await request.post('/api/planning', {
    headers: { Origin: baseURL! },
    data: {
      recipientId: 'unrelated-recipient',
      action: 'save_attention',
      dailyMinutes: 60,
      digestHour: 18,
      focusMode: true,
    },
  });
  expect(forbidden.status()).toBe(403);
  const invalid = await request.post('/api/planning', {
    headers: { Origin: baseURL! },
    data: {
      recipientId: current.selectedRecipient.id,
      action: 'save_care_preference',
      memoryId: 'unrelated-memory',
      startHour: 12,
      endHour: 17,
    },
  });
  expect(invalid.status()).toBe(400);
  const consentData = {
    recipientId: current.selectedRecipient.id,
    action: 'update_consent',
    retentionDays: current.consent.retention_days,
    purpose: current.consent.purpose,
    nonClinicalAcknowledged: true,
  };
  const withdrawn = await request.post('/api/state', {
    headers: { Origin: baseURL! },
    data: { ...consentData, consentStatus: 'withdrawn' },
  });
  expect(withdrawn.ok()).toBe(true);
  try {
    const blocked = await request.post('/api/planning', {
      headers: { Origin: baseURL! },
      data: {
        recipientId: current.selectedRecipient.id,
        action: 'save_attention',
        dailyMinutes: 60,
        digestHour: 18,
        focusMode: true,
      },
    });
    expect(blocked.status()).toBe(409);
  } finally {
    const restored = await request.post('/api/state', {
      headers: { Origin: baseURL! },
      data: { ...consentData, consentStatus: 'active' },
    });
    expect(restored.ok()).toBe(true);
  }
});
