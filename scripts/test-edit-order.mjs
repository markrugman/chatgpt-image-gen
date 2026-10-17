import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Compiled UI with isolated fixtures; no live workspace or credentials.
const pageData = { id: 'page', name: 'Page 1', messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
const workspace = {
  organisations: [{ id: 'org', name: 'Studio', color: '#8864d7' }],
  projects: [{ id: 'test', name: 'Test Projects', organisationId: 'org', tags: [], createdAt: 10 }, { id: 'halloween', name: 'Halloween Docs', organisationId: 'org', tags: [], createdAt: 5 }],
  documents: [['sam', 'Sam Photo', 'test', 10], ['fire', 'Firestarter Shot', 'halloween', 20], ['brain', 'Brain Haemorrhage Shot', 'halloween', 30]].map(([id, name, projectId, updatedAt]) => ({ id, name, projectId, updatedAt: 100, modifiedAt: 100000 + updatedAt, createdAt: 1, width: 100, height: 100, unit: 'px', tags: [], pages: [structuredClone(pageData)] })),
  assets: ['asset', 'upload'].flatMap(libraryKind => [10, 30, 20].map((createdAt,i) => ({ id: `${libraryKind}${i}`, name: `${libraryKind} ${createdAt}`, libraryKind, organisationId: 'org', modifiedAt: createdAt === 20 ? 40000 : undefined, tags: [], versions: [{ id: `${libraryKind}-v${i}`, imageId: null, createdAt }], currentVersionId: `${libraryKind}-v${i}`, page: structuredClone(pageData) }))),
  images: [], templates: [['A old',10],['Z latest',30],['M middle',20]].map(([name, updatedAt],i) => ({ id: `t${i}`, name, recipe: 'Test', organisationId: 'org', folderId: 'general', tags: [], version: 1, updatedAt, createdAt: 1, exampleImageId: '', usageNotes: '' })), templateFolders: [], customSizes: [], handoffs: {},
};
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
        await page.goto(`${origin}/#view=home&org=${org}`);
        await expect(page.locator('.document-card .card-name strong')).toHaveText(['Brain Haemorrhage Shot', 'Firestarter Shot', 'Sam Photo']);
        await expect(page.locator('.project-card .card-name strong')).toHaveText(['Halloween Docs', 'Test Projects']);
        await page.getByRole('button', { name: 'Open Halloween Docs', exact: true }).click();
        await expect(page.locator('.document-card .card-name strong')).toHaveText(['Brain Haemorrhage Shot', 'Firestarter Shot']);
        for (const [route, kind] of [['assets', 'asset'], ['uploads', 'upload']]) {
          await page.goto(`${origin}/#view=${route}&org=${org}`);
          await expect(page.locator('.asset-card .card-name strong')).toHaveText([`${kind} 20`, `${kind} 30`, `${kind} 10`]);
        }
        await page.goto(`${origin}/#view=templates&org=${org}`);
        await expect(page.locator('.template-card .card-name strong')).toHaveText(['Z latest', 'M middle', 'A old']);
        await page.goto(`${origin}/#view=projects&org=org&design=brain`);
        for (const [label, kind] of [['Assets', 'asset'], ['Uploads', 'upload']]) {
          await page.locator('.tool-tabs').getByRole('button', { name: label, exact: true }).click();
          await expect(page.locator('.editor-library .library-image strong')).toHaveText([`${kind} 20`, `${kind} 30`, `${kind} 10`]);
        }
        await page.locator('.tool-tabs').getByRole('button', { name: 'Templates', exact: true }).click();
        await page.locator('.editor-library').getByRole('button', { name: 'Open folder General', exact: true }).click();
        await expect(page.locator('.editor-library .library-image strong')).toHaveText(['Z latest', 'M middle', 'A old']);
        console.log(`PASS ${engine.name()} ${org}: latest designs and containing project first`);
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.httpServer.close(resolve)); }
