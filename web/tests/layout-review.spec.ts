import { expect, test } from '@playwright/test';

for (const view of ['Overview', 'Care plan', 'Care Organizer', 'Care circle', 'Handover', 'Responsibilities', 'Timeline', 'Evaluations', 'Memory', 'Notifications', 'Calendar', 'Integrations', 'Privacy & data']) {
  test(`${view} containers fit desktop and mobile`, async ({ page }, info) => {
    await page.goto('/?view=' + encodeURIComponent(view));
    await expect(page.locator('#care-content h1').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: info.outputPath(`layout-${width}.png`), fullPage: true });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('expanded organizer tools, notification forms and integration settings reflow', async ({ page }, info) => {
  await page.goto('/?view=Care%20Organizer');
  const tools = page.getByRole('group', { name: 'Planning tools', exact: true });
  await expect(tools).toBeVisible();
  const names = await tools.getByRole('button').allTextContents();
  for (const name of names) {
    await tools.getByRole('button', { name: name.trim(), exact: true }).click();
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name.replace(/[^a-z0-9]/gi, '-')}-${width}.png`), fullPage: true });
    }
  }
  await page.goto('/?view=Notifications');
  await page.getByRole('button', { name: 'Send a notification', exact: true }).click();
  await expect(page.getByLabel('Receiving caregiver')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('notification-expanded-mobile.png'), fullPage: true });
  await page.goto('/?view=Integrations');
  await page.getByRole('button', { name: 'Manage settings for Mobile push', exact: true }).click();
  await page.getByText('Environment configuration', { exact: true }).first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('integration-expanded-mobile.png'), fullPage: true });
});

test('common editor dialogs and chat fit narrow screens', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  for (const [view, button] of [['Overview', 'Add responsibility'], ['Care circle', 'Invite member'], ['Memory', 'Add trusted fact'], ['Handover', 'Edit profile']]) {
    await page.goto('/?view=' + encodeURIComponent(view));
    await page.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeLessThanOrEqual(900);
    await dialog.screenshot({ path: info.outputPath(`${view.replaceAll(' ', '-')}-dialog.png`) });
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: /Ask Carestead about/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('chat-mobile.png') });
});
