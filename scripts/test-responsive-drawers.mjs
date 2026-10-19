import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startResponsiveReview } from './responsive-review.mjs';

const review = await startResponsiveReview();
const output = path.resolve('outputs/responsive-review/drawer-fixes');
fs.mkdirSync(output, { recursive: true });
const results = [];
try {
  const before = await review.post('get_workspace'), doc = before.documents[0], org = before.organisations[0];
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      for (const width of [320, 390, 820, 1600]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 768 });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/api/get_jobs', route => route.fulfill({ json: [{ id: 'ready-review', target: { kind: 'document', id: doc.id, pageId: doc.pages[0].id }, status: 'completed', message: 'Ready', createdAt: Date.now(), cancelRequested: false }] }));
        await page.goto(`${review.origin}/#view=projects&org=${org.id}&design=${doc.id}`);
        const tools = page.locator('.editor-tools'), dock = page.locator('.mobile-editor-views'), rail = page.locator('.editor-rail');
        const closeDrawer = async () => {
          await tools.getByRole('button', { name: 'Close tools', exact: true }).click();
          await expect(tools).not.toBeVisible();
        };
        const openTools = async () => {
          if (width < 768) await dock.getByRole('button', { name: 'Tools', exact: true }).click();
          else await rail.getByRole('button', { name: 'Assets', exact: true }).click();
          await expect(tools).toBeVisible();
        };
        await openTools();
        const search = tools.getByRole('textbox', { name: 'Search assets' });
        await search.fill('Citrus');
        if (width < 1280) {
          await expect(tools.getByRole('group', { name: 'Choose a tool' }).getByRole('button', { name: 'Pages', exact: true })).toHaveCount(0);
          await closeDrawer();
          await (width < 768 ? dock : rail).getByRole('button', { name: 'Pages', exact: true }).click();
          await expect(tools).toHaveAttribute('aria-label', 'Pages panel');
          await expect(tools.getByRole('heading', { name: 'Pages', exact: true })).toBeVisible();
          await expect(tools.getByRole('group', { name: 'Choose a tool' })).toHaveCount(0);
          await expect(search).not.toBeVisible();
          await expect(tools.locator('.page-tile')).toHaveCount(2);
          await page.screenshot({ path: path.join(output, `${name}-${width}-pages.png`) });
          await closeDrawer(); await openTools();
          await expect(search).toHaveValue('Citrus');
          await expect(tools.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
        }
        if (width < 768) {
          await expect(dock.locator('.job-badge')).toHaveAttribute('aria-label', 'Ready');
          const badge = await dock.locator('.job-badge').boundingBox(), nav = await dock.boundingBox();
          assert(badge.y >= nav.y && badge.y + badge.height <= nav.y + nav.height, 'Ready must stay inside the dock');
          const handle = tools.locator('.sheet-handle');
          const handleBox = await handle.boundingBox();
          await page.touchscreen.tap(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
          await expect(handle).toHaveAttribute('aria-expanded', 'true');
          await handle.press('Enter'); await expect(handle).toHaveAttribute('aria-expanded', 'false');
          const drag = async delta => {
            const box = await handle.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + delta, { steps: 8 }); await page.mouse.up();
          };
          await drag(-60); await expect(handle).toHaveAttribute('aria-expanded', 'true');
          await drag(60); await expect(handle).toHaveAttribute('aria-expanded', 'false');
          await page.screenshot({ path: path.join(output, `${name}-${width}-tools.png`) });
          await drag(60); await expect(tools).not.toBeVisible();
          await dock.getByRole('button', { name: 'Chat', exact: true }).click();
          const chat = page.locator('.chat-panel');
          await chat.locator('.sheet-handle').click();
          await expect(chat.locator('.sheet-handle')).toHaveAttribute('aria-expanded', 'true');
          await page.getByRole('button', { name: 'Close Chat', exact: true }).click();
        } else await closeDrawer();
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        const head = page.locator('.export-panel > .modal-head');
        const title = await head.getByRole('heading').boundingBox(), close = await head.getByRole('button', { name: 'Close dialog' }).boundingBox();
        assert(Math.abs(title.y + title.height / 2 - close.y - close.height / 2) <= 1, 'Export heading must share Close vertical centre');
        const preview = page.getByRole('img', { name: 'Export preview', exact: true });
        await expect(preview).toBeVisible();
        await expect.poll(() => preview.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
        await page.screenshot({ path: path.join(output, `${name}-${width}-export.png`) });
        assert.deepEqual(errors, []);
        results.push({ browser: name, width, passed: true });
        await page.close();
      }
      console.log(`PASS ${name}: separate Pages/Tools, retained search, contained Ready, handle tap/keyboard/drag, centred export heading`);
    } finally { await browser.close(); }
  }
  assert.deepEqual(await review.post('get_workspace'), before);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, results }, null, 2));
} finally { await review.close(); }
