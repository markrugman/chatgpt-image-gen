import { createServer, preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';

// Real import/storage checks using an existing local server binary, disposable data,
// and a development frontend. Worker disabled; no production or provider access.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-canvas-'));
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const backend = `http://127.0.0.1:${port}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC', 'base64');
const headers = { 'X-Imagegen-Request': '1' };
const permissionPrompt = process.env.IMAGEGEN_TEST_PERMISSION_PROMPT === '1';
let service, vite;
try {
  let diagnostics = '';
  service = spawn(path.resolve('server/target/debug/image-gen-server.exe'), [], { windowsHide: true, env: {
    ...process.env, IMAGEGEN_SERVER_DATA: root, IMAGEGEN_SERVER_LISTEN: `127.0.0.1:${port}`, IMAGEGEN_WORKER_DATA: path.join(root, 'worker'), IMAGEGEN_WORKER_ENABLED: 'false', IMAGEGEN_WEB_DIR: path.join(root, 'unused-web'),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  service.stdout.on('data', data => { diagnostics += data; });
  service.stderr.on('data', data => { diagnostics += data; });
  let healthy = false, healthError;
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(backend + '/health'); if (response.ok) { healthy = true; break; } healthError = response.status; } catch (error) { healthError = String(error.cause || error); }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(healthy, `Disposable server must start (exit ${service.exitCode}, ${healthError}): ${diagnostics}`);
  const options = { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/api', '/web', '/health'].map(prefix => [prefix, {
    target: backend, changeOrigin: true,
    // The local development proxy forwards browser requests to a different port.
    // Keep the forwarded Host and Origin consistent for the server's CSRF checks.
    configure: proxy => proxy.on('proxyReq', request => { if (request.hasHeader('origin')) request.setHeader('origin', backend); }),
  }])) };
  vite = process.env.IMAGEGEN_TEST_BUILT ? await preview({ preview: options }) : await createServer({ server: options });
  if (!process.env.IMAGEGEN_TEST_BUILT) await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;

  const request = async (route, data = {}) => { const r = await fetch(backend + route, { method: 'POST', headers: { ...headers, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!r.ok) throw Error(`${route}: ${await r.text()}`); return r.json(); };
  const login = await fetch(backend + '/web/login', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey: fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim(), remember: true }) });
  assert(login.ok); const cookie = login.headers.get('set-cookie').split(';')[0];
  await request('/web/owner', { keyOnly: true });
  const post = (command, data) => request('/api/' + command, data);
  const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
  const org = await act({ op: 'organisation', name: 'Studio' });
  const project = await act({ op: 'project', organisationId: org, name: 'Halloween Docs' });
  const doc = await act({ op: 'document', projectId: project, name: 'Brain Haemorrhage Shot', width: 1000, height: 800, unit: 'px' });
  const asset = await post('import_asset_data', { name: 'Overlay', organisationId: org, data: png.toString('base64'), replaceId: null });
  const otherProject = await act({ op: 'project', organisationId: org, name: 'Test Projects' });
  await act({ op: 'document', projectId: otherProject, name: 'Sam Photo', width: 1000, height: 800, unit: 'px' });
  const before = await post('get_workspace'), document = before.documents.find(d => d.id === doc);
  const target = { kind: 'document', id: doc, pageId: document.pages[0].id };
  const version = before.assets.find(a => a.id === asset).currentVersionId;
  await new Promise(resolve => setTimeout(resolve, 1100));
  await act({ op: 'overlays', target, overlays: [{ id: 'one', assetVersionId: version, x: 25, y: 25, width: 25, height: 25, rotation: 0 }] });
  const after = await post('get_workspace');
  assert(after.documents.find(d => d.id === doc).updatedAt > document.updatedAt, 'Editing overlays must advance design modification date and project recency');
  let previous = after.documents.find(d => d.id === doc).modifiedAt;
  for (const action of [{ op: 'framing', target, framing: 'crop' }, { op: 'history', target, direction: 'undo' }, { op: 'history', target, direction: 'redo' }, { op: 'tags', kind: 'document', id: doc, tags: ['edited'] }]) {
    await act(action);
    const current = (await post('get_workspace')).documents.find(d => d.id === doc).modifiedAt;
    assert(current > previous, `${action.op} must advance precise edit time`); previous = current;
  }
  for (const libraryKind of ['asset', 'upload']) {
    const id = libraryKind === 'asset' ? asset : await post('import_asset_data', { name: 'Upload', organisationId: org, data: png.toString('base64'), replaceId: null });
    if (libraryKind === 'upload') await act({ op: 'classify', id, libraryKind });
    const earlier = (await post('get_workspace')).assets.find(a => a.id === id);
    await act({ op: 'rename', kind: 'asset', id, name: libraryKind + ' edited' });
    const edited = (await post('get_workspace')).assets.find(a => a.id === id);
    assert(edited.modifiedAt > earlier.modifiedAt);
    assert.deepEqual(edited.versions, earlier.versions, 'Metadata edits must retain source versions');
  }
  const template = await act({ op: 'template_save', organisationId: org, name: 'Template', recipe: 'Original', folderId: 'general' });
  const oldTemplate = (await post('get_workspace')).templates.find(t => t.id === template);
  await act({ op: 'template_save', id: template, version: oldTemplate.version, organisationId: org, name: 'Template', recipe: 'Edited', folderId: 'general' });
  assert((await post('get_workspace')).templates.find(t => t.id === template).modifiedAt > oldTemplate.modifiedAt);
  for (const [engine, options] of [[chromium, { channel: 'msedge' }], [webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const login = await context.request.post(origin + '/web/login', { headers, data: { accessKey: fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim(), remember: true } }); assert(login.ok());
      const page = await context.newPage();
      await page.goto(origin + `/#view=home&org=${org}`);
      await expect(page.locator('.document-card .card-name strong').first()).toHaveText('Brain Haemorrhage Shot');
      await expect(page.locator('.project-card .card-name strong').first()).toHaveText('Halloween Docs');
      await page.reload();
      await expect(page.locator('.project-card .card-name strong').first()).toHaveText('Halloween Docs');
    } finally { await browser.close(); }
  }
  console.log('PASS: persisted canvas/history/metadata/template edit times, exact source preservation and Edge/WebKit design/project recency after reload');
} finally {
  if (vite) await vite.close();
  if (service && service.exitCode === null) { const exited = new Promise(resolve => service.once('exit', resolve)); service.kill(); await exited; }
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'imagegen-canvas-'));
  fs.rmSync(root, { recursive: true, force: true });
}
