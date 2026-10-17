import { createServer, preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// Isolated frontend fixture; rejects workspace mutations and never contacts production.
const overlay = { id: 'rose', assetVersionId: 'rose-version', x: 20, y: 30, width: 40, height: 25, rotation: 12 };
const composition = { imageId: 'fire', revisionId: 'revision', overlays: [overlay] };
const pageData = { id: 'page', name: 'Page 1', messages: [], revisions: [{ id: 'revision', imageId: 'fire', overlays: [], createdAt: 10, messages: [] }], history: [composition], historyIndex: 0 };
const fixture = {
  organisations: [{ id: 'org', name: 'The Courtyard', color: '#7654cf' }],
  projects: [{ id: 'project', organisationId: 'org', name: 'Halloween Docs', tags: [] }],
  documents: [{ id: 'doc', projectId: 'project', name: 'Fire Starter', width: 210, height: 297, unit: 'mm', pages: [pageData], tags: [], updatedAt: 20 }],
  assets: [{ id: 'asset', name: 'Rose', organisationId: 'org', versions: [{ id: 'rose-version', imageId: 'rose' }], currentVersionId: 'rose-version', tags: [], page: pageData }],
  images: [], customSizes: [], handoffs: {}, templates: [], templateFolders: [],
};
const image = id => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><rect width="210" height="297" fill="${id === 'fire' ? '#b43114' : '#171313'}"/><text x="10" y="45" fill="white" font-size="22">${id === 'fire' ? 'FIRE STARTER' : 'BLACK ROSE'}</text></svg>`).toString('base64');
const server = process.env.IMAGEGEN_TEST_BUILT ? await preview({ preview: { host: '127.0.0.1', port: 0 } }) : await createServer({ server: { host: '127.0.0.1', port: 0 } });
if (!process.env.IMAGEGEN_TEST_BUILT) await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
mkdirSync('work', { recursive: true });
try {
  for (const [name, engine, options] of [['edge', chromium, { channel: 'msedge' }], ['webkit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
      await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.9.5' } }));
      await page.route('**/api/*', r => {
        const command = r.request().url().split('/').pop();
        assert.notEqual(command, 'mutate');
        return r.fulfill({ json: command === 'get_workspace' ? fixture : command === 'get_jobs' ? [] : command === 'image_data' ? image(r.request().postDataJSON().imageId) : command === 'server_status' ? { connected: true, online: true, pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
      });
      for (const width of [393, 1440]) for (const theme of ['light', 'dark']) for (const ratio of [210 / 297, 2]) {
        fixture.documents[0].width = ratio * 297;
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${origin}/?preview=${width}-${theme}-${ratio}#view=home&org=all`);
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; localStorage.setItem('imagegen-theme', theme); }, theme);
        const project = page.locator('.project-paper .card-composition');
        const design = page.locator('.document-card .card-composition');
        for (const locator of [project, design]) {
          await expect(locator.locator('img')).toHaveCount(2);
          const placement = await locator.evaluate(el => {
            const style = getComputedStyle(el.querySelector('.card-overlay'));
            return { left: parseFloat(style.left), top: parseFloat(style.top), width: parseFloat(style.width), height: parseFloat(style.height), parentWidth: el.clientWidth, parentHeight: el.clientHeight };
          });
          assert(Math.abs(placement.left - placement.parentWidth * .2) < .3);
          assert(Math.abs(placement.top - placement.parentHeight * .3) < .3);
          assert(Math.abs(placement.width - placement.parentWidth * .4) < .3);
          assert(Math.abs(placement.height - placement.parentHeight * .25) < .3);
        }
        assert.equal(await project.locator('.card-overlay').getAttribute('src'), await design.locator('.card-overlay').getAttribute('src'));
        const bounds = await project.evaluate(el => ({ width: el.clientWidth, height: el.clientHeight, parentWidth: el.parentElement.clientWidth, parentHeight: el.parentElement.clientHeight, style: el.getAttribute('style'), computedWidth: getComputedStyle(el).width, computedHeight: getComputedStyle(el).height, ratio: getComputedStyle(el).getPropertyValue('--composition-ratio') }));
        assert(Math.abs(bounds.width / bounds.height - ratio) < .05, JSON.stringify(bounds));
        assert(bounds.width <= bounds.parentWidth && bounds.height <= bounds.parentHeight, JSON.stringify(bounds));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (width === 393 && theme === 'dark' && ratio < 1) await page.screenshot({ path: `work/project-compositions-${name}.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
      console.log(`${name}: project/design overlays and portrait/landscape bounds pass at 393/1440px in light/dark`);
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
