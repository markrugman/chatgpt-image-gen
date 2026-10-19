import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Compiled UI with an isolated in-memory API; never connects to the real workspace.
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bda1f5"/></svg>');
const tallImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="2000"><rect width="100" height="2000" fill="#bda1f5"/></svg>');
const blank = () => ({ id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 });
const fixture = (width, height) => ({
  formatVersion: 3, organisations: [{ id: 'org', name: 'Studio', color: '#8864d7' }],
  projects: [{ id: 'project', organisationId: 'org', name: 'Project', tags: [] }],
  documents: [{ id: 'doc', projectId: 'project', name: 'Design', width, height, unit: 'px', pages: [blank()], tags: [], updatedAt: 1 }],
  assets: ['asset', 'upload', 'tall'].map(kind => ({ id: kind, libraryKind: kind === 'upload' ? 'upload' : 'asset', organisationId: 'org', name: kind, tags: [], versions: [{ id: kind + '-v', imageId: kind === 'tall' ? 'tall-image' : 'image' }], currentVersionId: kind + '-v', page: blank() })),
  images: [{ id: 'image', width: 400, height: 200, mime: 'image/svg+xml' }, { id: 'tall-image', width: 100, height: 2000, mime: 'image/svg+xml' }],
  customSizes: [], handoffs: {}, templateFolders: [], templates: [],
});
const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
try {
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    if (process.env.DRAG_ENGINE && process.env.DRAG_ENGINE !== name) continue;
    const browser = await engine.launch({ ...options, headless: true });
    try {
      for (const [dw, dh, theme] of [[1000, 800, 'light'], [800, 1000, 'dark']]) {
        const w = fixture(dw, dh), p = w.documents[0].pages[0], writes = [], errors = [];
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, hasTouch: true });
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
        await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.9.6' } }));
        await page.route('**/api/*', r => {
          const command = r.request().url().split('/').pop();
          if (command === 'mutate') {
            const { action } = r.request().postDataJSON();
            writes.push(action.op);
            if (action.op === 'overlays') {
              p.history.splice(p.historyIndex + 1);
              p.history.push({ ...p.history[p.historyIndex], overlays: action.overlays }); p.historyIndex++;
            } else if (action.op === 'history') p.historyIndex += action.direction === 'undo' ? -1 : 1;
            else throw Error('Unexpected mutation: ' + action.op);
          }
          return r.fulfill({ json: command === 'get_workspace' ? w : command === 'image_data' ? (r.request().postDataJSON().imageId === 'tall-image' ? tallImage : image) : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, name: 'Fixture', pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
        });
        await page.goto(origin + '/#view=projects&org=org&design=doc&page=page');
        await page.evaluate(theme => { localStorage.setItem('imagegen-theme', theme); document.documentElement.dataset.theme = theme; }, theme);
        const canvas = page.locator('.design-canvas'), surface = page.locator('.canvas-scroll');
        const source = kind => page.locator('.editor-library:visible').getByRole('button', { name: 'Use ' + kind, exact: true });
        const tab = async label => page.locator('.tool-tabs').getByRole('button', { name: label, exact: true }).click();
        const last = () => p.history[p.historyIndex].overlays.at(-1);
        const drag = async (kind, x, y) => {
          await surface.press('Escape');
          const rect = await canvas.boundingBox(), box = await surface.boundingBox();
          const cx = rect.x + rect.width * x / 100, cy = rect.y + rect.height * y / 100;
          assert(cx > box.x && cx < box.x + box.width && cy > box.y && cy < box.y + box.height, 'Drop must be in visible workspace');
          const before = writes.length;
          await source(kind).dragTo(surface, { targetPosition: { x: cx - box.x, y: cy - box.y } });
          await expect.poll(() => writes.length).toBe(before + 1);
          await expect(page.locator('.canvas-overlay.selected')).toHaveCount(1);
          assert.equal(writes.at(-1), 'overlays');
          assert.equal(last().assetVersionId, kind + '-v');
        };
        for (const [label, kind] of [['Assets', 'asset'], ['Uploads', 'upload']]) {
          await tab(label);
          const before = writes.length, history = p.historyIndex;
          await source(kind).click();
          await expect.poll(() => writes.length).toBe(before + 1);
          await expect(page.locator('.library-image-menu')).toHaveCount(0);
          assert.equal(last().assetVersionId, kind + '-v');
          assert.equal(p.historyIndex, history + 1);
          await source(kind).click({ button: 'right' });
          const menu = page.locator('.editor-library:visible').getByRole('menu');
          await expect(menu).toBeVisible();
          assert.equal(writes.length, before + 1, 'Right-click must not place');
          await page.getByRole('menuitem', { name: 'Add as…', exact: true }).click();
          await expect(menu.getByRole('menuitem')).toHaveText(['Back', 'Style', 'Subject', 'Logo', 'Other']);
          await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
          await source(kind).focus(); await page.keyboard.press('Shift+F10');
          await expect(menu).toBeVisible();
          await page.keyboard.press('Escape');
          await source(kind).press('Enter');
          await expect.poll(() => writes.length).toBe(before + 2);
          await expect(menu).toHaveCount(0);
          // Clear these placements so the existing drag/undo assertions start empty.
          await surface.press('Control+z'); await expect.poll(() => p.historyIndex).toBe(history + 1);
          await surface.press('Control+z'); await expect.poll(() => p.historyIndex).toBe(history);
        }
        await tab('Assets');
        await drag('asset', 50, 50);
        assert(Math.abs(last().x - 37.5) < .2);
        assert(Math.abs(last().y - (50 - last().height / 2)) < .2);
        const index = p.historyIndex;
        await surface.press('Control+z'); await expect.poll(() => p.historyIndex).toBe(index - 1);
        await expect(page.locator('.canvas-overlay')).toHaveCount(0);
        await surface.press('Control+Shift+z'); await expect.poll(() => p.historyIndex).toBe(index);
        await expect(page.locator('.canvas-overlay')).toHaveCount(1);
        const ix = Math.min(1, dh / dw), iy = Math.min(1, dw / dh);
        // Every edge/corner is outside the design but inside its surrounding workspace.
        for (const [x, y] of [[-1, 50], [101, 50], [50, -1], [50, 101], [-1, -1], [101, -1], [-1, 101], [101, 101]]) {
          await drag('asset', x, y);
          assert(Math.abs(last().x - (x < 0 ? ix : x > 100 ? 100 - ix - last().width : 37.5)) < .2);
          assert(Math.abs(last().y - (y < 0 ? iy : y > 100 ? 100 - iy - last().height : 50 - last().height / 2)) < .2);
        }
        await tab('Uploads'); await drag('upload', 60, 60);
        const cancelled = writes.length;
        await source('upload').dragTo(page.locator('.tool-tabs'));
        assert.equal(writes.length, cancelled, 'Toolbar drop must cancel');
        await source('upload').dragTo(page.locator('.editor-library:visible'));
        assert.equal(writes.length, cancelled, 'Drawer drop must cancel');
        await source('upload').dragTo(page.locator('.chat-panel'));
        assert.equal(writes.length, cancelled, 'Chat drop must cancel');
        await tab('Assets'); await drag('tall', 50, 50);
        assert.equal(last().height, 80);
        assert(Math.abs(last().width * dw / (last().height * dh) - .05) < 1e-8);
        await source('tall').click();
        await expect(page.locator('.library-image-menu')).toHaveCount(0);
        await expect.poll(() => writes.length).toBe(cancelled + 2);
        assert.equal(last().height, 80); assert.equal(last().x, 8);
        assert(Math.abs(last().width * dw / (last().height * dh) - .05) < 1e-8);
        // Zoom then scroll: coordinates must still refer to the design, not the viewport.
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await surface.evaluate(el => { el.scrollTop = 40; el.scrollLeft = 20; });
        await drag('asset', 50, 50); assert(Math.abs(last().x - 37.5) < .2);
        const beforeExternal = writes.length;
        await surface.evaluate(el => {
          const dataTransfer = new DataTransfer(); dataTransfer.setData('text/plain', 'outside image');
          el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
        });
        assert.equal(writes.length, beforeExternal, 'External drags must not place library images');
        await page.reload(); await expect(page.locator('.canvas-overlay')).toHaveCount(p.history[p.historyIndex].overlays.length);
        await tab('Assets');
        const touchDragCancelled = await source('asset').evaluate(el => {
          el.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
          return !el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true }));
        });
        assert(touchDragCancelled, 'Touch must retain the menu instead of starting a native drag');
        await page.screenshot({ path: `work/drawer-placement-${name}-${dw}.png` });
        await page.setViewportSize({ width: 393, height: 850 });
        await page.getByRole('button', { name: 'Tools', exact: true }).click();
        const beforeTouchPlace = writes.length;
        await source('asset').tap();
        await expect(page.locator('.library-image-menu')).toHaveCount(0);
        await expect.poll(() => writes.length).toBe(beforeTouchPlace + 1);
        assert.deepEqual(errors, []);
        console.log(`${name} ${dw}x${dh} ${theme}: real drags, edges/corners, sizing, cancellation, undo/redo, zoom/scroll and reload pass`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
