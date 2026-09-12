import { expect, test } from '@playwright/test';

for (const view of ['Overview', 'Care plan', 'Care Organizer', 'Care circle', 'Handover', 'Responsibilities', 'Timeline', 'Evaluations', 'Memory', 'Notifications', 'Calendar', 'Integrations']) {
  test(`${view} containers fit desktop and mobile`, async ({ page }, info) => {
    await page.goto('/?view=' + encodeURIComponent(view));
    await expect(page.locator('#care-content h1').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`layout-${width}.png`), fullPage: true });
    }
  });
}
