import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Compiled UI with isolated fixtures; no live workspace or credentials.
const examples = [
  ['A old', 10, 10], ['B revised', 5, 50],
  ['C tie older', 15, 50], ['D tie newer', 20, 50],
  ['E new', 40, 40], ['F legacy', undefined, undefined],
];
const workspace = {
  organisations: [{ id: 'org', name: 'Studio', color: '#8864d7' }],
  projects: examples.map(([name, createdAt, updatedAt], i) => ({ id: `p${i}`, name, createdAt, updatedAt, organisationId: 'org', tags: [], deletedAt: null })),
  templateFolders: ['org', null].flatMap(organisationId => examples.map(([name, createdAt, updatedAt], i) => ({ id: `f${organisationId}${i}`, name, organisationId, createdAt, updatedAt }))),
  templates: [], documents: [], assets: [], images: [], customSizes: [], handoffs: {},
};
const pageData = { id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
// Parent timestamps deliberately disagree: order must come from the contents.
for (const [i, [name, createdAt, updatedAt]] of examples.entries()) {
  if (updatedAt === undefined || name === 'E new') continue;
  workspace.projects[i].updatedAt = 1000 - i;
  workspace.documents.push({ id: `d${i}`, projectId: `p${i}`, name: 'Design', updatedAt, pages: [pageData], tags: [], width: 100, height: 100, unit: 'px' });
  for (const organisationId of ['org', null]) {
    const folderId = `f${organisationId}${i}`;
    workspace.templateFolders.find(f => f.id === folderId).updatedAt = 1000 - i;
    workspace.templates.push({ id: `t${organisationId}${i}`, name: 'Template', organisationId, folderId, createdAt, updatedAt, recipe: 'Test', usageNotes: '', exampleImageId: '', tags: [], version: 1 });
  }
}
// A deleted design must not change its project's position.
workspace.documents.push({ ...workspace.documents[0], id: 'deleted', projectId: 'p0', updatedAt: 9999, deletedAt: 1 });
const expected = ['D tie newer', 'C tie older', 'B revised', 'E new', 'A old', 'F legacy'];
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
try {
  for (const [engine, options] of [[chromium, { channel: 'msedge' }], [webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/web/session', r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
      await page.route('**/health', r => r.fulfill({ json: { service: 'image-gen-server', version: '0.10.1' } }));
      await page.route('**/api/*', r => {
        const command = r.request().url().split('/').pop();
        return r.fulfill({ json: command === 'get_workspace' ? workspace : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, pending: 0 } : command === 'connection' ? { account: null, capabilities: {} } : {} });
      });
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      for (const org of ['all', 'org']) {
        for (const route of ['home', 'projects', 'templates']) {
          await page.goto(`${origin}/#view=${route}&org=${org}`);
          const names = page.locator('.project-card .card-name strong');
          const folderOrder = [...expected.slice(0, -1), 'General', 'F legacy'];
          const order = route === 'templates' ? (org === 'all' ? [...expected.slice(0, -1).flatMap(name => [name, name]), 'General', 'F legacy', 'F legacy'] : folderOrder) : expected;
          await expect(names).toHaveText(order);
          await page.reload();
          await expect(names).toHaveText(order);
          if (route === 'templates') {
            await page.getByRole('button', { name: 'Shared', exact: true }).click();
            await expect(names).toHaveText(folderOrder);
          }
          console.log(`PASS ${engine.name()} ${route}: ${org}, dates descending and reload`);
        }
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
