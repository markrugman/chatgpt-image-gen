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


  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    if (process.env.MOVE_ENGINE && process.env.MOVE_ENGINE !== name) continue;
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
      assert((await context.request.post(origin + '/web/login', { headers, data: { accessKey: fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim(), remember: true } })).ok());
      if ((await (await context.request.get(origin + '/web/session')).json()).setupNeeded) assert((await context.request.post(origin + '/web/owner', { headers, data: { keyOnly: true } })).ok());
      const post = async (command, data = {}) => { const r = await context.request.post(origin + '/api/' + command, { headers, data }); assert(r.ok(), `${command}: ${await r.text()}`); return r.json(); };
      const state = () => post('get_workspace');
      const act = async action => post('mutate', { action: { ...action, _base: await state() } });
      const org = await act({ op: 'organisation', name: name + ' Studio' });
      const otherOrg = await act({ op: 'organisation', name: name + ' Other' });
      const project = await act({ op: 'project', name: name + ' Original', organisationId: org });
      const destination = await act({ op: 'project', name: name + ' Destination', organisationId: org });
      const crossProject = await act({ op: 'project', name: name + ' Cross', organisationId: otherOrg });
      const doc = await act({ op: 'document', projectId: project, name: 'Sam Photo ' + name, width: 1000, height: 800, unit: 'px' });
      const asset = await post('import_asset_data', { name: 'Source', organisationId: org, data: png.toString('base64'), replaceId: null });
      const w = await state(), original = w.documents.find(d => d.id === doc);
      await act({ op: 'overlays', target: { kind: 'document', id: doc, pageId: original.pages[0].id }, overlays: [{ id: 'overlay', assetVersionId: w.assets.find(a => a.id === asset).currentVersionId, x: 20, y: 20, width: 30, height: 30, rotation: 10 }] });
      const before = await state(), beforeDoc = before.documents.find(d => d.id === doc), assetCount = before.assets.length;
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const open = async route => { await page.goto('about:blank'); await page.goto(origin + '/#' + route); };
      const design = id => page.locator(`[data-document-id="${id}"]`);
      const projectCard = id => page.locator(`[data-project-id="${id}"]`);
      const drag = async (source, target) => {
        await source.hover(); await page.mouse.down();
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y, { steps: 15 });
        await page.mouse.move(x + 1, y + 1);
        await page.mouse.up();
      };
      const document = async () => (await state()).documents.find(d => d.id === doc);
      for (const mode of ['Move', 'Copy']) {
        await open(`view=home&org=${org}`);
        await design(doc).getByRole('button', { name: 'Edit Sam Photo ' + name, exact: true }).click();
        await page.getByRole('button', { name: mode + ' to…', exact: true }).click();
        const dialog = page.getByRole('dialog').last();
        await expect(dialog.getByLabel('Destination organisation')).toHaveValue(org);
        const currentProject = mode === 'Move' ? project : destination;
        assert(!(await dialog.getByLabel('Destination project').locator('option').evaluateAll(options => options.map(o => o.value))).includes(currentProject));
        await dialog.getByLabel('Destination project').selectOption(mode === 'Move' ? destination : project);
        await dialog.getByRole('button', { name: mode + ' here', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        if (mode === 'Move') await expect.poll(async () => (await document()).projectId).toBe(destination);
        else await expect.poll(async () => (await state()).documents.filter(d => d.projectId === project).length).toBe(1);
        assert.equal((await state()).assets.length, assetCount);
        assert.deepEqual((await document()).pages, beforeDoc.pages);
      }
      await open(`view=home&org=${org}`);
      await drag(design(doc), projectCard(project));
      await expect.poll(async () => (await document()).projectId).toBe(project);
      assert.deepEqual((await document()).pages, beforeDoc.pages);
      assert.equal((await state()).assets.length, assetCount);
      const unchanged = (await document()).modifiedAt;
      await drag(design(doc), projectCard(project));
      await drag(design(doc), page.locator('.workspace-footer'));
      assert.equal((await document()).modifiedAt, unchanged, 'Same-project and invalid drops must not save');
      // An armed design drag still rejects a template channel and external file payload.
      for (const type of ['application/x-imagegen-template-move', 'Files']) {
        await design(doc).evaluate(el => el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true })));
        const prevented = await projectCard(destination).evaluate((el, type) => {
          const dt = new DataTransfer(); dt.setData(type, 'invalid');
          const e = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented;
        }, type);
        assert(!prevented);
        await design(doc).dispatchEvent('dragend');
      }
      assert.equal((await document()).modifiedAt, unchanged);
      await open('view=home&org=all');
      await drag(design(doc), projectCard(crossProject));
      await expect.poll(async () => (await document()).projectId).toBe(crossProject);
      assert.equal((await state()).assets.length, assetCount + 1, 'Cross-organisation move retains independent source-copy semantics');
      await page.reload();
      await expect(design(doc).locator('.card-name')).toContainText(name + ' Cross');

      await page.route('**/api/get_jobs', r => r.fulfill({ json: [{ id: 'busy', status: 'running', target: { kind: 'document', id: doc, pageId: original.pages[0].id } }] }));
      await page.reload();
      await expect(design(doc)).toHaveAttribute('draggable', 'false');
      await page.unroute('**/api/get_jobs');

      const folderA = await act({ op: 'template_folder', name: 'Folder A ' + name, organisationId: org });
      const folderB = await act({ op: 'template_folder', name: 'Folder B ' + name, organisationId: org });
      const template = await act({ op: 'template_save', name: 'Recipe ' + name, recipe: 'Preserve recipe', usageNotes: 'Preserve notes', tags: ['tag'], folderId: folderA, organisationId: org });
      const tile = id => page.locator(`[data-template-id="${id}"]`);
      const folderCard = id => page.locator(`[data-template-folder-id="${id}"]`);
      const templateState = async () => (await state()).templates.find(t => t.id === template);
      for (const mode of ['Copy', 'Move']) {
        await open(`view=templates&org=${org}`);
        await tile(template).getByRole('button', { name: 'Edit Recipe ' + name, exact: true }).first().click();
        await page.getByRole('button', { name: mode + ' to…', exact: true }).click();
        const dialog = page.getByRole('dialog').last();
        await expect(dialog.getByLabel('Destination library')).toHaveValue(org);
        assert(!(await dialog.getByLabel('Folder', { exact: true }).locator('option').evaluateAll(options => options.map(o => o.value))).includes(folderA));
        await dialog.getByLabel('Folder', { exact: true }).selectOption(folderB);
        await dialog.getByRole('button', { name: mode + ' template', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        if (mode === 'Move') await expect.poll(async () => (await templateState()).folderId).toBe(folderB);
        else assert((await state()).templates.some(t => t.id !== template && t.folderId === folderB && t.name === 'Recipe ' + name));
      }
      await open(`view=templates&org=${org}`);
      await drag(tile(template), folderCard(folderA));
      await expect.poll(async () => (await templateState()).folderId).toBe(folderA);
      const saved = await templateState();
      assert.equal(saved.recipe, 'Preserve recipe'); assert.equal(saved.usageNotes, 'Preserve notes'); assert.deepEqual(saved.tags, ['tag']);
      // The inverse wrong-type channel is rejected, even with a real template drag armed.
      await tile(template).evaluate(el => el.dispatchEvent(new DragEvent('dragstart', { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true })));
      await folderCard(folderB).evaluate(el => { const dt = new DataTransfer(); dt.setData('application/x-imagegen-design-move', 'wrong'); el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); });
      await tile(template).dispatchEvent('dragend');
      assert.deepEqual(await templateState(), saved);
      await open('view=templates&org=all');
      await drag(tile(template), folderCard('general'));
      await expect.poll(async () => (await templateState()).folderId).toBe('general');
      assert.equal((await templateState()).organisationId, org);
      await page.reload();
      await expect(tile(template).locator('.card-name')).toContainText('General');
      const crossFolder = await act({ op: 'template_folder', name: 'Other folder ' + name, organisationId: otherOrg });
      await open('view=templates&org=all');
      await drag(tile(template), folderCard(crossFolder));
      await expect.poll(async () => (await templateState()).folderId).toBe(crossFolder);
      assert.equal((await templateState()).organisationId, otherOrg);
      assert.equal((await templateState()).recipe, 'Preserve recipe');

      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: current-organisation Copy/Move defaults, excluded current locations, preserved same-org sources/history, real project/template drags, invalid/same-target/cross-type rejection, cross-org move and reload`);
    } finally { await browser.close(); }
  }
} finally {
  if (vite) await vite.close();
  if (service && service.exitCode === null) { const exited = new Promise(resolve => service.once('exit', resolve)); service.kill(); await exited; }
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'imagegen-canvas-'));
  fs.rmSync(root, { recursive: true, force: true });
}
