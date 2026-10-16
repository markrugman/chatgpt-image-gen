// Continues UI acceptance using only the disposable fixture from test-template-generation.mjs.
import { chromium, webkit, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const fixture = JSON.parse(fs.readFileSync('outputs/templates-live/result.json','utf8'));
assert(path.basename(fixture.workspace).startsWith('imagegen-template-live-'));
const root = fixture.workspace;
const savedName = `Saved from first revision ${Date.now()}`;
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0,'127.0.0.1',() => { const p=s.address().port; s.close(() => resolve(p)); }); });
const url = `http://127.0.0.1:${port}`;
const service = spawn(path.resolve('server/target/debug/image-gen-server.exe'),[],{ windowsHide:true, env:{ ...process.env, IMAGEGEN_SERVER_DATA:root, IMAGEGEN_SERVER_LISTEN:`127.0.0.1:${port}`, IMAGEGEN_WEB_DIR:path.resolve('dist'), IMAGEGEN_WORKER_DATA:path.join(root,'worker'), IMAGEGEN_WORKER_ENABLED:'false' }, stdio:'ignore' });
let browser;
const headers = { 'X-Imagegen-Request':'1' };
try {
  for(let i=0;i<100;i++){try{if((await fetch(url+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser = await chromium.launch({channel:'msedge',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const key=fs.readFileSync(path.join(root,'server-access-key'),'utf8').trim();
  assert((await context.request.post(url+'/web/login',{headers,data:{accessKey:key,remember:true}})).ok());
  const post=async(command,data={})=>{const r=await context.request.post(url+'/api/'+command,{headers,data});assert(r.ok(),await r.text());return r.json();};
  const act=async action=>post('mutate',{action:{...action,_base:await post('get_workspace')}});
  let w=await post('get_workspace'); const doc=w.documents[0], p=doc.pages[0], org=w.projects.find(x=>x.id===doc.projectId).organisationId;
  await act({op:'overlays',target:{kind:'document',id:doc.id,pageId:p.id},overlays:[{id:'overlay-acceptance',assetVersionId:w.assets[0].currentVersionId,x:8,y:8,width:25,height:25,rotation:0}]});
  const editorURL=`${url}/#view=projects&org=${org}&design=${doc.id}&page=${p.id}`;
  const page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(editorURL);
  await expect(page.locator('.design-canvas img').first()).toBeVisible();
  await page.getByRole('button',{name:'Save as template',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('textbox',{name:'Recipe',exact:true})).toHaveValue(/Make the illustrated outlines a little thicker/);
  await page.getByRole('dialog').getByText('Review source conversation and references',{exact:true}).click();
  await expect(page.locator('.template-source')).toContainText('navy circle');
  const previewImage=await page.getByRole('dialog').locator('.template-example img').getAttribute('src');
  assert.equal(previewImage,await post('image_data',{imageId:p.revisions[1].imageId}));
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await post('get_workspace')).templates.length,w.templates.length);
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('button',{name:'Save revision as template',exact:true}).last().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('textbox',{name:'Recipe',exact:true})).toHaveValue(/Create a clean flat vector avatar/);
  await expect(dialog.getByRole('textbox',{name:'Recipe',exact:true})).toHaveValue(/Use a navy circle background/);
  await dialog.getByLabel('Name',{exact:true}).fill(savedName);
  const correctFirst=await post('image_data',{imageId:p.revisions[0].imageId});
  assert.equal(await dialog.locator('.template-example img').getAttribute('src'),correctFirst);
  await dialog.getByRole('button',{name:'Save template',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  w=await post('get_workspace'); const saved=w.templates.find(t=>t.name===savedName);
  assert(saved && saved.exampleImageId===p.revisions[0].imageId);
  assert(!('references' in saved));
  console.log('PASS T02/T03 current/earlier revision creation, source review, recipe+override and cancel');

  const snapshot=await(await context.request.get(url+'/v1/workspace',{headers})).json();
  const changed=structuredClone(snapshot.workspace);
  changed.documents.find(d=>d.id===doc.id).width=600;
  const update=await context.request.put(url+'/v1/workspace',{headers,data:{serverId:snapshot.serverId,baseWorkspace:snapshot.workspace,workspace:changed}});assert(update.ok(),await update.text());
  await page.reload();
  await page.locator('.template-record summary').first().click();
  await page.getByRole('button',{name:'Reuse these instructions',exact:true}).click();
  await expect(page.locator('.selected-template')).toContainText('Historical output was 1080 × 1080 px');
  await expect(page.getByRole('button',{name:'Generate image',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Use current document settings',exact:true}).click();
  // The worker is disabled, but choosing settings still resolves the composer gate.
  await expect(page.locator('.selected-template [role="alert"]')).toHaveCount(0);
  console.log('PASS T14/T15 historical input restoration with explicit output-setting resolution');

  await page.getByRole('button',{name:'Remove template',exact:true}).click();
  await page.getByRole('textbox',{name:'Design prompt'}).fill('Retain instructions /templates');
  await expect(page.getByRole('dialog',{name:'Templates',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Design prompt'})).toBeFocused();
  await expect(page.getByRole('textbox',{name:'Design prompt'})).toHaveValue('Retain instructions ');
  console.log('PASS T23 keyboard Escape restores composer focus and preserves draft');

  await page.goto(`${url}/#view=templates&org=${org}`);
  const card=page.locator('.template-card').filter({has:page.getByText(savedName,{exact:true})});
  await card.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Name',{exact:true}).fill('Cancelled rename');
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(card).toBeVisible();
  await card.getByRole('button',{name:'Duplicate',exact:true}).click();
  await expect(page.getByText(`Copy of ${savedName}`,{exact:true})).toBeVisible();
  const copy=page.locator('.template-card').filter({hasText:`Copy of ${savedName}`});
  await copy.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Recipe',exact:true}).fill('Independent copy recipe');
  await page.getByRole('dialog').getByRole('button',{name:'Save template',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  w=await post('get_workspace');
  assert(w.templates.find(t=>t.id===saved.id).recipe.includes('Create a clean flat vector avatar'));
  assert.equal(w.templates.find(t=>t.name===`Copy of ${savedName}`).recipe,'Independent copy recipe');
  console.log('PASS T11 edit cancel, duplicate and independent saved edits');

  await page.screenshot({path:'outputs/templates-live/library.png',fullPage:true});
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:1000});await page.goto(editorURL);
    if(width<=1024)await page.getByRole('button',{name:'Chat',exact:true}).click();
    await page.getByRole('textbox',{name:'Design prompt'}).fill('/templates');
    await expect(page.getByRole('dialog',{name:'Templates',exact:true})).toBeVisible();
    await page.getByRole('dialog').getByRole('button',{name:'Use Flat vector acceptance',exact:true}).click();
    await page.getByRole('menuitem',{name:'Use Template',exact:true}).click();
    await expect(page.locator('.selected-template')).toBeVisible();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Editor overflow at ${width}`);
    await page.getByRole('button',{name:'Generate image',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button',{name:'Generate image',exact:true})).toBeInViewport();
    await page.screenshot({path:`outputs/templates-live/composer-${width}.png`,fullPage:true});
  }
  console.log('PASS T23 picker and selected composer at 390/768/1440px');
  assert.deepEqual(errors,[]);
  // WebKit uses the same real server, not mocked API responses.
  const safari=await webkit.launch({headless:true});
  try{
    const sc=await safari.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    assert((await sc.request.post(url+'/web/login',{headers,data:{accessKey:key,remember:true}})).ok());
    const sp=await sc.newPage();sp.on('pageerror',e=>errors.push(e.message));await sp.goto(editorURL);
    await sp.getByRole('button',{name:'Chat',exact:true}).click();await sp.getByRole('textbox',{name:'Design prompt'}).fill('/templates');
    await sp.getByRole('dialog').getByRole('button',{name:'Use Flat vector acceptance',exact:true}).click();
    await sp.getByRole('menuitem',{name:'Use and Attach as Style',exact:true}).click();
    await expect(sp.locator('.selected-template')).toBeVisible();
    await expect(sp.locator('.reference-chips > span').filter({hasText:'Page image'})).toHaveAttribute('data-purpose','Style');
    assert(await sp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }finally{await safari.close();}
  assert.deepEqual(errors,[]);
  console.log('PASS real-server mobile WebKit /templates, Style attachment and no overflow/errors');
  fs.writeFileSync('outputs/templates-live/history-acceptance.json',JSON.stringify({status:'passed',errors,date:new Date().toISOString()},null,2));
}finally{await browser?.close();service.kill();}
