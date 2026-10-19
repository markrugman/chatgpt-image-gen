import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startResponsiveReview } from './responsive-review.mjs';

const review = await startResponsiveReview();
const output = path.resolve('outputs/responsive-review/drawer-switching');
fs.mkdirSync(output, { recursive: true });
const results = [];
try {
  const before = await review.post('get_workspace'), doc = before.documents[0], org = before.organisations[0];
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      for (const [width, height] of [[320,740], [390,844], [390,480], [820,1180]]) {
        const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(`${review.origin}/#view=projects&org=${org.id}&design=${doc.id}`);
        await expect(page.locator('.design-canvas')).toBeVisible();
        const baseHistory = await page.evaluate(() => history.length);
        const nav = page.locator(width < 768 ? '.mobile-editor-views' : '.editor-rail');
        const tools = page.locator('.editor-tools'), chat = page.locator('.chat-panel');
        const select = async label => {
          const button = nav.getByRole('button', { name: label, exact: true });
          assert(await button.evaluate(el => !el.closest('[inert]')), 'Drawer navigation must remain interactive');
          await button.tap();
        };
        await select(width < 768 ? 'Tools' : 'Assets');
        await tools.getByRole('textbox', { name: 'Search assets' }).fill('Citrus');
        const sheetEntry = await page.evaluate(() => history.state.imagegenSheet);
        assert(sheetEntry);
        for (let turn = 0; turn < 2; turn++) {
          await select('Pages');
          await expect(tools).toHaveAttribute('aria-label', 'Pages panel');
          await expect(tools.locator('.page-tile')).toHaveCount(2);
          await select('Chat');
          await expect(chat).toBeVisible(); await expect(tools).not.toBeVisible();
          const prompt = page.getByRole('textbox', { name: 'Design prompt' });
          if (!turn) await prompt.fill('Keep this drawer draft.');
          else await expect(prompt).toHaveValue('Keep this drawer draft.');
          await select(width < 768 ? 'Tools' : 'Assets');
          await expect(tools).toBeVisible(); await expect(chat).not.toBeVisible();
          await expect(tools.getByRole('textbox', { name: 'Search assets' })).toHaveValue('Citrus');
          assert.equal(await page.evaluate(() => history.state.imagegenSheet), sheetEntry, 'Switches share a single Back entry');
          assert.equal(await page.evaluate(() => history.length), baseHistory + 1);
        }
        assert(await page.locator('.canvas-workspace').evaluate(el => !!el.closest('[inert]')), 'Canvas remains inactive behind a drawer');
        await page.keyboard.press('Shift+Tab');
        assert(await page.evaluate(() => !!document.activeElement.closest('.editor-tools, .editor-rail, .mobile-editor-views')), 'Keyboard focus stays in drawer/navigation');
        if (width < 768) {
          await select('Canvas'); await expect(tools).not.toBeVisible();
          await expect.poll(() => page.evaluate(() => history.state?.imagegenSheet || null)).toBe(null);
          assert(await page.locator('.canvas-workspace').evaluate(el => !el.closest('[inert]')));
          await select('Chat'); await expect(chat).toBeVisible();
        }
        await page.goBack();
        await expect(tools).not.toBeVisible(); await expect(chat).not.toBeVisible();
        await expect(page.locator('.design-canvas')).toBeVisible();
        await select(width < 768 ? 'Tools' : 'Assets'); await select('Chat');
        await page.keyboard.press('Escape'); await expect(chat).not.toBeVisible();
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        await expect(page.locator('.export-panel')).toBeVisible();
        assert(await nav.locator('button').first().evaluate(el => {
          const r = el.getBoundingClientRect();
          return !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), 'Export remains a blocking modal');
        await page.getByRole('button', { name: 'Close dialog' }).click();
        assert.deepEqual(errors, []);
        results.push({ browser: name, width, height, passed: true });
        await page.close();
      }
      console.log(`PASS ${name}: direct touch switching, draft/filter persistence, one Back entry, Canvas/Escape, keyboard and export isolation`);
    } finally { await browser.close(); }
  }
  assert.deepEqual(await review.post('get_workspace'), before);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, results }, null, 2));
} finally { await review.close(); }
