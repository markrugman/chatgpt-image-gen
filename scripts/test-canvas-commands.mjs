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
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...(engineName === 'Edge' ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}) });
      assert((await context.request.post(origin + '/web/login', { headers, data: { accessKey: fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim(), remember: true } })).ok());
      if ((await (await context.request.get(origin + '/web/session')).json()).setupNeeded) assert((await context.request.post(origin + '/web/owner', { headers, data: { keyOnly: true } })).ok());
      const post = async (command, data = {}) => { const r = await context.request.post(origin + '/api/' + command, { headers, data }); assert(r.ok(), `${command}: ${await r.text()}`); return r.json(); };
      const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
      const org = await act({ op: 'organisation', name: engineName + ' Canvas' });
      const other = await act({ op: 'organisation', name: engineName + ' Other' });
      const project = await act({ op: 'project', name: 'Canvas', organisationId: org });
      const project2 = await act({ op: 'project', name: 'Other', organisationId: other });
      const doc = await act({ op: 'document', name: 'Canvas', projectId: project, width: 1000, height: 800, unit: 'px' });
      const doc2 = await act({ op: 'document', name: 'Other', projectId: project2, width: 2000, height: 1600, unit: 'px' });
      const asset = await post('import_asset_data', { name: 'Source', organisationId: org, data: png.toString('base64'), replaceId: null });
      const initial = await post('get_workspace'), version = initial.assets.find(a => a.id === asset).currentVersionId;
      const target = { kind: 'document', id: doc, pageId: initial.documents.find(d => d.id === doc).pages[0].id };
      const one = { id: 'one', assetVersionId: version, x: 10, y: 15, width: 25, height: 25, rotation: 0 };
      await act({ op: 'overlays', target, overlays: [one, { ...one, id: 'two', x: 55 }] });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + `/#view=projects&org=${org}&design=${doc}`);
      await expect(page.locator('.canvas-overlay')).toHaveCount(2);
      const surface = page.locator('.canvas-scroll');
      const menu = page.getByRole('menu', { name: 'Canvas actions', exact: true });
      const state = async (id = doc) => { const w = await post('get_workspace'); const p = w.documents.find(d => d.id === id).pages[0]; return { w, p, overlays: p.history[p.historyIndex].overlays }; };
      const right = async id => { await page.locator(`[data-overlay-id="${id}"]`).click({ button: 'right', position: { x: 1, y: 1 } }); await expect(menu).toBeVisible(); };
      const command = async (label, id = 'one') => { await right(id); await menu.getByRole('menuitem', { name: label, exact: true }).click(); await expect(menu).toHaveCount(0); };
      const copy = async cut => surface.evaluate((el, cut) => { const dt = new DataTransfer(); el.dispatchEvent(new ClipboardEvent(cut ? 'cut' : 'copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/plain'); }, cut);
      const paste = async (token, images = []) => surface.evaluate((el, { token, images }) => {
        const dt = new DataTransfer(); if (token) dt.setData('text/plain', token);
        for (const image of images) dt.items.add(new File([Uint8Array.from(atob(image.data), c => c.charCodeAt(0))], image.name, { type: image.type }));
        const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); el.dispatchEvent(event); return event.defaultPrevented;
      }, { token, images });
      let before = await state();
      await right('one'); await expect(page.locator('[data-overlay-id="one"]')).toHaveClass(/selected/);
      assert.equal((await state()).p.historyIndex, before.p.historyIndex, 'Right click must not move or save');
      await menu.getByRole('menuitem', { name: 'Layer', exact: true }).hover();
      await menu.getByRole('menu', { name: 'Layer', exact: true }).getByRole('menuitem', { name: 'Move to top', exact: true }).click();
      await expect.poll(async () => (await state()).overlays.map(o => o.id).join(',')).toBe('two,one');
      await command('Lock'); await expect.poll(async () => (await state()).overlays.find(o => o.id === 'one').locked).toBe(true);
      await right('one');
      for (const name of ['Cut', 'Delete', 'Layer']) await expect(menu.getByRole('menuitem', { name, exact: true })).toBeDisabled();
      await expect(menu.getByRole('menuitem', { name: 'Copy', exact: true })).toBeEnabled();
      await page.keyboard.press('Escape'); await surface.focus();
      before = await state(); await page.keyboard.press('Delete'); await page.keyboard.press('ArrowRight');
      assert.equal((await state()).p.historyIndex, before.p.historyIndex);
      await page.reload(); await expect(page.locator('[data-overlay-id="one"]')).toHaveClass(/locked/);
      await command('Duplicate'); await expect.poll(async () => (await state()).overlays.length).toBe(3);
      let next = await state(); assert(!next.overlays[2].locked); assert.equal(next.overlays[2].x, 11);
      await command('Unlock'); await expect.poll(async () => !!(await state()).overlays.find(o => o.id === 'one').locked).toBe(false);
      // A held arrow gesture must add one history state, independent of zoom.
      await page.locator('[data-overlay-id="one"]').click({ position: { x: 1, y: 1 } }); await surface.focus();
      before = await state();
      await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight');
      await expect.poll(async () => (await state()).p.historyIndex).toBe(before.p.historyIndex + 1);
      assert(Math.abs((await state()).overlays.find(o => o.id === 'one').x - before.overlays.find(o => o.id === 'one').x - .3) < 1e-8);
      await surface.press('Control+z'); await expect.poll(async () => (await state()).p.historyIndex).toBe(before.p.historyIndex);
      await surface.press('Control+Shift+z'); await expect.poll(async () => (await state()).p.historyIndex).toBe(before.p.historyIndex + 1);
      await page.locator('[data-overlay-id="one"]').click({ position: { x: 1, y: 1 } });
      console.log(`PASS ${engineName}: layer ordering, lock/reload/duplicate and held-key nudge/undo/redo`);
      const token = await copy(false); assert(token.startsWith('imagegen-overlay:'));
      before = await state(); assert.equal(await paste('unrelated text'), false); assert.equal((await state()).overlays.length, before.overlays.length);
      await paste(token); await expect.poll(async () => (await state()).overlays.length).toBe(before.overlays.length + 1);
      const source = (await state()).w.assets.find(a => a.id === asset);
      await page.evaluate(hash => { location.hash = hash; }, `view=projects&design=${doc2}`);
      await expect(page.locator('.canvas-overlay')).toHaveCount(0); await surface.focus(); await paste(token);
      await expect.poll(async () => (await state(doc2)).overlays.length).toBe(1);
      next = await state(doc2); assert.equal(next.overlays[0].assetVersionId, version); assert.equal(next.overlays[0].width, 12.5); assert.deepEqual(next.w.assets.find(a => a.id === asset), source);
      // Image data supersedes an older overlay clipboard. Import and place a mixed batch in the design's own org under All organisations.
      before = await state(doc2);
      await paste(token, [{ name: 'Clipboard-one.png', type: 'image/png', data: png.toString('base64') }, { name: 'bad.png', type: 'image/png', data: Buffer.from('invalid image').toString('base64') }, { name: 'Clipboard-two.png', type: 'image/png', data: png.toString('base64') }]);
      await expect(page.locator('.toast')).toContainText('2 images pasted'); await expect(page.locator('.toast')).toContainText('bad.png');
      next = await state(doc2); assert.equal(next.overlays.length, 3); assert.equal(next.p.historyIndex, before.p.historyIndex + 1);
      const imported = next.w.assets.filter(a => !before.w.assets.some(old => old.id === a.id));
      assert.equal(imported.length, 2); assert(imported.every(a => a.organisationId === other && a.libraryKind === 'upload'));
      for (const item of imported) { const version = item.versions.find(v => v.id === item.currentVersionId); const data = await post('image_data', { imageId: version.imageId }); assert(Buffer.from(data.split(',')[1], 'base64').equals(png)); }
      await surface.press('Control+z'); await expect.poll(async () => (await state(doc2)).overlays.length).toBe(1); assert.equal((await state(doc2)).w.assets.length, next.w.assets.length);
      // Clipboard denial must not silently paste the old captured overlay.
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async () => { throw Error('Denied'); } } }));
      await page.locator('.design-canvas').click({ button: 'right', position: { x: 2, y: 2 } });
      await expect(menu.getByRole('menuitem')).toHaveCount(3); await menu.getByRole('menuitem', { name: 'Paste', exact: true }).click();
      await expect(page.locator('.toast')).toContainText('Press Ctrl+V'); await expect(surface).toBeFocused(); assert.equal((await state(doc2)).overlays.length, 1);
      await page.evaluate(() => { delete navigator.clipboard; });
      await page.locator('.canvas-overlay').first().click();
      const cutToken = await copy(true);
      await expect.poll(async () => (await state(doc2)).overlays.length).toBe(0);
      await paste(cutToken); await expect.poll(async () => (await state(doc2)).overlays.length).toBe(1);
      const beforeConflict = await state(doc2);
      const target2 = { kind: 'document', id: doc2, pageId: beforeConflict.p.id };
      await act({ op: 'overlays', target: target2, overlays: beforeConflict.overlays.map(o => ({ ...o, rotation: 25 })) });
      await surface.press('Control+d');
      await expect(page.locator('.toast')).toContainText('This layout changed elsewhere');
      assert.equal((await state(doc2)).overlays.length, 1, 'A stale canvas cannot overwrite a concurrent edit');
      await expect(page.locator('.canvas-overlay')).toHaveCSS('transform', /matrix/);
      // Text editing retains its standard Delete / Ctrl+D behaviour and never edits the canvas.
      const prompt = page.getByRole('textbox', { name: 'Design prompt', exact: true }); await prompt.fill('Keep my text');
      await prompt.press('Delete'); assert.equal((await state(doc2)).overlays.length, 1);
      if (engineName === 'Edge') {
        await surface.focus();
        await page.evaluate(async png => { const blob = new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' }); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); }, png.toString('base64'));
        await surface.press('Control+v'); await expect.poll(async () => (await state(doc2)).overlays.length).toBe(2);
        console.log('PASS Edge: actual operating-system image clipboard Ctrl+V imports and places');
        await page.locator('.canvas-overlay').last().click(); await surface.press('Control+c');
        const realToken = await page.evaluate(() => navigator.clipboard.readText()); assert(realToken.startsWith('imagegen-overlay:'));
        await surface.press('Control+v'); await expect.poll(async () => (await state(doc2)).overlays.length).toBe(3);
        console.log('PASS Edge: actual operating-system overlay Ctrl+C / Ctrl+V');
      }
      await page.screenshot({ path: `work/canvas-commands-${engineName}-desktop.png` });
      await page.setViewportSize({ width: 393, height: 950 }); await page.getByRole('button', { name: 'Canvas', exact: true }).click();
      await page.locator('.canvas-overlay').first().click({ button: 'right' });
      await expect(menu).toBeVisible(); assert(await menu.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
      await page.screenshot({ path: `work/canvas-commands-${engineName}-phone.png` });
      assert.deepEqual(errors, []);
      console.log(`PASS ${engineName}: real layer/lock/history persistence, duplicate/nudge/undo, clipboard across orgs, image batch failures/bytes/undo, denied-read fallback, typing and responsive menu`);
    } finally { await browser.close(); }
  }
} finally {
  if (vite) await vite.close();
  if (service && service.exitCode === null) { const exited = new Promise(resolve => service.once('exit', resolve)); service.kill(); await exited; }
}
