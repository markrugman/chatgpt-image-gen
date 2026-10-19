import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startResponsiveReview } from './responsive-review.mjs';

const review = await startResponsiveReview();
const output = path.resolve('outputs/transparency-background');
fs.mkdirSync(output, { recursive: true });
const results = [];
try {
  const before = await review.post('get_workspace'), doc = before.documents[0], org = before.organisations[0];
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      for (const theme of ['light', 'dark']) for (const width of [390, 1600]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.addInitScript(theme => localStorage.setItem('imagegen-theme', theme), theme);
        const check = async locator => {
          await expect(locator.first()).toBeVisible();
          for (const element of await locator.all()) {
            const style = await element.evaluate(el => ({ color: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage }));
            assert.equal(style.color, 'rgb(250, 249, 252)', `${name}/${theme}/${width}: checker base`);
            assert(style.image.includes('rgb(239, 236, 244)'), 'Checker squares must retain the pale shared colour');
          }
        };
        await page.goto(`${review.origin}/#view=home&org=all`);
        await expect(page.getByRole('heading', { name: /^Continue designing/ })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await check(page.locator('.document-preview.checker'));
        if (theme === 'dark') {
          // Reproduce the removed responsive override before asserting the fix.
          const regression = await page.addStyleTag({ content: '.responsive-app .document-preview { background-color: var(--page); }' });
          assert.notEqual(await page.locator('.document-preview').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(250, 249, 252)');
          await regression.evaluate(el => el.remove());
          await check(page.locator('.document-preview.checker'));
        }
        await page.screenshot({ path: path.join(output, `${name}-${theme}-${width}-home.png`) });
        await page.goto(`${review.origin}/#view=assets&org=all`);
        await check(page.locator('.asset-preview.checker'));
        await page.goto(`${review.origin}/#view=projects&org=${org.id}&design=${doc.id}`);
        await check(page.locator('.design-canvas.checker'));
        results.push({ browser: name, theme, width, passed: true });
        await page.close();
      }
      console.log(`PASS ${name}: pale checkerboard in both themes, phone/desktop, Home/Assets/canvas`);
    } finally { await browser.close(); }
  }
  assert.deepEqual(await review.post('get_workspace'), before);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, results }, null, 2));
} finally { await review.close(); }
