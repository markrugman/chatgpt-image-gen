import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startResponsiveReview } from './responsive-review.mjs';

const review = await startResponsiveReview();
const output = path.resolve('outputs/responsive-review/library-context');
fs.mkdirSync(output, { recursive: true });
const results = [];
try {
  const initial = await review.post('get_workspace'), org = initial.organisations[0], doc = initial.documents[0];
  const asset = initial.assets.find(a => a.libraryKind !== 'upload');
  const source = initial.images.find(i => i.id === asset.versions.find(v => v.id === asset.currentVersionId).imageId);
  const data = await review.post('image_data', { imageId: source.id });
  await review.post('import_asset_data', { name: 'Context upload', organisationId: org.id, data: data.split(',')[1], replaceId: null });
  const before = await review.post('get_workspace');
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      for (const width of [390, 1600]) for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: true });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(theme => localStorage.setItem('imagegen-theme', theme), theme);
        await page.goto(`${review.origin}/#view=projects&org=${org.id}&design=${doc.id}`);
        const tools = page.locator('.editor-tools'), dock = page.locator('.mobile-editor-views');
        const open = async label => {
          if (width < 768) { await dock.getByRole('button', { name: 'Tools', exact: true }).tap(); await tools.getByRole('button', { name: label, exact: true }).tap(); }
          else if (!(await tools.isVisible()) || !(await tools.getByRole('heading', { name: label, exact: true }).count())) await page.locator('.editor-rail').getByRole('button', { name: label, exact: true }).click();
        };
        const undo = async () => {
          if (width < 768) await dock.getByRole('button', { name: 'Canvas', exact: true }).tap();
          await page.getByTitle('Undo layout or image change').click();
          await expect(page.locator('.canvas-overlay')).toHaveCount(0);
        };
        for (const [label, item] of [['Assets', asset.name], ['Uploads', 'Context upload']]) {
          await open(label);
          const tile = tools.getByRole('button', { name: `Use ${item}`, exact: true });
          await expect(page.locator('.library-quick-actions')).toHaveCount(0);
          await tile.click(); await expect(page.locator('.canvas-overlay')).toHaveCount(1);
          await expect(page.locator('.library-image-menu')).toHaveCount(0); await undo();
          await open(label); await tile.click({ button: 'right' });
          await expect(tools.getByRole('menu')).toBeVisible();
          await expect(page.locator('.canvas-overlay')).toHaveCount(0);
          await page.keyboard.press('Escape'); await tile.press('Shift+F10');
          await expect(tools.getByRole('menu')).toBeVisible(); await page.keyboard.press('Escape');
          await tile.tap(); await expect(page.locator('.canvas-overlay')).toHaveCount(1);
          await expect(page.locator('.library-image-menu')).toHaveCount(0); await undo();
          await open(label);
          const box = await tile.boundingBox(), point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          if (name === 'Edge') {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
            await expect(tools.getByRole('menu')).toBeVisible();
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await cdp.detach();
          } else {
            await tile.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: point.x, clientY: point.y });
            await expect(tools.getByRole('menu')).toBeVisible();
            await tile.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0 });
            await tile.dispatchEvent('click', { detail: 1 });
          }
          await expect(page.locator('.canvas-overlay')).toHaveCount(0);
          await tools.getByRole('menuitem', { name: 'Add as…', exact: true }).tap();
          await tools.getByRole('menuitem', { name: 'Subject', exact: true }).tap();
          await expect(page.locator('.chat-panel .reference-chips')).toContainText(item);
          if (width < 768) await dock.getByRole('button', { name: 'Canvas', exact: true }).tap();
          await open(label);
          // Scrolling, cancellation and a second finger must cancel a pending hold.
          for (const kind of ['move', 'cancel', 'second']) {
            await tile.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0, clientX: point.x, clientY: point.y });
            if (kind === 'move') await tile.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 1, clientX: point.x, clientY: point.y + 30 });
            else if (kind === 'cancel') await tile.dispatchEvent('pointercancel', { pointerType: 'touch', pointerId: 1 });
            else await page.locator('body').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 2, isPrimary: false });
            await page.waitForTimeout(550);
            await tile.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1 });
            await tile.dispatchEvent('click', { detail: 1 });
            await expect(tools.getByRole('menu')).toHaveCount(0);
            await expect(page.locator('.canvas-overlay')).toHaveCount(0);
          }
        }
        await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}.png`) });
        assert.deepEqual(errors, []); results.push({ browser: name, width, theme, passed: true });
        await page.close();
      }
      console.log(`PASS ${name}: Assets/Uploads click/tap Place, right-click/hold menus, reference roles, cancelled gestures, no inline actions`);
    } finally { await browser.close(); }
  }
  const after = await review.post('get_workspace');
  assert.deepEqual(after.images, before.images); assert.deepEqual(after.assets, before.assets);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, results, touch: 'Trusted Edge touch streams; synthetic WebKit holds and real taps' }, null, 2));
} finally { await review.close(); }
