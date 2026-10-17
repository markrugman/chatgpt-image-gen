// Run after the isolated identifier/hidden-window build documented in docs/TEMPLATES.md.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'imagegen-canvas-native-'));
const runtime=path.resolve('src-tauri/target/debug/runtime');fs.mkdirSync(runtime,{recursive:true});
for(const name of ['codex.exe','codex-code-mode-host.exe'])fs.copyFileSync(path.resolve('outputs/Image Gen 0.8.5 Portable/runtime',name),path.join(runtime,name));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const vite=await createServer({server:{host:'localhost',port:1420,strictPort:true}});await vite.listen();
let child,browser;
const launch=async()=>{
  child=spawn(path.resolve('src-tauri/target/debug/image-gen-app.exe'),[],{windowsHide:true,env:{...process.env,IMAGEGEN_DATA_DIR:root,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`},stdio:'ignore'});
  for(let i=0;i<150;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert(browser,'Native WebView debugging endpoint did not start');
  const page=browser.contexts()[0].pages()[0];await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
  return page;
};
try {
  let page = await launch();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const invoke = (command, args = {}) => page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const act = action => invoke('mutate', { action });
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC';
  const org = await act({ op: 'organisation', name: 'Native Canvas' });
  const project = await act({ op: 'project', name: 'Canvas', organisationId: org });
  const doc = await act({ op: 'document', name: 'Native canvas acceptance', projectId: project, width: 1000, height: 800, unit: 'px' });
  const upload = await invoke('import_asset_data', { name: 'Native source', organisationId: org, data: png, replaceId: null });
  let w = await invoke('get_workspace');
  const version = w.assets.find(a => a.id === upload).currentVersionId;
  const target = { kind: 'document', id: doc, pageId: w.documents.find(d => d.id === doc).pages[0].id };
  await act({ op: 'overlays', target, overlays: [{ id: 'one', assetVersionId: version, x: 10, y: 10, width: 25, height: 25, rotation: 0 }] });
  await page.reload(); await page.locator('.document-card').first().click();
  await page.locator('.canvas-overlay').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Lock', exact: true }).click();
  await expect.poll(async () => { const w = await invoke('get_workspace'); const p = w.documents[0].pages[0]; return p.history[p.historyIndex].overlays[0].locked; }).toBe(true);
  await page.reload(); await page.locator('.document-card').first().click();
  await expect(page.locator('.canvas-overlay')).toHaveClass(/locked/);
  await page.locator('.canvas-overlay').click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Unlock', exact: true }).click();
  const surface = page.locator('.canvas-scroll'); await surface.focus(); await surface.press('Control+d');
  await expect(page.locator('.canvas-overlay')).toHaveCount(2);
  await surface.press('Delete'); await expect(page.locator('.canvas-overlay')).toHaveCount(1);
  await surface.press('Control+z'); await expect(page.locator('.canvas-overlay')).toHaveCount(2);
  await surface.evaluate((el, png) => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(png), c => c.charCodeAt(0))], 'Native-pasted.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, png);
  await expect(page.locator('.canvas-overlay')).toHaveCount(3);
  w = await invoke('get_workspace');
  assert.equal(w.assets.filter(a => a.libraryKind === 'upload').length, 2);
  const pasted = w.assets.find(a => a.name === 'Native-pasted'); assert.equal(pasted.organisationId, org);
  assert.equal(await invoke('image_data', { imageId: pasted.versions.find(v => v.id === pasted.currentVersionId).imageId }), 'data:image/png;base64,' + png);
  await surface.press('Control+z'); await expect(page.locator('.canvas-overlay')).toHaveCount(2);
  assert.equal((await invoke('get_workspace')).assets.length, 2);
  await page.locator('.tool-tabs').getByRole('button', { name: 'Uploads', exact: true }).click();
  await expect(page.locator('.editor-library .library-image-grid > *').first()).toHaveAttribute('aria-label', 'Upload images');
  await page.screenshot({ path: 'work/v096/native-canvas.png' });
  assert.deepEqual(errors, []);
  console.log('PASS hidden native WebView/IPC: context lock/reload, duplicate/delete/undo, canvas image paste exact bytes/organisation, placement-only undo and Uploads first card');
} finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null) child.kill();
  await vite.close();
}
