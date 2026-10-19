import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

// A loopback-only preview with disposable storage and a disabled generation worker.
// The private preview session stays in this process; it never uses a real workspace.
export async function startResponsiveReview({ directory, port = 0 } = {}) {
  const root = directory || fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-responsive-'));
  fs.mkdirSync(root, { recursive: true });
  const backendPort = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); }); });
  const backend = `http://127.0.0.1:${backendPort}`;
  const service = spawn(path.resolve('server/target/debug/image-gen-server.exe'), [], { windowsHide: true, env: {
    ...process.env, IMAGEGEN_SERVER_DATA: root, IMAGEGEN_SERVER_LISTEN: `127.0.0.1:${backendPort}`, IMAGEGEN_WORKER_DATA: path.join(root, 'worker'), IMAGEGEN_WORKER_ENABLED: 'false', IMAGEGEN_WEB_DIR: path.join(root, 'unused-web'),
  }, stdio: ['ignore', 'ignore', 'ignore'] });
  let vite;
  const close = async () => { if (vite) await new Promise(resolve => vite.httpServer.close(resolve)); service.kill(); };
  try {
    let healthy = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(backend + '/health')).ok) { healthy = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!healthy) throw Error('Disposable review server did not start');
    const headers = { 'Content-Type': 'application/json', 'X-Imagegen-Request': '1', Origin: backend };
    const login = await fetch(backend + '/web/login', { method: 'POST', headers, body: JSON.stringify({ accessKey: fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim(), remember: true }) });
    if (!login.ok) throw Error('Disposable review login failed');
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    headers.Cookie = cookie;
    const session = await (await fetch(backend + '/web/session', { headers })).json();
    if (session.setupNeeded) {
      const owner = await fetch(backend + '/web/owner', { method: 'POST', headers, body: JSON.stringify({ keyOnly: true }) });
      if (!owner.ok) throw Error('Disposable owner setup failed');
    }
    const post = async (command, data = {}) => {
      const response = await fetch(backend + '/api/' + command, { method: 'POST', headers, body: JSON.stringify(data) });
      if (!response.ok) throw Error(`${command}: ${await response.text()}`);
      return response.json();
    };
    const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
    let workspace = await post('get_workspace');
    if (!workspace.documents.length) {
      const browser = await chromium.launch({ channel: 'msedge', headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        await page.goto(pathToFileURL(path.resolve('docs/design-study-2026-10-19/examples/mockups.html')).href + '?screen=editor-desktop');
        const org = await act({ op: 'organisation', name: 'Courtyard review', color: '#7753cb' });
        const project = await act({ op: 'project', name: 'Autumn campaign', organisationId: org });
        for (const [name, variant] of [['After Hours · Friday', ''], ['Summer drinks', 'blue'], ['Botanical evening', 'green'], ['Golden hour', 'gold']]) {
          await page.locator('.canvas .poster').evaluate((element, variant) => { element.className = `poster ${variant}`; }, variant);
          const png = await page.locator('.canvas .poster').screenshot();
          const image = await post('capture_composition', { data: png.toString('base64') });
          await act({ op: 'document', projectId: project, name, width: 210, height: 297, unit: 'mm', sourceImageId: image });
        }
        const assetData = await page.locator('.assetpreview svg').first().evaluate(async element => {
          const source = new Image(); source.src = 'data:image/svg+xml,' + encodeURIComponent(new XMLSerializer().serializeToString(element));
          await source.decode(); const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 240;
          canvas.getContext('2d').drawImage(source, 0, 0, 160, 240); return canvas.toDataURL('image/png').split(',')[1];
        });
        const upload = await post('import_asset_data', { name: 'Citrus cocktail', organisationId: org, data: assetData, replaceId: null });
        await act({ op: 'save_as_asset', id: upload });
        await act({ op: 'template_save', name: 'Evening event poster', organisationId: org, recipe: 'Design an evening event poster. Use a warm plum and orange palette.', tags: ['poster'], usageNotes: 'A reusable prompt, not an editable page layout.' });
      } finally { await browser.close(); }
      workspace = await post('get_workspace');
      await act({ op: 'page', id: workspace.documents[0].id });
      workspace = await post('get_workspace');
    }
    if (!workspace.templates?.length) {
      await act({ op: 'template_save', name: 'Evening event poster', organisationId: workspace.organisations[0].id, recipe: 'Create an evening event poster with warm plum and orange colours.', tags: ['poster'], usageNotes: 'A reusable prompt.' });
    }
    if (workspace.documents[0].pages.length === 1) await act({ op: 'page', id: workspace.documents[0].id });
    workspace = await post('get_workspace');
    const proxy = Object.fromEntries(['/api', '/web', '/health'].map(prefix => [prefix, {
      target: backend, changeOrigin: true,
      configure: proxy => proxy.on('proxyReq', request => { request.setHeader('origin', backend); request.setHeader('cookie', cookie); }),
    }]));
    vite = await preview({ preview: { host: '127.0.0.1', port, strictPort: !!port, proxy } });
    return { origin: `http://127.0.0.1:${vite.httpServer.address().port}`, root, post, act, workspace, close };
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/responsive-review.mjs')) {
  const review = await startResponsiveReview({ directory: path.resolve('outputs/responsive-review/workspace'), port: 4175 });
  fs.writeFileSync('outputs/responsive-review/preview.json', JSON.stringify({ url: review.origin, pid: process.pid, data: review.root, worker: 'disabled' }, null, 2));
  console.log(`Local responsive review: ${review.origin}\nDisposable sample workspace; generation worker disabled.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await review.close(); process.exit(0); });
}
