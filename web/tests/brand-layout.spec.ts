import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`brand surfaces reflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to care content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#care-content')).toBeFocused();
    const fits = async () => {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    await fits();
    await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
    await page.getByRole('button', { name: 'Add responsibility', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.height).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.screenshot({ path: testInfo.outputPath('enlarged.png'), fullPage: true });
    await fits();
  });
}

test('signed-out brand surfaces retain contrast and mobile reflow', async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, viewport: { width: 320, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const path of ['/sign-in', '/sign-up', '/forgot-password']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/sign-in');
  await page.screenshot({ path: testInfo.outputPath('sign-in-desktop.png'), fullPage: true });
  await context.close();
});

test('filter controls stay accessible on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/?view=Responsibilities');
  const filters = page.getByRole('group', { name: 'Filter Responsibilities', exact: true });
  await expect(filters).toBeVisible();
  await filters.getByRole('searchbox').fill('no matching responsibility');
  await expect(filters.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  await filters.getByRole('button', { name: 'Clear filters' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scan = await new AxeBuilder({ page }).include('.care-filters').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('filters-mobile.png'), fullPage: true });
});

for (const width of [390, 1024, 1280, 1440]) {
  test(`filters keep independent rows at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const filters = page.getByRole('group', { name: 'Filter Care risks', exact: true });
    const search = await filters.getByRole('searchbox').boundingBox();
    const bounds = await filters.boundingBox();
    expect(search!.width).toBeGreaterThan(bounds!.width * .75);
    for (const select of await filters.getByRole('combobox').all()) {
      const box = await select.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(search!.y + search!.height);
      expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    }
    await filters.screenshot({ path: testInfo.outputPath(`filters-${width}.png`) });
    if (width === 1440) await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: true });
  });
}

test('care-plan templates use distinct coordinated colors with accessible text', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=Care%20plan');
  await expect(page.getByRole('heading', { name: /active plan/i })).toBeVisible();
  const cards = page.locator('article[data-care-tone]');
  const colors = await cards.evaluateAll(elements => elements.map(el => getComputedStyle(el).backgroundColor));
  expect(new Set(colors).size).toBe(4);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('coordinated-care-plan.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [390, 1440]) {
  test(`responsibilities separate filters from results at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?view=Responsibilities');
    const filters = page.getByRole('group', { name: 'Filter Responsibilities', exact: true });
    const heading = page.getByRole('heading', { name: 'Your responsibilities', exact: true });
    await expect(heading).toBeVisible();
    const firstCard = page.locator('.care-responsibilities > [data-care-tone]').first();
    const filterBox = (await filters.boundingBox())!;
    const headingBox = (await heading.boundingBox())!;
    const cardBox = (await firstCard.boundingBox())!;
    expect(headingBox.y - (filterBox.y + filterBox.height)).toBeGreaterThanOrEqual(12);
    expect(cardBox.y).toBeGreaterThan(headingBox.y + headingBox.height);
    expect(await page.locator('.care-responsibilities').evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`responsibilities-${width}.png`), fullPage: true });
  });
}

for (const width of [390, 1440]) {
  test(`handover indicators remain distinct and readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?view=Handover');
    const latest = page.locator('.care-latest');
    await expect(latest.getByRole('heading', { name: 'Latest state' })).toBeVisible();
    for (const title of ['Open risks', 'Due next', 'Verify']) {
      await expect(latest.getByRole('region', { name: title })).toBeVisible();
    }
    const colors = await latest.locator('h3 [data-care-tone]').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor));
    expect(new Set(colors).size).toBe(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await latest.locator('.line-clamp-2').count()).toBe(0);
    const scan = await new AxeBuilder({ page }).include('.care-latest').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(scan.violations).toEqual([]);
    await latest.screenshot({ path: testInfo.outputPath(`handover-indicators-${width}.png`) });
  });
}

