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

  for (const [engineName, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    if (process.env.IMAGEGEN_TEST_ENGINE && process.env.IMAGEGEN_TEST_ENGINE !== engineName) continue;
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      assert((await context.request.post(origin + '/web/login', { headers, data: { accessKey: fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim(), remember: true } })).ok());
      if ((await (await context.request.get(origin + '/web/session')).json()).setupNeeded) assert((await context.request.post(origin + '/web/owner', { headers, data: { keyOnly: true } })).ok());
      const post = async (command, data = {}) => { const r = await context.request.post(origin + '/api/' + command, { headers, data }); assert(r.ok(), `${command}: ${await r.text()}`); return r.json(); };
      const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
      const org = await act({ op: 'organisation', name: engineName });
      const project = await act({ op: 'project', organisationId: org, name: 'Transforms' });
      const asset = await post('import_asset_data', { name: 'Source', organisationId: org, data: png.toString('base64'), replaceId: null });
      const version = (await post('get_workspace')).assets.find(a => a.id === asset).currentVersionId;
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const [width, height] of [[1000, 800], [800, 1200]]) {
        const doc = await act({ op: 'document', name: 'Canvas', projectId: project, width, height, unit: 'px' });
        const target = { kind: 'document', id: doc, pageId: (await post('get_workspace')).documents.find(d => d.id === doc).pages[0].id };
        const initial = { id: 'one', assetVersionId: version, x: 30, y: 35, width: 25, height: 20, rotation: 0 };
        const state = async () => { const w = await post('get_workspace'), p = w.documents.find(d => d.id === doc).pages[0]; return { p, o: p.history[p.historyIndex].overlays[0] }; };
        const open = async o => {
          await act({ op: 'overlays', target, overlays: [o] });
          await page.goto('about:blank');
          await page.goto(origin + `/#view=projects&org=${org}&design=${doc}`);
          await expect(page.locator('.canvas-overlay')).toBeVisible();
          await page.locator('.canvas-overlay').click();
          await page.waitForTimeout(100);
        };
        const anchor = async (o, corner, fromCenter) => {
          const r = await page.locator('.design-canvas').boundingBox(), a = o.rotation * Math.PI / 180;
          const sx = fromCenter ? 0 : corner.endsWith('right') ? -1 : 1, sy = fromCenter ? 0 : corner.startsWith('bottom') ? -1 : 1;
          const x = sx * o.width * r.width / 200, y = sy * o.height * r.height / 200;
          return { x: (o.x + o.width / 2) * r.width / 100 + Math.cos(a) * x - Math.sin(a) * y,
            y: (o.y + o.height / 2) * r.height / 100 + Math.sin(a) * x + Math.cos(a) * y };
        };
        for (const fromCenter of [false, true]) for (const zoomed of [false, true]) for (const rotation of [0, 37]) for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
          await open({ ...initial, rotation });
          if (zoomed) { await page.getByTitle('Zoom in', { exact: true }).click(); await page.waitForTimeout(100); }
          const before = await state(), fixed = await anchor(before.o, corner, fromCenter);
          const handle = page.locator(`[data-resize-corner="${corner}"]`), h = await handle.boundingBox();
          const center = await page.locator('.canvas-overlay').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
          const x = h.x + h.width / 2, y = h.y + h.height / 2;
          if (fromCenter) await page.keyboard.down('Shift');
          await page.mouse.move(x, y); await page.mouse.down();
          await page.mouse.move(x + (x - center.x) * .25, y + (y - center.y) * .25, { steps: 8 });
          await page.mouse.up();
          if (fromCenter) await page.keyboard.up('Shift');
          await expect.poll(async () => (await state()).p.historyIndex).toBe(before.p.historyIndex + 1);
          const after = await state(), nextFixed = await anchor(after.o, corner, fromCenter);
          assert(after.o.width > before.o.width + 1, `${engineName} ${width}x${height} center=${fromCenter} zoom=${zoomed} rotation=${rotation} ${corner}: must resize: ${JSON.stringify({before:before.o,after:after.o})}`);
          assert(Math.abs(after.o.width / after.o.height - initial.width / initial.height) < .001);
          assert(Math.hypot(fixed.x - nextFixed.x, fixed.y - nextFixed.y) < 1, fromCenter ? 'centre must stay fixed' : 'opposite corner must stay fixed');
          await page.locator('.canvas-scroll').focus(); await page.keyboard.press('Control+z');
          await expect.poll(async () => (await state()).o).toEqual(before.o);
          await expect(page.getByTitle('Redo', { exact: true })).toBeEnabled();
          await page.keyboard.press('Control+Shift+z');
          await expect.poll(async () => (await state()).o).toEqual(after.o);
        }
        await open(initial);
        const before = await state(), h = await page.locator('.rotation-handle').boundingBox();
        const r = await page.locator('.canvas-overlay').boundingBox(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const x = h.x + h.width / 2, y = h.y + h.height / 2;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(cx + (cy - y), cy, { steps: 12 }); await page.mouse.up();
        await expect.poll(async () => (await state()).o.rotation).toBe(90);
        const rotated = await state();
        for (const key of ['x', 'y', 'width', 'height']) assert.equal(rotated.o[key], initial[key]);
        assert.equal(rotated.p.historyIndex, before.p.historyIndex + 1);
        await expect(page.getByRole('spinbutton', { name: 'Overlay rotation' })).toHaveValue('90');
        await page.reload(); await page.locator('.canvas-overlay').click();
        await expect(page.getByRole('spinbutton', { name: 'Overlay rotation' })).toHaveValue('90');
        // Cancellation rolls back all geometry and creates no history state.
        const beforeCancel = await state(), rh = await page.locator('.rotation-handle').boundingBox();
        await page.mouse.move(rh.x + rh.width / 2, rh.y + rh.height / 2); await page.mouse.down();
        await page.mouse.move(rh.x + 30, rh.y + 40, { steps: 3 });
        await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
        await expect(page.getByRole('spinbutton', { name: 'Overlay rotation' })).toHaveValue('90');
        assert.deepEqual(await state(), beforeCancel);
        await open({ ...initial, locked: true });
        await expect(page.locator('.resize-handle')).toHaveCount(0);
        console.log(`${engineName} ${width}x${height}: four corners, Shift centre resize, rotated resize, zoom, rotation, undo/redo, reload, cancellation and locks pass`);
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
} finally {
  if (vite) await vite.close();
  if (service && service.exitCode === null) { const exited = new Promise(resolve => service.once('exit', resolve)); service.kill(); await exited; }
  assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'imagegen-canvas-'));
  fs.rmSync(root, { recursive: true, force: true });
}
