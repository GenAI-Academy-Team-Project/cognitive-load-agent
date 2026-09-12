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
  const vectorResults = [];
  const vectorPage = await browser.newPage();
  for (const file of ['maya-persona.svg', 'carestead-technical-architecture-v1.svg', 'carestead-decision-path-v1.svg']) {
    await vectorPage.setContent(fs.readFileSync(`${root}/assets/${file}`, 'utf8'));
    await vectorPage.evaluate(() => document.fonts.ready);
    const overflow = await vectorPage.locator('svg').evaluate(svg => [...svg.querySelectorAll('text')].flatMap(text => {
      const shape = [...text.parentElement.children].find(x => ['rect', 'path'].includes(x.tagName));
      if (!shape) return [];
      const box = text.getBBox(), bounds = shape.getBBox();
      return box.x < bounds.x + 6 || box.x + box.width > bounds.x + bounds.width - 6 || box.y < bounds.y + 6 || box.y + box.height > bounds.y + bounds.height - 6 ? [text.textContent] : [];
    }));
    vectorResults.push({ file, overflow });
    assert.deepEqual(overflow, [], `Text exceeds its SVG card in ${file}: ${overflow.join(', ')}`);
  }
  await vectorPage.close();
  fs.mkdirSync(`${root}/assets/v1`, { recursive: true });
  for (let i = 0; i < count; i++) {
    if (i) await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#count').textContent(), `${i + 1} / ${count}`);
    const result = await page.locator('.slide.active').evaluate(el => {
      const rect = el.getBoundingClientRect();
      const footer = el.querySelector('footer').getBoundingClientRect();
      const footerTextTop = el.querySelector('footer span').getBoundingClientRect().top;
      const overlaps = [];
      for (const parent of [el, ...el.querySelectorAll('.grid,.rows,.copy,.thread,.feature-grid,.control-owners')]) {
        const children = [...parent.children].filter(x => !x.matches('.note,.sr-only') && getComputedStyle(x).display !== 'none');
        for (let i=0;i<children.length;i++) for (let j=i+1;j<children.length;j++) {
          const a=children[i].getBoundingClientRect(), b=children[j].getBoundingClientRect();
          if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2) overlaps.push([children[i].className || children[i].tagName,children[j].className || children[j].tagName]);
        }
      }
      const internalTextOverflow = [];
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const node=walker.currentNode, parent=node.parentElement;
        if(!node.textContent.trim() || parent.closest('.note,.sr-only'))continue;
        const range=document.createRange();range.selectNodeContents(node);
        const container=parent.closest('.panel,.row,.persona,.feature-grid article,.control-owners article,td,.strip');
        if(!container)continue;
        const b=container.getBoundingClientRect();
        for(const r of range.getClientRects())if(r.left<b.left-1 || r.right>b.right+1 || r.bottom>b.bottom+3) internalTextOverflow.push(node.textContent.trim());
      }
      return {
        slide: el.getAttribute('aria-label'),
        overlaps, internalTextOverflow,
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
    assert.ok(!result.overflow && result.footerInside && result.images && result.clippedText.length === 0 && result.overlaps.length === 0 && result.internalTextOverflow.length === 0, JSON.stringify(result));
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
  for (const viewport of [{width:1280,height:720},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.press('Home');
    for(let i=0;i<count;i++) {
      if(i)await page.keyboard.press('ArrowRight');
      const fits=await page.locator('.slide.active').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=-1 && r.right<=innerWidth+1 && r.top>=-1 && r.bottom<=innerHeight-50;});
      assert.ok(fits, `Slide ${i+1} exceeds viewport ${viewport.width}x${viewport.height}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${root}/assets/v1/mobile-preview.png` });
  assert.ok(await page.locator('#next').isVisible());
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${root}/verification-v1.json`, JSON.stringify({ slides: results, vectors: vectorResults, navigation: true, notes: true, pageErrors: errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