for (const width of [320, 390, 1440]) {
  test(`organizer tools share layout and accessible colors at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?view=Care%20Organizer');
    const tools = page.getByRole('group', { name: 'Planning tools', exact: true });
    await expect(page.locator('.care-organizer-panel').first()).toBeVisible();
    for (const name of ['Your week ahead', 'Recurring care', 'Visit preparation', 'My attention', 'I need a break', 'What if?', 'Organize an update', 'I can help', 'Task planning']) {
      await tools.getByRole('button', { name, exact: true }).click();
      await expect(tools.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
      const panels = page.locator('.care-organizer .care-organizer-panel[data-care-tone]');
      expect(await panels.count(), `${name} needs a purpose-colored content panel`).toBeGreaterThan(0);
      if (['Your week ahead', 'Recurring care', 'Visit preparation', 'My attention', 'I need a break', 'I can help'].includes(name)) {
        const tones = await panels.evaluateAll(elements => elements.map(el => el.getAttribute('data-care-tone')));
        expect(new Set(tones).size, `${name} should distinguish adjacent sections`).toBeGreaterThanOrEqual(2);
      }
      const scan = await new AxeBuilder({ page }).include('.care-organizer').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(scan.violations, name).toEqual([]);
      if (['Recurring care', 'I need a break'].includes(name)) await page.screenshot({ path: testInfo.outputPath(name.replaceAll(' ', '-') + '-' + width + '.png'), fullPage: true });
    }
  });
}

test('demo disclosure keeps standard navigation and selected-page treatment', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /good morning/i })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
  const demo = nav.getByRole('button', { name: 'Demo', exact: true });
  await demo.click();
  await expect(demo).toHaveAttribute('aria-expanded', 'true');
  const evaluations = nav.getByRole('button', { name: 'Evaluations', exact: true });
  await evaluations.click();
  await expect(evaluations).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('button', { name: 'Overview', exact: true })).not.toHaveAttribute('aria-current', 'page');
});

test('theme tokens and summary content survive restoration', async ({ page }) => {
  const state = await (await page.request.get('/api/state')).json();
  const base = state.tasks[0];
  state.risks = []; state.approvals = [];
  state.tasks = [
    { ...base, id: 'later', title: 'Later visit', status: 'open', due_at: '2026-10-12T12:00:00Z' },
    { ...base, id: 'done', title: 'Finished visit', status: 'complete', due_at: '2026-10-01T12:00:00Z' },
    { ...base, id: 'first', title: 'First visit', owner: 'Jordan', status: 'open', due_at: '2026-10-11T12:00:00Z' },
  ];
  await page.route('**/api/state*', route => route.fulfill({ json: state }));
  await page.goto('/');
  await expect(page.locator('.care-brief')).toContainText('Next responsibility: First visit.');
  await expect(page.locator('.care-brief')).toContainText('Owner: Jordan');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--care-plum').trim())).toBe('#e6ebe3');
});

test('filter fields contrast with panels and dropdown options use the care palette', async ({ page }, testInfo) => {
  await page.goto('/');
  const filters = page.getByRole('group', { name: 'Filter Care risks', exact: true });
  const status = filters.getByRole('combobox', { name: 'Status', exact: true });
  await expect(status).toBeVisible();
  const panelColor = await filters.evaluate(el => getComputedStyle(el).backgroundColor);
  for (const field of [filters.getByRole('searchbox'), status]) {
    expect(await field.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await field.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(panelColor);
  }
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const wrapper of await filters.locator('.care-filter-select, .care-search-field').all()) {
      const field = (await wrapper.locator('select, input').boundingBox())!;
      const icons = await wrapper.locator('svg').all();
      const leading = (await icons[0].boundingBox())!;
      expect(leading.x + leading.width).toBeLessThan(field.x);
      if (icons.length > 1) {
        const trailing = (await icons[1].boundingBox())!;
        expect(field.x + field.width).toBeLessThan(trailing.x);
      }
    }
  }
  await status.click();
  await page.screenshot({ path: testInfo.outputPath('themed-dropdown-open.png') });
  await page.keyboard.press('Escape');
  await status.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(status).not.toHaveValue('');
  await expect(filters.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  await filters.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(status).toHaveValue('');
  const attention = filters.getByRole('checkbox');
  await attention.check();
  await expect(attention).toBeChecked();
  expect(await attention.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(53, 100, 71)');
  await attention.uncheck();
  await expect(attention).not.toBeChecked();
});
