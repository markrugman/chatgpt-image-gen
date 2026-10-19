import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';

// Run after the isolated-identifier, hidden-window local build in IMPLEMENTATION.md.
const built = path.join(process.env.LOCALAPPDATA, 'ImageGenBuild/target/debug');
const directory = path.resolve('outputs/responsive-review/native');
fs.mkdirSync(directory, { recursive: true });
const executable = path.join(directory, 'Image Gen Review.exe');
fs.copyFileSync(path.join(built, 'image-gen-app.exe'), executable);
if (fs.existsSync(path.join(built,'runtime'))) fs.cpSync(path.join(built,'runtime'), path.join(directory,'runtime'), { recursive:true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-responsive-native-'));
const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));}); });
const child = spawn(executable, [], { windowsHide:true, env:{...process.env, IMAGEGEN_DATA_DIR:root, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}, stdio:'ignore' });
let browser;
try {
  for(let i=0;i<150;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  assert(browser,'Hidden native WebView did not start');
  const page=browser.contexts()[0].pages()[0], errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>!!window.__TAURI_INTERNALS__);
  const invoke=(command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
  const act=action=>invoke('mutate',{action});
  const org=await act({op:'organisation',name:'Native review'});
  const project=await act({op:'project',name:'Responsive workspace',organisationId:org});
  const media=path.resolve('outputs/responsive-review/workspace/media');
  const source=fs.readdirSync(media).filter(file=>file.endsWith('.png')).sort((a,b)=>fs.statSync(path.join(media,b)).size-fs.statSync(path.join(media,a)).size)[0];
  const image=await invoke('capture_composition',{data:fs.readFileSync(path.join(media,source)).toString('base64')});
  await act({op:'document',projectId:project,name:'Native responsive review',width:210,height:297,unit:'mm',sourceImageId:image});
  await page.reload();
  await page.getByRole('button',{name:'Open Native responsive review',exact:true}).click();
  const initial=JSON.stringify(await invoke('get_workspace'));
  const cdp=await browser.contexts()[0].newCDPSession(page);
  for(const [width,height] of [[1600,1000],[820,1180],[390,844],[320,740]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await expect(page.locator('.design-canvas')).toBeVisible();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Native viewport must reflow');
    if(width<768){
      await page.locator('.mobile-editor-views').getByRole('button',{name:'Chat',exact:true}).click();
      await page.getByRole('textbox',{name:'Design prompt'}).fill('Native draft survives tool changes.');
      await page.getByRole('button',{name:'Close Chat',exact:true}).click();
      await page.locator('.mobile-editor-views').getByRole('button',{name:'Tools',exact:true}).click();
      await page.getByRole('button',{name:'Close tools',exact:true}).click();
    }else if(width<1280){
      await page.locator('.editor-rail').getByRole('button',{name:'Assets',exact:true}).click();
      await page.getByRole('button',{name:'Close tools',exact:true}).click();
    }
    await page.getByRole('button',{name:'More document actions'}).click();
    await expect(page.getByRole('dialog',{name:'Document',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.getByRole('button',{name:'Export',exact:true}).click();
    await expect(page.getByRole('button',{name:'Export PNG',exact:true})).toBeEnabled();
    await page.screenshot({path:path.join(directory,`native-${width}-export.png`)});
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.screenshot({path:path.join(directory,`native-${width}-canvas.png`)});
    console.log(`PASS native WebView2 ${width}×${height}: responsive chrome, tools, More and export preview`);
  }
  assert.equal(JSON.stringify(await invoke('get_workspace')),initial,'Layout and previews must not mutate native artwork');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({status:'passed',data:root,viewports:[1600,820,390,320],method:'Actual isolated WebView2 with CDP viewport emulation',errors},null,2));
}finally{await browser?.close();if(child.exitCode===null)child.kill();}
