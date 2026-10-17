import { createServer, preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Isolated development frontend and simulated import API. Never contacts a workspace server.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=', 'base64');
const pageData = { id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
const fixture = {
  formatVersion: 3,
  organisations: [{ id: 'org', name: 'Personal', color: '#8864d7' }, { id: 'other', name: 'The Courtyard', color: '#7654cf' }],
  projects: [{ id: 'project', organisationId: 'org', name: 'Test project', tags: [] }],
  documents: [{ id: 'doc', projectId: 'project', name: 'Test design', width: 210, height: 297, unit: 'mm', pages: [pageData], tags: [], updatedAt: 1 }],
  assets: [], images: [], customSizes: [], handoffs: {}, templates: [], templateFolders: [],
};
const file = (name = 'portrait.png') => ({ name, mimeType: 'image/png', buffer: png });
const server = process.env.IMAGEGEN_TEST_BUILT ? await preview({ preview: { host: '127.0.0.1', port: 0 } }) : await createServer({ server: { host: '127.0.0.1', port: 0 } });
if (!process.env.IMAGEGEN_TEST_BUILT) await server.listen();
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
try {
  for (const [engineName, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      for (const width of [393, 1440]) for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const w = structuredClone(fixture), imports = [], errors = [];
        let gate = null;
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
        await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.9.5' } }));
        await page.route('**/api/*', async r => {
          const command = r.request().url().split('/').pop();
          assert.notEqual(command, 'mutate', 'Uploads must not modify the design or attach/place images');
          if (command === 'import_asset_data') {
            const body = r.request().postDataJSON(); imports.push(body);
            if (gate) await gate;
            if (body.name === 'broken') return r.fulfill({ status: 400, json: { error: 'The image could not be decoded' } });
            if (!Buffer.from(body.data, 'base64').equals(png)) return r.fulfill({ status: 400, json: { error: 'Choose a PNG, JPEG, or WebP image' } });
            assert(w.organisations.some(o => !o.deletedAt && o.id === body.organisationId), 'Explicit active organisation required');
            assert.equal(body.replaceId, null, 'Repeat uploads must not replace existing images');
            const id = `import-${imports.length}`;
            w.images.push({ id, width: 1, height: 1, mime: 'image/png' });
            w.assets.push({ id, name: body.name, organisationId: body.organisationId, libraryKind: 'upload', tags: [], currentVersionId: id + '-version', versions: [{ id: id + '-version', imageId: id }], page: { ...structuredClone(pageData), id: id + '-page' } });
            return r.fulfill({ json: id });
          }
          return r.fulfill({ json: command === 'get_workspace' ? w : command === 'get_jobs' ? [] : command === 'image_data' ? 'data:image/png;base64,' + png.toString('base64') : command === 'server_status' ? { connected: true, online: true, pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
        });
        const goto = async hash => {
          await page.goto(origin + '/#' + hash);
          await expect(page.locator('.loading-state')).toHaveCount(0);
          await page.evaluate(theme => { localStorage.setItem('imagegen-theme', theme); document.documentElement.dataset.theme = theme; }, theme);
        };
        const done = async text => {
          await expect(page.locator('.upload-feedback [role="status"]')).toContainText(text);
          await expect(page.locator('.upload-feedback .spin')).toHaveCount(0);
        };
        const picker = async (button, files) => {
          const chooser = page.waitForEvent('filechooser'); await button.click();
          const dialog = await chooser; assert(dialog.isMultiple()); await dialog.setFiles(files);
        };
        const drop = async (target, files, inspect = false) => {
          const transfer = await page.evaluateHandle(files => {
            const data = new DataTransfer();
            for (const f of files) data.items.add(new File([Uint8Array.from(atob(f.data), c => c.charCodeAt(0))], f.name, { type: f.type }));
            return data;
          }, files.map(f => ({ name: f.name, type: f.mimeType, data: f.buffer.toString('base64') })));
          await target.dispatchEvent('dragenter', { dataTransfer: transfer });
          if (inspect) {
            await expect(target).toHaveClass(/upload-dragging/);
            await expect(target.locator('.upload-drop-hint')).toBeVisible();
            // Child enter/leave must not clear the enclosing drop highlight.
            const child = target.locator('button').first();
            await child.dispatchEvent('dragenter', { dataTransfer: transfer });
            await child.dispatchEvent('dragleave', { dataTransfer: transfer });
            await expect(target).toHaveClass(/upload-dragging/);
          }
          await target.dispatchEvent('drop', { dataTransfer: transfer });
          await expect(target).not.toHaveClass(/upload-dragging/);
          await transfer.dispose();
        };
        const openDrawer = async () => {
          if (width <= 1024) await page.getByRole('button', { name: 'Tools', exact: true }).click();
          await page.locator('.tool-tabs').getByRole('button', { name: 'Uploads', exact: true }).click();
          return page.locator('.editor-library');
        };

        await goto('view=uploads&org=org&library=shared');
        await picker(page.getByRole('button', { name: 'Upload image', exact: true }), [file(), file('second.png')]);
        await done('2 of 2 images uploaded to Personal');
        await expect(page.locator('.filter-tabs .active')).toHaveText('Personal');
        await expect(page.locator('.asset-card')).toHaveCount(2);
        assert(imports.every(i => i.organisationId === 'org'));
        await drop(page.locator('main'), [file(), file('broken.png'), file('last.png'), { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') }], true);
        await done('2 of 4 images uploaded to Personal');
        await expect(page.locator('.upload-feedback')).toContainText('broken.png: The image could not be decoded');
        await expect(page.locator('.upload-feedback')).toContainText('notes.txt: Choose a PNG, JPEG, or WebP image');
        assert.equal(w.assets.filter(a => a.name === 'portrait').length, 2);
        const beforeOversize = imports.length;
        await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload image', exact: true }).click()]);
        await page.locator('input[aria-label="Upload images"]').evaluate(input => {
          const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(50_000_001)], 'huge.png', { type: 'image/png' }));
          input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await done('0 of 1 images uploaded to Personal');
        await expect(page.locator('.upload-feedback')).toContainText('huge.png: Choose an image smaller than 50 MB');
        assert.equal(imports.length, beforeOversize);

        await goto('view=uploads');
        const beforeCancel = imports.length;
        await drop(page.locator('main'), [file('cancelled.png')]);
        const destination = page.getByRole('dialog', { name: 'Choose upload organisation' });
        await expect(destination).toBeVisible();
        await expect(destination.getByRole('button', { name: 'Upload images', exact: true })).toBeDisabled();
        assert(await destination.evaluate(el => el.scrollWidth <= el.clientWidth));
        await page.screenshot({ path: `work/uploads-destination-${engineName}-${width}-${theme}.png` });
        await destination.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(imports.length, beforeCancel);
        await picker(page.getByRole('button', { name: 'Upload image', exact: true }), [file('chosen.png')]);
        await destination.getByRole('combobox').selectOption('other');
        await destination.getByRole('button', { name: 'Upload images', exact: true }).click();
        await done('1 of 1 images uploaded to The Courtyard');
        assert.equal(imports.at(-1).organisationId, 'other');

        // Upload destination survives changing organisation during a delayed batch.
        await goto('view=uploads&org=org');
        let release; gate = new Promise(resolve => { release = resolve; });
        const beforeDelayed = imports.length;
        await drop(page.locator('main'), [file('slow-one.png'), file('slow-two.png')]);
        await expect(page.locator('.upload-feedback')).toContainText('Uploading 1 of 2 to Personal');
        await expect.poll(() => imports.length).toBe(beforeDelayed + 1);
        await drop(page.locator('main'), [file('busy-drop.png')]);
        assert.equal(imports.length, beforeDelayed + 1, 'A second drop cannot start a concurrent batch');
        await page.getByRole('combobox', { name: 'Current organisation', exact: true }).selectOption('other');
        release(); gate = null;
        await done('2 of 2 images uploaded to Personal');
        assert(imports.slice(beforeDelayed).every(i => i.organisationId === 'org'));
        await expect(page.getByRole('combobox', { name: 'Current organisation', exact: true })).toHaveValue('other');

        await goto('view=projects&org=org&design=doc&page=page');
        let drawer = await openDrawer();
        await expect(drawer.locator('.library-image-grid > *').first()).toHaveAttribute('aria-label', 'Upload images');
        const editorUrl = page.url();
        await drawer.getByRole('button', { name: 'Shared', exact: true }).click();
        await picker(drawer.getByRole('button', { name: 'Upload images', exact: true }), [file('drawer-one.png'), file('drawer-two.png')]);
        await done('2 of 2 images uploaded to Personal');
        assert.equal(page.url(), editorUrl);
        await expect(drawer.locator('.filter-tabs .active')).toHaveText('Organisation');
        await expect(drawer.getByRole('button', { name: 'Use drawer-one', exact: true })).toBeVisible();
        await drop(drawer, [file('drawer-drop.png')], true); await done('1 of 1 images uploaded to Personal');
        assert.equal(page.url(), editorUrl);
        assert.deepEqual(w.documents, fixture.documents);
        assert.equal(await drawer.locator('.library-image-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2);
        assert(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth));
        await page.screenshot({ path: `work/uploads-drawer-${engineName}-${width}-${theme}.png` });

        await goto('view=projects&design=doc&page=page');
        drawer = await openDrawer();
        await drop(drawer, [file('different-owner.png')]);
        await destination.getByRole('combobox').selectOption('other');
        await destination.getByRole('button', { name: 'Upload images', exact: true }).click();
        await done('1 of 1 images uploaded to The Courtyard');
        await expect(drawer.getByRole('button', { name: 'Use different-owner', exact: true })).toBeVisible();
        await expect(page.locator('.canvas-workspace')).toBeAttached();
        assert.equal(imports.at(-1).organisationId, 'other');
        await page.reload(); await expect(page.locator('.editor')).toBeVisible(); drawer = await openDrawer();
        // Picker-only upload controls are intentionally absent from Assets and /upload selection dialogs.
        await page.locator('.tool-tabs').getByRole('button', { name: 'Assets', exact: true }).click();
        await expect(page.locator('.editor-library').getByRole('button', { name: 'Upload images', exact: true })).toHaveCount(0);
        if (width === 1440 && theme === 'light') {
          w.organisations = [];
          await goto('view=uploads');
          await page.reload(); await expect(page.locator('.loading-state')).toHaveCount(0);
          await picker(page.getByRole('button', { name: 'Upload image', exact: true }), [file('no-destination.png')]);
          await expect(destination).toContainText('Create an organisation before uploading images.');
          await expect(destination.getByRole('button', { name: 'Upload images', exact: true })).toBeDisabled();
          await page.keyboard.press('Escape'); await expect(destination).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Upload image', exact: true })).toBeEnabled();
        }
        assert.deepEqual(errors, []);
        await page.close();
        console.log(`PASS ${engineName} ${width} ${theme}: picker/drop, batch failures/duplicates/size, chooser/cancel, fixed destination, drawer context and layout`);
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
