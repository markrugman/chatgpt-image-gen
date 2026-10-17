import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Isolated API fixture: never reads or writes a user workspace.
const pageData = { id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
const examples = [
  ['Old', [10]],
  ['Revised', [50, 5]],
  ['Tie older creation', [50, 15]],
  ['Tie newer creation', [20, 50]],
  ['New', [40]],
  ['Empty', []],
];
const workspace = {
  organisations: [{ id: 'org', name: 'Studio', color: '#8864d7' }],
  projects: [], documents: [], images: [], customSizes: [], handoffs: {},
  assets: ['asset', 'upload'].flatMap(libraryKind => ['org', null].flatMap(organisationId =>
    examples.map(([name, dates], i) => ({
      id: `${libraryKind}-${organisationId}-${i}`, libraryKind, organisationId, name, tags: [],
      versions: dates.map((createdAt, j) => ({ id: `${libraryKind}-${organisationId}-${i}-${j}`, imageId: null, createdAt })),
      currentVersionId: null, page: pageData, deletedAt: null,
    })))),
};
const original = JSON.stringify(workspace.assets);
const expected = ['Tie newer creation', 'Tie older creation', 'Revised', 'New', 'Old', 'Empty'];
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
try {
  for (const [engine, options] of [[chromium, { channel: 'msedge' }], [webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
      await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.10.1' } }));
      await page.route('**/api/*', r => {
        const command = r.request().url().split('/').pop();
        return r.fulfill({ json: command === 'get_workspace' ? workspace : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
      });
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      for (const route of ['assets', 'uploads']) {
        for (const org of ['all', 'org']) {
          await page.goto(`${origin}/#view=${route}&org=${org}`);
          const names = page.locator('.asset-card strong');
          await expect(names).toHaveText(org === 'all' ? expected.flatMap(name => [name, name]) : expected);
          await page.getByRole('button', { name: 'Shared', exact: true }).click();
          await expect(names).toHaveText(expected);
          await page.reload();
          await expect(names).toHaveText(expected);
          console.log(`PASS ${engine.name()} ${route}: ${org}, shared and reload; modified DESC then created DESC`);
        }
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  assert.equal(JSON.stringify(workspace.assets), original);
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
