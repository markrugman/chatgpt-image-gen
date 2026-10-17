import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
// Development-only mocked workspace; no production connection or generation.
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

workspace.templateFolders=[{id:'zulu',name:'Zulu',organisationId:'org'},{id:'avatars',name:'Avatars',organisationId:'org'},{id:'empty',name:'Empty folder',organisationId:'org'},{id:'shared-folder',name:'Shared folder',organisationId:null}];
workspace.templates[0].folderId='avatars';
workspace.templates.push({...workspace.templates[0],id:'general-template',name:'General recipe',folderId:'general'});
const server=await preview({preview:{host:'127.0.0.1',port:0,strictPort:false}});
const origin='http://127.0.0.1:'+server.httpServer.address().port;
try {
 for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
  const browser=await engine.launch({...options,headless:true});
  try {for(const width of [320,393,768,1440])for(const theme of ['light','dark']) {
   let w=structuredClone(workspace);const actions=[],errors=[];
   const page=await browser.newPage({viewport:{width,height:1000},...(width<=768?{isMobile:true,hasTouch:true}:{})});page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/web/session',r=>r.fulfill({json:{hasOwner:true,setupNeeded:false}}));
   await page.route('**/health',r=>r.fulfill({json:{service:'image-gen-server',version:'0.9.3'}}));
   await page.route('**/api/*',r=>{const cmd=r.request().url().split('/').pop();if(cmd==='mutate') {
    const a=r.request().postDataJSON().action;actions.push(a);
    if(a.op==='template_folder')w.templateFolders.find(f=>f.id===a.id).name=a.name;
    else if(a.op==='template_folder_delete'){w.templateFolders=w.templateFolders.filter(f=>f.id!==a.id);w.templates=w.templates.map(t=>t.folderId===a.id?{...t,folderId:'general'}:t);}
    else throw Error('Unexpected mutation '+a.op);
   }return r.fulfill({json:cmd==='get_workspace'?w:cmd==='image_data'?image:cmd==='get_jobs'?[]:cmd==='server_status'?{connected:true,online:true,pending:0}:cmd==='connection'?{account:null,capabilities:{}}:{}});});
   await page.goto(origin+'/#view=projects&org=org&design=doc&page=page',{waitUntil:'domcontentloaded'});await expect(page.locator('.editor')).toBeVisible();
   await page.evaluate(theme=>{localStorage.setItem('imagegen-theme',theme);document.documentElement.dataset.theme=theme;},theme);
   if(width<=1024)await page.getByRole('button',{name:'Tools',exact:true}).click();
   await page.locator('.tool-tabs').getByRole('button',{name:'Templates',exact:true}).click();
   const editorUrl=page.url();
   const drawer=page.locator('.editor-library');const folders=drawer.getByLabel('Template folders',{exact:true});
   await expect(folders.locator('.card-name strong')).toHaveText(['General','Avatars','Empty folder','Zulu']);
   await expect(drawer.getByRole('combobox')).toHaveCount(0);await expect(drawer.locator('.icon-button')).toHaveCount(0);
   await expect(drawer.getByRole('button',{name:/Rename folder|Edit folder|Delete folder/})).toHaveCount(0);
   await expect(drawer.locator('.library-image-trigger')).toHaveCount(0);
   assert.equal(await folders.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
   assert(await drawer.evaluate(el=>el.scrollWidth<=el.clientWidth));
   if([393,1440].includes(width))await drawer.screenshot({path:`work/template-folder-drawer-${name}-${width}-${theme}.png`});
   await drawer.getByRole('textbox',{name:'Search templates'}).fill('zulu');await expect(folders.locator('.card-name strong')).toHaveText(['Zulu']);
   await drawer.getByRole('textbox',{name:'Search templates'}).fill('missing');await expect(drawer.getByRole('heading',{name:'No matching folders'})).toBeVisible();
   await drawer.getByRole('textbox',{name:'Search templates'}).fill('');
   await folders.getByRole('button',{name:'Open folder Empty folder',exact:true}).click();await expect(drawer.getByRole('heading',{name:'No matching templates'})).toBeVisible();
   await drawer.getByRole('button',{name:'Folders',exact:true}).click();
   await folders.getByRole('button',{name:'Open folder Avatars',exact:true}).click();await expect(drawer.locator('.library-image-trigger')).toHaveCount(1);
   await drawer.getByRole('button',{name:'Use Portrait recipe',exact:true}).click();await expect(drawer.getByRole('menuitem')).toHaveText(['Use Template','Use and Attach as Style']);
   await page.keyboard.press('Escape');await drawer.getByRole('button',{name:'Folders',exact:true}).click();
   await drawer.getByRole('button',{name:'Shared',exact:true}).click();await expect(folders.locator('.card-name strong')).toHaveText(['General','Shared folder']);
   await folders.getByRole('button',{name:'Open folder Shared folder',exact:true}).click();await expect(drawer.getByRole('button',{name:'Use Shared recipe',exact:true})).toBeVisible();
   await drawer.getByRole('button',{name:'Organisation',exact:true}).click();await expect(folders.locator('.card-name strong')).toHaveText(['General','Avatars','Empty folder','Zulu']);
   assert.equal(actions.length,0,'Drawer browsing must not mutate the workspace');assert.equal(page.url(),editorUrl,'Drawer folders remain local editor tools');
   await folders.getByRole('button',{name:'Open folder Avatars',exact:true}).click();await drawer.getByRole('button',{name:'Use Portrait recipe',exact:true}).click();
   await drawer.getByRole('menuitem',{name:'Use Template',exact:true}).click();await expect(page.locator('.selected-template')).toContainText('Portrait recipe');
   await page.goto(origin+'/#view=templates&org=org');await expect(page.locator('h1')).toHaveText('Templates');
   const library=page.locator('.templates-library');await expect(library.getByRole('button',{name:'Delete folder',exact:true})).toHaveCount(0);
   await library.getByRole('button',{name:'Edit folder Avatars',exact:true}).click();
   let edit=page.getByRole('dialog',{name:'Edit folder',exact:true});await expect(edit.getByRole('button',{name:'Delete folder',exact:true})).toBeVisible();
   assert(await edit.evaluate(el=>el.scrollWidth<=el.clientWidth));
   await edit.getByRole('textbox',{name:'Folder name'}).fill('Portraits');await edit.getByRole('button',{name:'Save folder',exact:true}).click();await expect(edit).toHaveCount(0);
   assert.equal(actions.at(-1).op,'template_folder');assert.equal(actions.at(-1).id,'avatars');assert.equal(actions.at(-1).organisationId,'org');
   await library.getByRole('button',{name:'Edit folder Zulu',exact:true}).click();await edit.getByRole('button',{name:'Delete folder',exact:true}).click();
   const confirm=page.getByRole('dialog',{name:'Delete folder?',exact:true});await expect(confirm).toContainText('move to General');
   await confirm.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(actions.length,1);
   await library.getByRole('button',{name:'Edit folder Zulu',exact:true}).click();await edit.getByRole('button',{name:'Delete folder',exact:true}).click();await confirm.getByRole('button',{name:'Delete folder',exact:true}).click();await expect(confirm).toHaveCount(0);
   assert.equal(actions.at(-1).id,'zulu');assert.equal(actions.at(-1).op,'template_folder_delete');await expect(library.getByRole('button',{name:'Open folder Zulu',exact:true})).toHaveCount(0);
   await library.getByRole('button',{name:'Open folder Portraits',exact:true}).click();await library.getByRole('button',{name:'Edit folder Portraits',exact:true}).click();await edit.getByRole('button',{name:'Delete folder',exact:true}).click();await confirm.getByRole('button',{name:'Delete folder',exact:true}).click();await expect(confirm).toHaveCount(0);
   assert.equal(actions.at(-1).id,'avatars');assert.equal(w.templates[0].folderId,'general');await expect(library.getByLabel('Template folders',{exact:true})).toBeVisible();
   assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${name} ${width} ${theme}: sorted folders, search/back/empty/scope/selection; drawer has no management; library rename and delete correct folder`);
  }}finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.httpServer.close(resolve));}
