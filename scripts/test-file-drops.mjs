import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';

// Compiled UI, real import/storage and disposable data. No user workspace or credentials.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'imagegen-file-drops-'));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const backend=`http://127.0.0.1:${port}`;
let service,vite;
try {
  service=spawn(path.resolve('server/target/debug/image-gen-server.exe'),[],{windowsHide:true,env:{...process.env,IMAGEGEN_SERVER_DATA:root,IMAGEGEN_SERVER_LISTEN:`127.0.0.1:${port}`,IMAGEGEN_WORKER_ENABLED:'false',IMAGEGEN_WEB_DIR:path.join(root,'unused')},stdio:'ignore'});
  await expect.poll(async()=>{try{return(await fetch(backend+'/health')).status;}catch{return 0;}},{timeout:15000}).toBe(200);
  vite=await preview({preview:{host:'127.0.0.1',port:0,proxy:Object.fromEntries(['/api','/web','/health'].map(prefix=>[prefix,{target:backend,changeOrigin:true,configure:proxy=>proxy.on('proxyReq',r=>{if(r.hasHeader('origin'))r.setHeader('origin',backend);})}]))}});
  const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
  for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
    if(process.env.DROP_ENGINE&&process.env.DROP_ENGINE!==name)continue;
    const browser=await engine.launch({...options,headless:true});
    try {
      const context=await browser.newContext({viewport:{width:1600,height:1000}}),headers={'X-Imagegen-Request':'1'};
      assert((await context.request.post(origin+'/web/login',{headers,data:{accessKey:fs.readFileSync(path.join(root,'server-access-key'),'utf8').trim()}})).ok());
      if((await(await context.request.get(origin+'/web/session')).json()).setupNeeded)assert((await context.request.post(origin+'/web/owner',{headers,data:{keyOnly:true}})).ok());
      const post=async(command,data={})=>{const r=await context.request.post(origin+'/api/'+command,{headers,data});assert(r.ok(),`${command}: ${await r.text()}`);return r.json();};
      const act=async action=>post('mutate',{action:{...action,_base:await post('get_workspace')}});
      const org=await act({op:'organisation',name:name+' File QA'}),project=await act({op:'project',name:'QA',organisationId:org});
      const doc=await act({op:'document',name:'File drop',projectId:project,width:1000,height:1000,unit:'px'});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=40;c.getContext('2d').fillRect(0,0,80,40);return c.toDataURL('image/jpeg').split(',')[1];});
      const raw=Buffer.from(jpeg,'base64'),exif=Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000','hex');
      const length=Buffer.alloc(2);length.writeUInt16BE(exif.length+2);
      const portrait=Buffer.concat([raw.subarray(0,2),Buffer.from([255,225]),length,exif,raw.subarray(2)]);
      const upload=await post('import_asset_data',{name:'Phone portrait',organisationId:org,replaceId:null,data:portrait.toString('base64')});
      const w=await post('get_workspace'),p=w.documents.find(d=>d.id===doc).pages[0],target={kind:'document',id:doc,pageId:p.id};
      const read=async()=>(await post('get_workspace')).documents.find(d=>d.id===doc).pages[0];
      await page.goto(origin+`/#view=projects&org=${org}&design=${doc}`,{waitUntil:'domcontentloaded'});
      const canvas=page.locator('.design-canvas'),surface=page.locator('.canvas-scroll');await expect(canvas).toBeVisible();
      const external=async(locator,files)=>{
        const box=await locator.boundingBox();
        if(name==='Edge') {
          const paths=files.map(f=>{const file=path.join(root,f.name);fs.writeFileSync(file,Buffer.from(f.data,'base64'));return file;});
          const client=await context.newCDPSession(page),data={items:[],files:paths,dragOperationsMask:1};
          for(const type of ['dragEnter','dragOver','drop'])await client.send('Input.dispatchDragEvent',{type,x:box.x+box.width/2,y:box.y+box.height/2,data});
          await client.detach();return;
        }
        await locator.evaluate((el,{files,x,y})=>{const dt=new DataTransfer();for(const f of files)dt.items.add(new File([Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))],f.name,{type:f.type}));for(const type of ['dragenter','dragover','drop'])el.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt,clientX:x,clientY:y}));},{files,x:box.x+box.width/2,y:box.y+box.height/2});
      };
      if(!process.env.DROP_CASE||process.env.DROP_CASE==='orientation') {
        await page.locator('.tool-tabs').getByRole('button',{name:'Uploads',exact:true}).click();
        await page.getByRole('button',{name:'Use Phone portrait',exact:true}).dragTo(canvas);
        await expect(page.locator('.canvas-overlay')).toHaveCount(1);
        const source=await page.locator('.canvas-overlay img').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
        assert.deepEqual(source,{width:40,height:80},'Fixture must exercise EXIF display rotation');
        const box=await page.locator('.canvas-overlay').boundingBox();
        assert(Math.abs(box.width/box.height-.5)<.01,`Displayed portrait must keep 1:2 proportions; got ${box.width/box.height}`);
        await act({op:'history',target,direction:'undo'});await page.reload();await expect(page.locator('.canvas-overlay')).toHaveCount(0);
      }
      if(!process.env.DROP_CASE||process.env.DROP_CASE==='canvas') {
        await external(canvas,[{name:'Dropped portrait.jpg',type:'image/jpeg',data:portrait.toString('base64')}]);
        await expect(page.locator('.canvas-overlay')).toHaveCount(1,{timeout:5000});
        const saved=await read(),workspace=await post('get_workspace'),placed=saved.history[saved.historyIndex].overlays[0];
        const asset=workspace.assets.find(a=>a.versions.some(v=>v.id===placed.assetVersionId));
        assert.equal(asset.name,'Dropped portrait');assert.equal(asset.libraryKind,'upload');assert.equal(asset.organisationId,org);
        const box=await page.locator('.canvas-overlay').boundingBox();assert(Math.abs(box.width/box.height-.5)<.01,'External file keeps oriented proportions');
        const source=asset.versions.find(v=>v.id===placed.assetVersionId).imageId;
        const data=await post('image_data',{imageId:source});assert(Buffer.from(data.split(',')[1],'base64').equals(portrait),'Original bytes retained');
        await expect(page.getByRole('button',{name:'Undo layout or image change',exact:true})).toBeEnabled();
        await surface.press('Control+z');await expect(page.locator('.canvas-overlay')).toHaveCount(0);
        assert((await post('get_workspace')).assets.some(a=>a.id===asset.id),'Undo keeps Upload');
        await surface.press('Control+Shift+z');await expect(page.locator('.canvas-overlay')).toHaveCount(1);
        await expect(page.getByRole('button',{name:'Undo layout or image change',exact:true})).toBeEnabled();
        const batchBefore=await read(),assetsBefore=(await post('get_workspace')).assets.length;
        await external(canvas,[{name:'Batch A.jpg',type:'image/jpeg',data:portrait.toString('base64')},{name:'Broken.jpg',type:'image/jpeg',data:Buffer.from('not an image').toString('base64')},{name:'Batch B.jpg',type:'image/jpeg',data:portrait.toString('base64')}]);
        await expect(page.locator('.canvas-overlay')).toHaveCount(3);
        await expect(page.getByRole('button',{name:'Undo layout or image change',exact:true})).toBeEnabled();
        assert.equal((await read()).historyIndex,batchBefore.historyIndex+1,'Batch is a single undo step');
        assert.equal((await post('get_workspace')).assets.length,assetsBefore+2,'Failed file preserves successful uploads only');
        await expect(page.getByRole('status').filter({hasText:'Broken.jpg'})).toBeVisible();
        await surface.press('Control+z');await expect(page.locator('.canvas-overlay')).toHaveCount(1);
        await page.reload();await expect(page.locator('.canvas-overlay')).toHaveCount(1);
      }
      const beforeLibrary=await read(),libraryAssets=(await post('get_workspace')).assets.length;
      await page.locator('aside.sidebar').getByRole('button',{name:'Uploads',exact:true}).click();
      await expect(page.locator('.page-heading h1')).toHaveText('Uploads');
      await external(page.locator('main'),[{name:'Library portrait.jpg',type:'image/jpeg',data:portrait.toString('base64')}]);
      await expect.poll(async()=>(await post('get_workspace')).assets.length).toBe(libraryAssets+1);
      assert.deepEqual(await read(),beforeLibrary,'Library drops do not change the open design');
      assert.deepEqual(errors,[]);console.log(`PASS ${name}: ${process.env.DROP_CASE||'file drop and EXIF portrait'} real-storage regression`);
    } finally {await browser.close();}
  }
} finally {if(vite)await vite.close();if(service&&service.exitCode===null){const done=new Promise(r=>service.once('exit',r));service.kill();await done;}}
