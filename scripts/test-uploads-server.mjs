import { createServer } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';

// Real import/storage checks using an existing local server binary, disposable data,
// and a development frontend. Worker disabled; no production or provider access.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-uploads-'));
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const backend = `http://127.0.0.1:${port}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC', 'base64');
const headers = { 'X-Imagegen-Request': '1' };
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
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, proxy: Object.fromEntries(['/api', '/web', '/health'].map(prefix => [prefix, {
    target: backend, changeOrigin: true,
    // The local development proxy forwards browser requests to a different port.
    // Keep the forwarded Host and Origin consistent for the server's CSRF checks.
    configure: proxy => proxy.on('proxyReq', request => { if (request.hasHeader('origin')) request.setHeader('origin', backend); }),
  }])) } });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  for (const [engineName, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      assert((await context.request.post(origin + '/web/login', { headers, data: { accessKey: fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim(), remember: true } })).ok());
      if ((await (await context.request.get(origin + '/web/session')).json()).setupNeeded) assert((await context.request.post(origin + '/web/owner', { headers, data: { keyOnly: true } })).ok());
      const post = async (command, data = {}) => {
        const response = await context.request.post(origin + '/api/' + command, { headers, data });
        assert(response.ok(), `${command}: ${await response.text()}`); return response.json();
      };
      const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
      const org = await act({ op: 'organisation', name: `${engineName} Upload Studio` });
      const project = await act({ op: 'project', name: 'Upload test', organisationId: org });
      const doc = await act({ op: 'document', name: 'Keep this design', projectId: project, width: 1080, height: 1080, unit: 'px' });
      const before = await post('get_workspace'), original = before.documents.find(d => d.id === doc);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + `/#view=projects&org=${org}&design=${doc}`);
      await expect(page.locator('.editor')).toBeVisible();
      await page.locator('.tool-tabs').getByRole('button', { name: 'Uploads', exact: true }).click();
      const chooserPromise = page.waitForEvent('filechooser');
      await page.locator('.editor-library').getByRole('button', { name: 'Upload images', exact: true }).click();
      await (await chooserPromise).setFiles([{ name: 'original.png', mimeType: 'image/png', buffer: png }, { name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') }, { name: 'second.png', mimeType: 'image/png', buffer: png }]);
      await expect(page.locator('.upload-feedback [role="status"]')).toContainText(`2 of 3 images uploaded to ${engineName} Upload Studio`);
      await expect(page.locator('.upload-feedback')).toContainText('invalid.txt:');
      await expect(page.locator('.editor-library').getByRole('button', { name: 'Use original', exact: true })).toBeVisible();
      // Real drop uploads a repeated file as an independent item.
      const data = await page.evaluateHandle(png => {
        const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(png), c => c.charCodeAt(0))], 'original.png', { type: 'image/png' })); return dt;
      }, png.toString('base64'));
      await page.locator('.editor-library').dispatchEvent('drop', { dataTransfer: data }); await data.dispose();
      await expect(page.locator('.upload-feedback [role="status"]')).toContainText(`1 of 1 images uploaded to ${engineName} Upload Studio`);
      const after = await post('get_workspace'), uploads = after.assets.filter(a => a.organisationId === org);
      assert.equal(uploads.length, 3); assert(uploads.every(a => a.libraryKind === 'upload'));
      assert.equal(uploads.filter(a => a.name === 'original').length, 2);
      assert.equal(new Set(uploads.map(a => a.id)).size, 3);
      assert.deepEqual(after.documents.find(d => d.id === doc), original);
      for (const upload of uploads) {
        const imageId = upload.versions.find(v => v.id === upload.currentVersionId).imageId;
        const saved = await post('image_data', { imageId });
        assert(Buffer.from(saved.split(',')[1], 'base64').equals(png), 'Original bytes preserved');
      }
      await page.reload(); await expect(page.locator('.editor')).toBeVisible();
      await page.locator('.tool-tabs').getByRole('button', { name: 'Uploads', exact: true }).click();
      await expect(page.locator('.editor-library .library-image')).toHaveCount(3);
      // Full library uses the same real API and selected organisation despite Shared being viewed.
      await page.goto(origin + `/#view=uploads&org=${org}&library=shared`);
      const fullChooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Upload image', exact: true }).click();
      await (await fullChooser).setFiles([{ name: 'library.png', mimeType: 'image/png', buffer: png }]);
      await expect(page.locator('.upload-feedback [role="status"]')).toContainText(`1 of 1 images uploaded to ${engineName} Upload Studio`);
      await expect(page.locator('.asset-card')).toHaveCount(4);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engineName}: real drawer picker/drop, mixed file rejection, duplicate imports, original bytes, unchanged design, reload and Shared-to-organisation library upload`);
    } finally { await browser.close(); }
  }
} finally {
  if (vite) await vite.close();
  if (service && service.exitCode === null) { const exited = new Promise(resolve => service.once('exit', resolve)); service.kill(); await exited; }
  // Keep the disposable workspace for inspection; never touches installed app/server data.
}
