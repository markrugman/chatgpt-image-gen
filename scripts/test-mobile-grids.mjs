import { preview } from 'vite';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const pageData = { id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
const workspace = {
  formatVersion: 3, organisations: [{ id: 'org', name: 'Halloween Documents', color: '#8864d7' }],
  projects: ['Halloween Posters', 'Avatars'].map((name, i) => ({ id: `p${i}`, organisationId: 'org', name, tags: [] })),
  documents: ['Black Rose Shot Test', 'Halloween Shots Poster'].map((name, i) => ({ id: `d${i}`, projectId: 'p0', name, width: 210, height: 297, unit: 'mm', pages: [pageData], tags: [], updatedAt: i })),
  assets: ['Rose Glass', 'Halloween Decorations'].map((name, i) => ({ id: `a${i}`, organisationId: 'org', name, tags: [], versions: [], currentVersionId: null, page: pageData })),
  images: [], customSizes: [], handoffs: {},
};
const server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
try {
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
  await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.8.3' } }));
  await page.route('**/api/*', r => {
    const command = r.request().url().split('/').pop();
    return r.fulfill({ json: command === 'get_workspace' ? workspace : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, name: 'Local fixture', pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
  });
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const width of [320, 393, 600, 601, 768, 1440]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto(url);
    await expect(page.locator('.project-card').first()).toBeVisible();
    for (const selector of ['.project-grid', '.document-grid']) {
      const metrics = await page.locator(selector).evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, fits: el.scrollWidth <= el.clientWidth }));
      assert.ok(metrics.fits, `${width} ${selector} overflow`);
      if (width <= 600) assert.equal(metrics.columns, 2, `${width} ${selector}`);
      else assert.ok(metrics.columns >= 2);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} page overflow`);
    await page.locator('.document-grid').scrollIntoViewIfNeeded();
    if (width === 393) await page.screenshot({ path: 'work/mobile-two-column-designs.png' });
    console.log(`PASS projects/designs: ${width}px`);
  }
  for (const width of [320, 393, 600]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto(url);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Asset library' }).click();
    await expect(page.locator('.asset-card')).toHaveCount(2);
    const metrics = await page.locator('.asset-grid').evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, fits: el.scrollWidth <= el.clientWidth }));
    assert.equal(metrics.columns, 2);
    assert.ok(metrics.fits);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 393) await page.screenshot({ path: 'work/mobile-two-column-assets.png' });
    console.log(`PASS assets: ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
