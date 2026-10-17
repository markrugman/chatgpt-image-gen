// Real API and UI acceptance against a disposable server/workspace only.
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-templates-'));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC';
fs.writeFileSync(path.join(root,'source.png'),Buffer.from(png,'base64'));
fs.writeFileSync(path.join(root,'provider-mode'),'fail');
fs.writeFileSync(path.join(root,'fixture-runtime.cmd'),`@"${process.execPath}" "${path.resolve('scripts/fixtures/template-runtime.mjs')}" %*\r\n`);
const freePort = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const url = `http://127.0.0.1:${freePort}`;
const executable = path.resolve('server/target/debug/image-gen-server.exe');
let service, browser, context;
const checks = [], errors = [];
const record = name => { checks.push(name); console.log('PASS '+name); };
const start = async () => {
  let failure = '', exit;
  service = spawn(executable, [], { windowsHide: true, env: { ...process.env,
    IMAGEGEN_SERVER_DATA: root, IMAGEGEN_SERVER_LISTEN: `127.0.0.1:${freePort}`, IMAGEGEN_WEB_DIR: path.resolve('dist'),
    IMAGEGEN_WORKER_DATA: path.join(root, 'worker'), IMAGEGEN_WORKER_ENABLED: 'true', IMAGEGEN_CODEX_PATH: path.join(root, 'fixture-runtime.cmd'), IMAGEGEN_TEMPLATE_FIXTURE: root }, stdio: ['ignore','pipe','pipe'] });
  service.stdout.on('data', data => { failure += data; }); service.stderr.on('data', data => { failure += data; });
  service.on('exit', code => { exit = code; });
  let lastHealth;
  for (let i=0;i<100;i++) { try { const response = await fetch(url+'/health', { signal: AbortSignal.timeout(500) }); if (response.ok) return; lastHealth = response.status; } catch(e) { lastHealth = String(e); } await new Promise(r => setTimeout(r, 100)); }
  throw Error(`Disposable server did not start (${exit}, ${lastHealth}): ${failure}`);
};
const headers = { 'X-Imagegen-Request': '1' };
const post = async (command, data = {}, ok = true) => {
  const res = await context.request.post(url+'/api/'+command, { headers, data });
  if (!ok) { assert(!res.ok()); return res.json(); }
  assert(res.ok(), `${command}: ${await res.text()}`); return res.json();
};
const act = async action => post('mutate', { action: { ...action, _base: await post('get_workspace') } });
try {
  await start();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const key = fs.readFileSync(path.join(root, 'server-access-key'), 'utf8').trim();
  assert((await context.request.post(url+'/web/login', { headers, data: { accessKey: key, remember: true } })).ok());
  assert((await context.request.post(url+'/web/owner', { headers, data: { keyOnly: true } })).ok());
  const org=await act({op:'organisation',name:'Transparency QA'}),project=await act({op:'project',name:'Alpha regression',organisationId:org});
  const page=await context.newPage();await page.goto(url);
  const pixels=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.fillStyle='#ef672a';x.fillRect(16,16,32,32);return c.toDataURL('image/png').split(',')[1];});
  const image=await post('capture_composition',{data:pixels}),doc=await act({op:'document',name:'Transparent source',projectId:project,width:64,height:64,unit:'px',sourceImageId:image});
  const w=await post('get_workspace'),p=w.documents.find(d=>d.id===doc).pages[0];
  await page.goto(`${url}/#view=projects&org=${org}&design=${doc}&page=${p.id}`);
  const checks=[];
  for(const format of ['png','jpg']){
    await page.getByRole('button',{name:'Export',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Export your design',exact:true});
    await dialog.getByRole('combobox').first().selectOption(format);
    await expect(dialog.getByRole('button',{name:'Export design',exact:true})).toBeEnabled();
    const filePromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Export design',exact:true}).click();const file=await filePromise;
    const out=path.join(root,'result.'+format);await file.saveAs(out);
    const data=fs.readFileSync(out).toString('base64');const stats=await page.evaluate(async({format,data})=>{const i=new Image();i.src='data:image/'+(format==='jpg'?'jpeg':format)+';base64,'+data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const a=x.getImageData(0,0,1,1).data;return [...a,...x.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data];},{format,data});
    assert.equal(stats[3],format==='png'?0:255,`${format} corner alpha: ${stats}`);assert(stats[7]>0 && stats[4]>200 && stats[5]<160,'Artwork must remain visible');checks.push({format,corner:stats.slice(0,4),centre:stats.slice(4)});
  }
  await expect(page.locator('.design-canvas')).toHaveClass(/checker/);
  fs.mkdirSync('outputs/transparency',{recursive:true});fs.writeFileSync('outputs/transparency/acceptance.json',JSON.stringify({passed:true,checks,workspace:root},null,2));
  console.log('PASS PNG preserves alpha, JPEG remains opaque and canvas shows transparency');
} finally {await browser?.close();service?.kill();}
