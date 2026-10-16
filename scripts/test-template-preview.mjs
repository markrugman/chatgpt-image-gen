import { readFileSync } from 'node:fs';
import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const workspace = { formatVersion: 3, organisations: [], projects: [], documents: [], assets: [], images: [], customSizes: [], handoffs: {}, templateFolders: [], templates: [{ id: 'template', name: 'Portrait', recipe: 'A flat vector portrait on a pale blue background.', usageNotes: 'Attach a clear photograph as Subject.', exampleImageId: 'example', organisationId: null, folderId: 'general', tags: ['portrait'], version: 1 }] };
const image = 'data:image/png;base64,' + readFileSync(new URL('./fixtures/template-preview-tall.png', import.meta.url)).toString('base64');
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(engine === chromium ? { channel: 'msedge', headless: true } : { headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
      await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.9.0' } }));
      await page.route('**/api/*', r => { const command = r.request().url().split('/').pop(); return r.fulfill({ json: command === 'get_workspace' ? workspace : command === 'image_data' ? image : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, name: 'Fixture', pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} }); });
      for (const theme of ['light', 'dark']) for (const width of [320, 393, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${url}/#view=templates&org=all`);
        await expect(page.locator('h1')).toHaveText('Templates');
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; localStorage.setItem('imagegen-theme', theme); }, theme);
        for (const mode of ['Edit']) {
          await page.getByRole('button', { name: mode === 'New' ? 'New template' : 'Edit Portrait', exact: true }).first().click();
          const dialog = page.getByRole('dialog', { name: `${mode === 'New' ? 'New' : 'Edit'} template`, exact: true });
          await expect(dialog).toBeVisible();
          const body = dialog.locator('.form-body');
          const metrics = await body.evaluate(el => ({ padding: parseFloat(getComputedStyle(el).paddingLeft), gap: parseFloat(getComputedStyle(el).gap), fits: el.scrollWidth <= el.clientWidth }));
          assert(metrics.padding >= 16 && metrics.gap >= 20 && metrics.fits);
          assert.equal(await dialog.locator('.form-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), width <= 600 ? 1 : 2);
          await expect(dialog.getByRole('button', { name: 'Save template', exact: true })).toBeEnabled({ enabled: mode === 'Edit' });
          if (mode === 'Edit') {
            const example = dialog.getByAltText('Template example');
            await expect(example).toBeVisible();
            await expect.poll(() => example.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
            const bounds = await example.evaluate(img => { const a=img.getBoundingClientRect(), b=img.parentElement.getBoundingClientRect(); return {left:a.left,top:a.top,right:a.right,bottom:a.bottom,container:{left:b.left,top:b.top,right:b.right,bottom:b.bottom}}; });
            assert(bounds.top>=bounds.container.top && bounds.bottom<=bounds.container.bottom+1 && bounds.left>=bounds.container.left && bounds.right<=bounds.container.right+1, 'Example image escaped preview: '+JSON.stringify(bounds));
          }
          await dialog.getByRole('button', { name: 'Save template', exact: true }).scrollIntoViewIfNeeded();
          assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
          await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
          await dialog.evaluate(el => el.scrollTop = 0);
          if ([393, 1440].includes(width)) await dialog.screenshot({ path: `work/template-preview-${engine.name()}-${theme}-${width}.png` });
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          await expect(dialog).toHaveCount(0);
        }
        console.log(`PASS ${engine.name()} ${theme} ${width}px: tall raster contained, field spacing, responsive columns and reachable footer`);
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }

