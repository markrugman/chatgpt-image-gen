import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';

// Compiled UI + real isolated storage/worker + deterministic provider protocol.
// Real ChatGPT qualification is separate from this fault-injection fixture.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'imagegen-inline-regions-'));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const backend=`http://127.0.0.1:${port}`,log=path.join(root,'requests.jsonl'),runtime=path.join(root,'fixture.exe');
execFileSync(path.join(os.homedir(),'.cargo/bin/rustc.exe'),['scripts/fixtures/annotation-runtime.rs','-o',runtime]);
const png='iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOIqjjxHx9mGBkKAHcjpkGplMQ6AAAAAElFTkSuQmCC';
let service,vite;
try {
  service=spawn(path.resolve('server/target/debug/image-gen-server.exe'),[],{windowsHide:true,env:{...process.env,IMAGEGEN_SERVER_DATA:root,IMAGEGEN_SERVER_LISTEN:`127.0.0.1:${port}`,IMAGEGEN_WORKER_DATA:path.join(root,'worker'),IMAGEGEN_WORKER_ENABLED:'true',IMAGEGEN_CODEX_PATH:runtime,ANNOTATION_RUNTIME_SCRIPT:path.resolve('scripts/fixtures/annotation-runtime.mjs'),ANNOTATION_RUNTIME_LOG:log,IMAGEGEN_WEB_DIR:path.join(root,'unused')},stdio:'ignore'});
  await expect.poll(async()=>{try{return(await fetch(backend+'/health')).status;}catch{return 0;}},{timeout:15000}).toBe(200);
  const opts={host:'127.0.0.1',port:0,proxy:Object.fromEntries(['/api','/web','/health'].map(prefix=>[prefix,{target:backend,changeOrigin:true,configure:proxy=>proxy.on('proxyReq',r=>{if(r.hasHeader('origin'))r.setHeader('origin',backend);})}]))};
  vite=await preview({preview:opts});const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
    const browser=await engine.launch({...options,headless:true});
    try {
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),headers={'X-Imagegen-Request':'1'};
      assert((await context.request.post(origin+'/web/login',{headers,data:{accessKey:fs.readFileSync(path.join(root,'server-access-key'),'utf8').trim(),remember:true}})).ok());
      if((await(await context.request.get(origin+'/web/session')).json()).setupNeeded)assert((await context.request.post(origin+'/web/owner',{headers,data:{keyOnly:true}})).ok());
      const post=async(command,data={})=>{const r=await context.request.post(origin+'/api/'+command,{headers,data});assert(r.ok(),`${command}: ${await r.text()}`);return r.json();};
      const act=async action=>post('mutate',{action:{...action,_base:await post('get_workspace')}});
      const org=await act({op:'organisation',name:name+' Inline QA'}),project=await act({op:'project',name:'QA',organisationId:org});
      const base=await post('capture_composition',{data:png});
      const doc=await act({op:'document',name:'Inline regions',projectId:project,width:1000,height:800,unit:'px',sourceImageId:base});
      const upload=await post('import_asset_data',{name:name+' Phone',organisationId:null,replaceId:null,data:png});
      let w=await post('get_workspace');const source=w.assets.find(a=>a.id===upload),version=source.currentVersionId;
      const target={kind:'document',id:doc,pageId:w.documents.find(d=>d.id===doc).pages[0].id};
      const readPage=async()=>(await post('get_workspace')).documents.find(d=>d.id===doc).pages[0];
      const original={id:'one',assetVersionId:version,x:8,y:18,width:25,height:30,rotation:25};
      await act({op:'overlays',target,overlays:[original,{...original,id:'two',x:60,locked:true}]});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+`/#view=projects&org=${org}&design=${doc}`,{waitUntil:'domcontentloaded'});
      const canvas=page.locator('.design-canvas'),menu=page.getByRole('menu',{name:'Canvas actions',exact:true});
      await expect(page.getByRole('button',{name:/^Annotate/})).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
      const openMenu=async(key='background')=>{if(key==='background')await canvas.click({button:'right',position:{x:5,y:60}});else await page.locator(`[data-overlay-id="${key}"]`).click({button:'right'});await expect(menu).toBeVisible();};
      const edit=async(key='background')=>{await openMenu(key);await menu.getByRole('menuitem',{name:'Edit',exact:true}).click();await expect(page.locator('.region-draw-surface')).toBeVisible();};
      const draw=async(text,key='background')=>{
        const r=await canvas.boundingBox();
        const a=key==='background'?{x:.42,y:.35}:{x:.15,y:.28},b=key==='background'?{x:.85,y:.8}:{x:.25,y:.38};
        await page.mouse.move(r.x+r.width*a.x,r.y+r.height*a.y);await page.mouse.down();await page.mouse.move(r.x+r.width*b.x,r.y+r.height*b.y,{steps:6});await page.mouse.up();
        const input=page.getByRole('textbox',{name:'Region instruction',exact:true});await expect(input).toBeFocused();await input.fill(text);await input.press('Enter');
        await expect(input).not.toBeVisible();
      };
      await edit();await draw('Change the entire phone screen background to red');await draw('Keep the black phone frame');
      await page.screenshot({path:`work/inline-edit-${name}-canvas.png`});
      await page.getByRole('button',{name:'Done',exact:true}).click();
      await expect(page.locator('.region-edit-pills > span')).toHaveCount(2);
      await openMenu('one');await expect(menu.getByRole('menuitem',{name:'Edit',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
      const before=await readPage();assert.equal(before.regionNotes.length,2);assert(before.regionNotes.every(n=>n.targetKey==='background'));
      // Neither mixing nor silently replacing the target may bypass the UI.
      const wrong={...before.regionNotes[0],id:'wrong',targetKey:'one',sourceImageId:source.versions[0].imageId};
      for(const notes of [[...before.regionNotes,wrong],[wrong]]) {
        const r=await context.request.post(origin+'/api/mutate',{headers,data:{action:{op:'annotation_notes',target,notes,_base:await post('get_workspace')}}});assert.equal(r.status(),400);
      }
      await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('.region-edit-pills > span')).toHaveCount(2);
      // General instructions and explicit references use the existing composer.
      const prompt=page.getByRole('textbox',{name:'Design prompt',exact:true});
      await prompt.fill('/upload');
      const picker=page.getByRole('dialog',{name:'Choose an upload',exact:true});
      await picker.getByRole('button',{name:'Shared',exact:true}).click();
      await picker.getByRole('button',{name:'Use '+name+' Phone',exact:true}).click();
      await picker.getByRole('menuitem',{name:'Add as…',exact:true}).press('ArrowRight');
      await picker.getByRole('menuitem',{name:'Subject',exact:true}).press('Enter');
      await expect(picker).not.toBeVisible();await prompt.fill('Keep the lighting unchanged.');
      const history=before.history;await page.getByRole('button',{name:'Generate image',exact:true}).click();
      await expect(page.getByRole('button',{name:'Apply edit',exact:true})).toBeEnabled({timeout:20000});
      let p=await readPage();assert.equal(p.editBatch.items.length,1);assert.equal(p.editBatch.instructions,'Keep the lighting unchanged.');assert.equal(p.editBatch.references.length,1);assert.equal(p.editBatch.referencePurposes[0].purpose,'Subject');assert.deepEqual(p.history,history);
      await page.getByRole('button',{name:'Original',exact:true}).click();await page.getByRole('button',{name:'Edited',exact:true}).click();
      await page.getByRole('button',{name:'Apply edit',exact:true}).click();await expect(page.locator('.region-edit-pills > span')).toHaveCount(0);
      p=await readPage();assert.equal(p.historyIndex,before.historyIndex+1);assert.deepEqual(p.history[p.historyIndex].overlays,history[before.historyIndex].overlays);
      // All pills removed releases the target; one rotated placement can now be edited.
      await edit('one');await draw('FAIL_ONCE Make the phone bright green','one');await page.getByRole('button',{name:'Done',exact:true}).click();
      await openMenu();await expect(menu.getByRole('menuitem',{name:'Edit',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
      await prompt.fill('Preserve transparency.');await page.getByRole('button',{name:'Generate image',exact:true}).click();
      await expect(page.getByText('Intentional fixture failure',{exact:true})).toBeVisible({timeout:20000});await page.getByRole('button',{name:'Retry edit',exact:true}).click();
      await expect(page.getByRole('button',{name:'Apply edit',exact:true})).toBeEnabled({timeout:20000});
      const beforeAssets=(await post('get_workspace')).assets.length;await page.getByRole('button',{name:'Apply edit',exact:true}).click();
      await expect(page.locator('.region-edit-pills > span')).toHaveCount(0);w=await post('get_workspace');p=await readPage();
      const overlays=p.history[p.historyIndex].overlays;assert.notEqual(overlays[0].assetVersionId,version);assert.equal(overlays[1].assetVersionId,version);assert.equal(overlays[0].rotation,25);assert.equal(w.assets.length,beforeAssets+1);assert.deepEqual(w.assets.find(a=>a.id===upload),source);
      await act({op:'history',target,direction:'undo'});assert.equal((await readPage()).history[(await readPage()).historyIndex].overlays[0].assetVersionId,version);await act({op:'history',target,direction:'redo'});
      await page.reload({waitUntil:'domcontentloaded'});
      await edit();await draw('SLOW recolour the phone');await page.getByRole('button',{name:'Done',exact:true}).click();await prompt.fill('Retain these extra instructions after discard.');
      await page.getByRole('button',{name:'Generate image',exact:true}).click();await expect(page.getByRole('button',{name:'Stop request',exact:true})).toBeVisible();await page.getByRole('button',{name:'Stop request',exact:true}).click();
      await expect(page.getByRole('button',{name:'Discard result',exact:true})).toBeEnabled({timeout:15000});await page.getByRole('button',{name:'Discard result',exact:true}).click();
      await expect(prompt).toHaveValue('Retain these extra instructions after discard.');await page.getByRole('button',{name:'Remove instruction 1',exact:true}).click();await expect(page.locator('.region-edit-pills > span')).toHaveCount(0);
      await openMenu('one');await expect(menu.getByRole('menuitem',{name:'Edit',exact:true})).toBeEnabled();await page.keyboard.press('Escape');
      await openMenu('two');await expect(menu.getByRole('menuitem',{name:'Edit',exact:true})).toBeDisabled();await page.keyboard.press('Escape');
      assert.deepEqual(errors,[]);
      // Mobile entry uses the existing long-press menu, then the same in-canvas input.
      const touch=await browser.newContext({storageState:await context.storageState(),viewport:{width:393,height:900},hasTouch:true});
      console.log(`${name}: testing mobile long press and inline input`);
      const tp=await touch.newPage();tp.on('pageerror',e=>errors.push(e.message));await tp.goto(origin+`/#view=projects&org=${org}&design=${doc}`,{waitUntil:'domcontentloaded'});
      await tp.getByRole('button',{name:'Canvas',exact:true}).click();
      const cr=await tp.locator('.design-canvas').boundingBox(),x=cr.x+cr.width*.85,y=cr.y+cr.height*.85;
      if(name==='Edge') {
        const cdp=await touch.newCDPSession(tp);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await new Promise(r=>setTimeout(r,650));await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      } else {
        await tp.locator('.design-canvas').dispatchEvent('pointerdown',{pointerId:91,pointerType:'touch',isPrimary:true,button:0,buttons:1,clientX:x,clientY:y});await new Promise(r=>setTimeout(r,650));await tp.locator('.design-canvas').dispatchEvent('pointerup',{pointerId:91,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y});
      }
      const tm=tp.getByRole('menu',{name:'Canvas actions',exact:true});await expect(tm).toBeVisible();await tm.getByRole('menuitem',{name:'Edit',exact:true}).tap();
      await expect(tp.locator('.region-draw-surface')).toBeVisible();
      const r=await tp.locator('.design-canvas').boundingBox();
      if(name==='Edge') {
        const cdp=await touch.newCDPSession(tp);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.4,y:r.y+r.height*.35,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*.8,y:r.y+r.height*.75,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      } else {await tp.mouse.move(r.x+r.width*.4,r.y+r.height*.35);await tp.mouse.down();await tp.mouse.move(r.x+r.width*.8,r.y+r.height*.75,{steps:4});await tp.mouse.up();}
      await tp.getByRole('textbox',{name:'Region instruction',exact:true}).fill('Mobile phone edit');await tp.getByRole('button',{name:'Add',exact:true}).tap();
      try { await expect(tp.getByRole('textbox',{name:'Region instruction',exact:true})).not.toBeVisible(); }
      catch(e) { console.error(name, await tp.locator('.region-inline-instruction').innerText(), 'saved notes:',(await readPage()).regionNotes?.length);await tp.screenshot({path:`work/inline-edit-${name}-mobile-failure.png`});throw e; }
      await expect.poll(async()=>(await readPage()).regionNotes?.length).toBe(1);
      await tp.getByRole('button',{name:'Done',exact:true}).tap();
      await expect(tp.locator('.region-edit-pills > span')).toBeVisible();
      for(const theme of ['light','dark']) {await tp.evaluate(t=>document.documentElement.dataset.theme=t,theme);await tp.screenshot({path:`work/inline-edit-${name}-${theme}.png`});}
      await tp.getByRole('button',{name:'Remove instruction 1',exact:true}).tap();
      await touch.close();assert.deepEqual(errors,[]);
      const requests=fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);assert(requests.some(r=>r.input.some(i=>i.type==='text'&&i.text.includes('Keep the lighting unchanged.'))));
      const referenced=requests.find(r=>r.input.some(i=>i.type==='text'&&i.text.includes('Keep the lighting unchanged.')));assert.equal(referenced.input.filter(i=>i.type==='localImage').length,2);assert(referenced.input.some(i=>i.type==='text'&&i.text.includes('Subject')));
      console.log(`PASS ${name}: canvas context Edit, inline regions, chat pills, server-enforced one-item lock/release, extra instructions, saved drafts, retry/apply/undo, cancel/discard, rotated placement and mobile long press`);
    } finally {await browser.close();}
  }
} finally {if(vite)await vite.close();if(service&&service.exitCode===null){const done=new Promise(r=>service.once('exit',r));service.kill();await done;}}
