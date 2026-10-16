import { createServer } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
// Development-server fixtures only: no release build, production access or workspace writes.
const pageData = { id: "page", name: "Page 1", messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
const workspace = {
  formatVersion: 3,
  organisations: [{ id: "org", name: "Test organisation", color: "#8864d7" }],
  projects: [{ id: "project", organisationId: "org", name: "Test project", tags: [] }],
  documents: [{ id: "doc", projectId: "project", name: "Test design", width: 210, height: 297, unit: "mm", pages: [pageData], tags: [], updatedAt: 1 }],
  assets: ["asset", "upload"].map(kind => ({ id: kind, libraryKind: kind, organisationId: "org", name: `Test ${kind}`, tags: [], versions: [], currentVersionId: null, page: { ...pageData, id: `${kind}-page` } })),
  images: [], customSizes: [], handoffs: {}, templates: [],
};

workspace.organisations.push({id:'other',name:'Other organisation',color:'#8864d7'});
workspace.documents[0].pages.push({...pageData,id:'page-two',name:'Page 2'});
workspace.documents.push({...workspace.documents[0],id:'deleted-doc',deletedAt:1});
workspace.assets.push({...workspace.assets[0],id:'shared-asset',name:'Shared asset',organisationId:null});
workspace.templateFolders=[{id:'portraits',name:'Portraits',organisationId:'org'},{id:'shared-folder',name:'Shared folder',organisationId:null},{id:'empty',name:'Empty folder',organisationId:'org'}];
workspace.templates=[{id:'recipe',name:'Portrait recipe',recipe:'A portrait',usageNotes:'',tags:[],exampleImageId:'example',organisationId:'org',folderId:'portraits',version:1},{id:'shared-recipe',name:'Shared recipe',recipe:'Shared',usageNotes:'',tags:[],exampleImageId:'example',organisationId:null,folderId:'shared-folder',version:1}];
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>');
const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:false}});await server.listen();
const origin='http://127.0.0.1:'+server.httpServer.address().port;
try {
 for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
  const browser=await engine.launch({...options,headless:true});
  try { for(const width of [393,1440]) {
   const page=await browser.newPage({viewport:{width,height:950},...(width===393?{isMobile:true,hasTouch:true}:{})});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/web/session',r=>r.fulfill({json:{hasOwner:true,setupNeeded:false}}));
   await page.route('**/health',r=>r.fulfill({json:{service:'image-gen-server',version:'0.9.3'}}));
   await page.route('**/api/*',r=>{const cmd=r.request().url().split('/').pop();assert.notEqual(cmd,'mutate','Navigation must not mutate workspace');return r.fulfill({json:cmd==='get_workspace'?workspace:cmd==='image_data'?image:cmd==='get_jobs'?[]:cmd==='server_status'?{connected:true,online:true,pending:0}:cmd==='connection'?{account:null,capabilities:{}}:{}});});
   const params=()=>new URL(page.url()).hash;
   const waitHash=async text=>expect.poll(params).toContain(text);
   const nav=async title=>{if(width<=1024)await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.locator('.nav-item').filter({has:page.locator('span',{hasText:new RegExp('^'+title+'$')})}).click();};
   const ready=async()=>expect(page.locator('.loading-state')).toHaveCount(0);
   const cases=[
    ['view=home','.creative-hero'],['view=projects','.project-grid'],['view=projects&org=org&project=project','.document-grid'],
    ['view=projects&org=org&project=project&design=doc&page=page','.canvas-workspace'],
    ['view=projects&project=project&design=doc&page=page-two','.canvas-workspace'],
    ['view=assets','.asset-grid'],['view=assets&org=org&asset=asset','.canvas-workspace'],
    ['view=assets&library=shared','.asset-grid'],['view=assets&asset=shared-asset&library=shared','.canvas-workspace'],
    ['view=uploads','.asset-grid'],['view=uploads&asset=upload','.canvas-workspace'],['view=uploads&library=shared','.empty-state'],
    ['view=templates','.templates-library'],['view=templates&org=org&folder=portraits','.template-card'],
    ['view=templates&library=shared&folder=shared-folder','.template-card'],
    ['view=templates&org=org&folder=empty','.empty-state'],
    ['view=templates&org=org&folder=portraits&template=recipe','dialog[aria-label="Edit template"]'],
    ['view=templates&filter=Portrait','.template-card'],['view=projects&q=Test','.search-result'],['view=projects&q=Test&type=asset','.search-result'],['view=trash','.list-card'],
   ];
   for(const [hash,selector] of cases) {
    await page.goto(origin+'/#'+hash);await ready();await expect(page.locator(selector).first()).toBeVisible();
    await expect.poll(params).toContain(hash);
    const canonical=params();await page.reload();await ready();await expect(page.locator(selector).first()).toBeVisible();assert.equal(params(),canonical,'Reload '+hash);
   }
   console.log('PASS '+name+' '+width+': all page/library/project/design/page/folder/template/search direct links and reload');
   await page.goto(origin+'/#view=projects');await ready();
   await nav('Templates');await waitHash('view=templates');const root=page.url();
   await page.getByRole('button',{name:'Open folder Portraits',exact:true}).click();await waitHash('folder=portraits');const folder=page.url();
   await page.locator('.template-card .icon-button').click();await waitHash('template=recipe');const detail=page.url();
   for(const [button,title] of [['Copy to…','Copy template'],['Move to…','Move template']]) {
    await page.getByRole('dialog',{name:'Edit template',exact:true}).getByRole('button',{name:button,exact:true}).click();
    await expect(page.getByRole('dialog',{name:title,exact:true})).toBeVisible();assert.equal(page.url(),detail);
    await page.getByRole('dialog',{name:title,exact:true}).getByRole('button',{name:'Close dialog',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Edit template',exact:true})).toBeVisible();
   }
   await page.getByRole('dialog',{name:'Edit template',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);assert.equal(page.url(),folder);
   await page.goForward();await waitHash('template=recipe');await page.goBack();await expect(page.locator('dialog')).toHaveCount(0);assert.equal(page.url(),folder);
   await page.goBack();await expect(page.getByLabel('Template folders',{exact:true})).toBeVisible();assert.equal(page.url(),root);
   await page.goForward();await waitHash('folder=portraits');await page.goForward();await expect(page.getByRole('dialog',{name:'Edit template',exact:true})).toBeVisible();assert.equal(page.url(),detail);
   await page.goBack();await page.goBack();await page.getByRole('button',{name:'Shared',exact:true}).click();await waitHash('library=shared');
   await page.getByRole('button',{name:'Open folder Shared folder',exact:true}).click();await waitHash('folder=shared-folder');
   await page.goBack();await expect(page.getByLabel('Template folders',{exact:true})).toBeVisible();await page.goBack();await expect(page.locator('.templates-library').getByRole('button',{name:'All organisations',exact:true})).toHaveClass('active');
   await page.getByRole('button',{name:'Open folder Portraits',exact:true}).click();await waitHash('folder=portraits');
   const transientLength=await page.evaluate(()=>history.length);
   await page.locator('.page-heading').getByRole('button',{name:'New template',exact:true}).click();
   await expect(page.getByRole('dialog',{name:'New template',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>history.length),transientLength);
   await page.goBack();await expect(page.locator('dialog')).toHaveCount(0);await expect(page.getByLabel('Template folders',{exact:true})).toBeVisible();
   await page.getByRole('textbox',{name:'Search templates',exact:true}).fill('P');await waitHash('filter=P');const searchLength=await page.evaluate(()=>history.length);
   await page.getByRole('textbox',{name:'Search templates',exact:true}).fill('Portrait');await waitHash('filter=Portrait');assert.equal(await page.evaluate(()=>history.length),searchLength);
   await page.goBack();await expect(page.getByRole('textbox',{name:'Search templates',exact:true})).toHaveValue('');await page.goForward();await expect(page.getByRole('textbox',{name:'Search templates',exact:true})).toHaveValue('Portrait');
   console.log('PASS '+name+' '+width+': folder/detail/scope/filter Back and Forward; search typing coalesces');
   for(const [title,route] of [['Overview','home'],['Projects','projects'],['Asset library','assets'],['Uploads','uploads'],['Templates','templates'],['Trash','trash']]) {
    await page.goto(origin+'/#view=projects&project=project&design=doc&page=page-two');await expect(page.locator('.canvas-workspace')).toBeVisible();
    await nav(title);await waitHash('view='+route);await expect(page.locator('.editor')).toHaveCount(0);
    await page.goBack();await expect(page.locator('.canvas-workspace')).toBeVisible();await waitHash('page=page-two');
    await page.goForward();await expect(page.locator('.editor')).toHaveCount(0);await waitHash('view='+route);
   }
   await page.goto(origin+'/#view=projects&project=project&design=doc&page=page');await expect(page.locator('.canvas-workspace')).toBeVisible();
   if(width<=1024)await page.getByRole('button',{name:'Tools',exact:true}).click();
   const editorUrl=page.url();for(const tab of ['Assets','Uploads','Templates','History','Pages']) {await page.locator('.tool-tabs').getByRole('button',{name:tab,exact:true}).click();assert.equal(page.url(),editorUrl);}
   await page.locator('.pages-panel').getByRole('button',{name:'Page 2',exact:false}).click();await waitHash('page=page-two');await page.goBack();await waitHash('page=page');await page.goForward();await waitHash('page=page-two');
   console.log('PASS '+name+' '+width+': every sidebar destination leaves editor; top tools stay local; page history');
   await page.goto(origin+'/#view=templates&org=org&folder=portraits');await ready();
   await page.getByRole('combobox',{name:'Current organisation'}).selectOption('other');await waitHash('org=other');await expect(page.getByLabel('Template folders',{exact:true})).toBeVisible();
   await page.goBack();await waitHash('folder=portraits');await expect(page.getByRole('combobox',{name:'Current organisation'})).toHaveValue('org');
   await page.goForward();await waitHash('org=other');
   for(const route of ['assets','uploads']) {
    await page.goto(origin+'/#view='+route+'&org=org');await ready();
    await page.locator('.filter-tabs').getByRole('button',{name:'Shared',exact:true}).click();await waitHash('library=shared');
    await page.goBack();await expect(page.locator('.filter-tabs .active')).toHaveText('Test organisation');
    await page.goForward();await expect(page.locator('.filter-tabs .active')).toHaveText('Shared');
   }
   await page.goto(origin+'/#view=projects&q=Test&type=asset');await ready();await expect(page.locator('.filter-tabs .active')).toHaveText('Assets');
   await page.locator('.search-result').filter({hasText:'Test asset'}).click();await waitHash('asset=asset');
   await page.goBack();await waitHash('type=asset');await expect(page.locator('.filter-tabs .active')).toHaveText('Assets');
   await page.goForward();await waitHash('asset=asset');
   await page.keyboard.press('Control+k');await expect(page.getByRole('textbox',{name:'Search workspace',exact:true})).toBeFocused();await expect(page.locator('.editor')).toHaveCount(0);
   console.log('PASS '+name+' '+width+': organisation and asset/upload scopes; filtered search return; Ctrl+K; transient dialogs');
   await page.goto(origin+'/#view=home');await ready();await page.getByRole('textbox',{name:'Search workspace',exact:true}).fill('Test');await waitHash('q=Test');
   await page.locator('.search-result').filter({hasText:'Test design'}).click();await expect(page.locator('.canvas-workspace')).toBeVisible();await page.goBack();await expect(page.getByRole('textbox',{name:'Search workspace',exact:true})).toHaveValue('Test');
   await page.evaluate(()=>location.hash='view=templates&folder=portraits');await expect(page.getByRole('combobox',{name:'Filter templates by folder'})).toHaveValue('portraits');
   await page.goBack();await expect(page.getByRole('textbox',{name:'Search workspace',exact:true})).toHaveValue('Test');
   const invalid=[['view=templates&folder=missing','view=templates'],['view=projects&project=missing','view=projects'],['view=projects&design=deleted-doc','view=projects'],['view=assets&asset=missing','view=assets'],['view=templates&template=missing','view=templates'],['view=projects&org=missing','view=projects'],['view=nonsense','view=home'],['view=projects&design=doc&page=missing','view=projects&project=project&design=doc&page=page']];
   for(const [hash,expected] of invalid) {
    await page.goto(origin+'/#view=trash');await ready();await page.evaluate(hash=>location.hash=hash,hash);await expect.poll(params).toBe('#'+expected);
    await page.goBack();await expect.poll(params).toBe('#view=trash');await page.goForward();await expect.poll(params).toBe('#'+expected);
   }
   assert.deepEqual(errors,[]);await page.close();
   console.log('PASS '+name+' '+width+': workspace search return, live hash links, invalid/deleted targets without history loops; no mutations/errors');
  }}finally{await browser.close();}
 }
}finally{await server.close();}
