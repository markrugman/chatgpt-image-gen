import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Isolated UI fixture: selecting overlays must not resize or reposition the canvas.
const overlays = ['one', 'two'].map((id, i) => ({ id, assetVersionId: 'version', x: 15 + i * 40, y: 25, width: 20, height: 15, rotation: 0 }));
const data = { id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays }], historyIndex: 0 };
const workspace = {
  formatVersion: 3, organisations: [{ id: 'org', name: 'Studio', color: '#8864d7' }],
  projects: [{ id: 'project', organisationId: 'org', name: 'Project', tags: [] }],
  documents: [{ id: 'doc', projectId: 'project', name: 'Design', width: 210, height: 297, unit: 'mm', pages: [data], tags: [], updatedAt: 1 }],
  assets: [{ id: 'asset', libraryKind: 'asset', organisationId: 'org', name: 'Asset', tags: [], versions: [{ id: 'version', imageId: 'image' }], currentVersionId: 'version', page: { ...data, id: 'asset-page' } }],
  images: [{ id: 'image', width: 400, height: 200, mime: 'image/svg+xml' }], customSizes: [], handoffs: {}, templates: [], templateFolders: [],
};
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="purple"/></svg>');
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
try {
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      for (const width of [1440, 768, 393, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
        await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.10.0' } }));
        await page.route('**/api/*', r => {
          const command = r.request().url().split('/').pop();
          return r.fulfill({ json: command === 'get_workspace' ? workspace : command === 'image_data' ? image : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
        });
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/#view=projects&org=org&design=doc&page=page`);
        const canvas = page.locator('.design-canvas');
        await expect(canvas).toBeVisible();
        // Allow the initial ResizeObserver measurement to settle.
        await page.waitForTimeout(150);
        const stable = async expected => {
          await page.waitForTimeout(100);
          const actual = await canvas.boundingBox();
          for (const key of ['width', 'height', 'x', 'y']) assert(Math.abs(actual[key] - expected[key]) < 1, `${name} ${width}: canvas ${key} changed from ${expected[key]} to ${actual[key]}`);
        };
        for (const zoom of ['Fit', 'Zoom in', 'Zoom out']) {
          if (zoom !== 'Fit') await page.getByTitle(zoom, { exact: true }).click();
          await page.waitForTimeout(100);
          const before = await canvas.boundingBox();
          for (const id of ['one', 'two']) {
            await page.locator(`[data-overlay-id="${id}"]`).click();
            await expect(page.locator('.overlay-inspector')).toBeVisible();
            await stable(before);
            const box = await canvas.boundingBox();
            await canvas.click({ position: { x: box.width / 2, y: box.height / 10 } });
            await expect(page.locator('.overlay-inspector')).toHaveCount(0);
            await stable(before);
          }
        }
        await page.getByTitle('Fit to window', { exact: true }).click();
        await page.waitForTimeout(100);
        const beforeResize = await canvas.boundingBox();
        await page.setViewportSize({ width, height: 700 });
        await page.waitForTimeout(150);
        if (width === 1440) assert((await canvas.boundingBox()).height < beforeResize.height, 'Fit must still respond to window resizing');
        await page.close();
        console.log(`${name} ${width}: selection/deselection stable in Fit and manual zoom`);
      }
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
