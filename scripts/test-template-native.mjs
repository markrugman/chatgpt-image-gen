// Run after the isolated identifier/hidden-window build documented in docs/TEMPLATES.md.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'imagegen-template-native-'));
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
try{
  let page=await launch();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const act=action=>invoke('mutate',{action});
  const org=await act({op:'organisation',name:'Native template acceptance'});
  const project=await act({op:'project',name:'Avatars',organisationId:org});
  const imageId=await invoke('capture_composition',{data:'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC'});
  const doc=await act({op:'document',name:'Native avatar',projectId:project,width:1080,height:1080,unit:'px',sourceImageId:imageId});
  const templateId=await act({op:'template_save',name:'Native vector',recipe:'Vector portrait of the Subject. Blue circle.',exampleImageId:imageId,organisationId:org,tags:['avatar'],usageNotes:'Attach Subject photos.'});
  const w=await invoke('get_workspace');const target={kind:'document',id:doc,pageId:w.documents[0].pages[0].id};
  const t=w.templates.find(t=>t.id===templateId);
  const preview=await invoke('preview_template',{request:{target,template:t,prompt:'Use navy',mode:'generate',references:[`image:${imageId}`],referencePurposes:[{reference:`image:${imageId}`,purpose:'Subject',explanation:'Face'}],transparent:false}});
  assert(preview.instructions.includes('Image 1 — Subject — Face'));
  assert(preview.instructions.includes('1080 × 1080 px'));
  console.log('PASS native IPC template storage and canonical request preview');
  await page.reload();await page.locator('.document-card').first().click();
  await page.getByRole('textbox',{name:'Design prompt'}).fill('Keep details /templates');
  await expect(page.getByRole('dialog',{name:'Templates',exact:true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Shared',exact:true}).click();
  // Select owner scope after opening native workspace from All organisations.
  await page.getByRole('dialog').getByRole('button',{name:'Organisation',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Open folder General',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Use Native vector',exact:true}).click();
  await page.getByRole('menuitem',{name:'Use Template',exact:true}).click();
  await expect(page.locator('.selected-template')).toContainText('Native vector');
  await expect(page.getByRole('textbox',{name:'Design prompt'})).toHaveValue('Keep details ');
  console.log('PASS hidden native WebView /templates picker, selection and preview');
  const original=JSON.stringify(await invoke('get_workspace'));
  await browser.close();browser=null;child.kill();await new Promise(resolve=>child.once('exit',resolve));
  page=await launch();
  assert.equal(JSON.stringify(await invoke('get_workspace')),original);
  assert.deepEqual(errors,[]);
  fs.writeFileSync('outputs/templates-native-acceptance.json',JSON.stringify({status:'passed',workspace:root,errors,date:new Date().toISOString()},null,2));
  console.log('PASS native restart retains templates and existing media');
}finally{await browser?.close();child?.kill();await vite.close();}
