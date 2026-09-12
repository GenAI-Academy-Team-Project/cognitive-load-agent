import { chromium } from '../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = 'docs/pitch-deck';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + path.resolve(root, 'carestead-pitch-v1.html'));
  const count = await page.locator('.slide').count();
  assert.equal(count, 12);
  const results = [];
  fs.mkdirSync(`${root}/assets/v1`, { recursive: true });
  for (let i = 0; i < count; i++) {
    if (i) await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#count').textContent(), `${i + 1} / ${count}`);
    const result = await page.locator('.slide.active').evaluate(el => {
      const rect = el.getBoundingClientRect();
      const footer = el.querySelector('footer').getBoundingClientRect();
      const footerTextTop = el.querySelector('footer span').getBoundingClientRect().top;
      return {
        slide: el.getAttribute('aria-label'),
        overflow: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
        footerInside: footer.bottom <= rect.bottom,
        images: [...el.querySelectorAll('img')].every(x => x.complete && x.naturalWidth > 0),
        clippedText: [...el.querySelectorAll('h1,h2,h3,p,td,.caption')].filter(x => {
          if (x.closest('.note') || x.classList.contains('sr-only')) return false;
          const r = x.getBoundingClientRect();
          return r.bottom > footerTextTop - 4 || r.right > rect.right || r.left < rect.left;
        }).map(x => x.textContent),
      };
    });
    results.push(result);
    await page.screenshot({ path: `${root}/assets/v1/slide-${i + 1}.png` });
    assert.ok(!result.overflow && result.footerInside && result.images && result.clippedText.length === 0, JSON.stringify(result));
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    assert.ok(await page.locator('dialog').isVisible());
    assert.ok((await page.locator('#noteText').textContent()).length > 20);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.evaluate(() => document.activeElement?.blur());
  }
  assert.ok(await page.locator('#next').isDisabled());
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#count').textContent(), '1 / 12');
  await page.keyboard.press('End');
  assert.equal(await page.locator('#count').textContent(), '12 / 12');
  await page.pdf({ path: `${root}/carestead-pitch-v1.pdf`, printBackground: true, preferCSSPageSize: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${root}/assets/v1/mobile-preview.png` });
  assert.ok(await page.locator('#next').isVisible());
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${root}/verification-v1.json`, JSON.stringify({ slides: results, navigation: true, notes: true, pageErrors: errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
