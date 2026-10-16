import { createServer } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Isolated development-frontend fixture: no real workspace writes or generation.
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bda1f5"/><circle cx="200" cy="100" r="70" fill="#6540b7"/></svg>');
const pageData = { id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
const workspace = {
  formatVersion: 3, organisations: [{ id: 'org', name: 'Creative Studio', color: '#8864d7' }],
  projects: [{ id: 'project', organisationId: 'org', name: 'Project', tags: [] }],
  documents: [{ id: 'doc', projectId: 'project', name: 'Design', width: 1080, height: 1080, unit: 'px', pages: [pageData], tags: [], updatedAt: 1 }],
  assets: ['asset', 'upload'].flatMap(kind => Array.from({ length: 3 }, (_, i) => ({ id: `${kind}${i}`, libraryKind: kind, organisationId: 'org', name: `${kind} ${i}`, tags: ['hidden tag'], versions: [{ id: `${kind}-v${i}`, imageId: 'image' }], currentVersionId: `${kind}-v${i}`, page: { ...pageData, id: `${kind}${i}-page` } }))),
  images: [{ id: 'image', width: 400, height: 200, mime: 'image/svg+xml' }], customSizes: [], handoffs: {}, templateFolders: [],
  templates: Array.from({ length: 3 }, (_, i) => ({ id: `template${i}`, name: `Template ${i}`, recipe: 'Hidden recipe text', usageNotes: 'Hidden usage notes', exampleImageId: 'image', organisationId: 'org', folderId: 'general', tags: ['hidden tag'], version: 1 })),
};
const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort:false } }); await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
try {
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      // A fresh page/context avoids carrying drafts or aborting in-flight preview polls on reload.
      for (const theme of ['light', 'dark']) for (const width of [320, 393, 768, 1440]) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
        await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.9.1' } }));
        await page.route('**/api/*', r => {
          const command = r.request().url().split('/').pop();
          return r.fulfill({ json: command === 'get_workspace' ? workspace : command === 'image_data' ? image : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, name: 'Fixture', pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
        });
        await page.setViewportSize({ width, height: 950 });
        await page.goto(`${origin}/#view=projects&org=org&design=doc&page=page`);
        await expect(page.locator('.editor')).toBeVisible();
        await page.evaluate(theme => { localStorage.setItem('imagegen-theme', theme); document.documentElement.dataset.theme = theme; }, theme);
        if (width <= 1024) await page.getByRole('button', { name: 'Tools', exact: true }).click();
        for (const tab of ['Assets', 'Uploads', 'Templates']) {
          await page.locator('.tool-tabs').getByRole('button', { name: tab, exact: true }).click();
          const drawer = page.locator('.editor-library');
          if (tab === 'Templates') await drawer.getByRole('button', { name: 'Open folder General', exact: true }).click();
          const grid = drawer.locator('.library-image-grid');
          await expect(grid.locator('.library-image')).toHaveCount(3);
          assert.equal(await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2);
          assert(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth), `${name} ${width} ${tab} drawer overflow`);
          await expect(grid).not.toContainText('Hidden');
          for (const index of [0, 1, 2]) {
            const trigger = grid.locator('.library-image-trigger').nth(index);
            await trigger.click();
            const menu = drawer.getByRole('menu');
            await expect(menu).toBeVisible();
            await expect(menu.getByRole('menuitem')).toHaveText(tab === 'Templates' ? ['Use Template', 'Use and Attach as Style'] : ['Add as…', 'Place']);
            const bounds = await menu.boundingBox(), container = await drawer.boundingBox();
            assert(bounds.x >= container.x && bounds.x + bounds.width <= container.x + container.width, `${tab} popup clipped`);
            await page.keyboard.press('End');
            await expect(menu.getByRole('menuitem').last()).toBeFocused();
            await page.keyboard.press('Escape');
            await expect(menu).toHaveCount(0);
            await expect(trigger).toBeFocused();
          }
          if (tab !== 'Templates') {
            await grid.locator('.library-image-trigger').first().click();
            await page.getByRole('menuitem', { name: 'Add as…', exact: true }).click();
            await expect(drawer.getByRole('menuitem')).toHaveText(['Back', 'Style', 'Subject', 'Logo', 'Other']);
            await page.keyboard.press('Escape');
            await expect(drawer.getByRole('menuitem', { name: 'Add as…', exact: true })).toBeFocused();
            await page.keyboard.press('Escape');
          }
          if (name === 'Edge' && theme === 'dark' && [393, 1440].includes(width)) await drawer.screenshot({ path: `work/drawer-${tab.toLowerCase()}-${width}.png` });
        }
        const templateTrigger = page.locator('.editor-library').getByRole('button', { name: 'Use Template 0', exact: true });
        await templateTrigger.click();
        await page.getByRole('menuitem', { name: 'Use Template', exact: true }).click();
        await expect(page.locator('.selected-template > strong')).toHaveText('Template 0');
        await expect(page.locator('.reference-chips')).toHaveCount(0);
        for (let repeat = 0; repeat < 2; repeat++) {
          if (width <= 1024) await page.getByRole('button', { name: 'Tools', exact: true }).click();
          await templateTrigger.click();
          await page.getByRole('menuitem', { name: 'Use and Attach as Style', exact: true }).click();
          await expect(page.locator('.reference-chips > span')).toHaveAttribute('data-purpose', 'Style');
          await expect(page.locator('.reference-chips > span')).toHaveCount(1);
          if (width <= 1024) await expect(page.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute('aria-pressed', 'true');
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        await page.close();
        console.log(`PASS ${name} ${theme} ${width}px: three two-column drawers, image/title cards, popup bounds and keyboard controls`);
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
