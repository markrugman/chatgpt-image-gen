import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Isolated development-frontend fixture: no real workspace writes or generation.
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#bda1f5"/><circle cx="200" cy="100" r="70" fill="#6540b7"/></svg>');
const workspace = {
  formatVersion: 3, organisations: [{ id: 'org', name: 'Creative Studio', color: '#8864d7' }, {id:'other',name:'Other Studio',color:'#7654cf'}],
  projects: [], documents: [], assets: [],
  images: [{ id: 'image', width: 400, height: 200, mime: 'image/svg+xml' }], customSizes: [], handoffs: {}, templateFolders: [],
  templates: [],
};

workspace.templateFolders = [{id:'portraits',name:'Portraits',organisationId:'org'}, {id:'posters',name:'Posters',organisationId:'other'}, {id:'shared-folder',name:'Shared folder',organisationId:null}];
workspace.templates = ['org','other',null].map((organisationId,i) => ({id:'t'+i,name:['Portrait recipe','Poster recipe','Shared recipe'][i],organisationId,folderId:['portraits','posters','shared-folder'][i],recipe:'Recipe '+i,tags:['tag'+i],usageNotes:'Notes',exampleImageId:'image',version:1}));
workspace.templates.push({...workspace.templates[0],id:'deleted',name:'Deleted recipe',deletedAt:1});
const server = await preview({preview:{host:'127.0.0.1',port:0,strictPort:false}});
const origin = 'http://127.0.0.1:'+server.httpServer.address().port;
try {
 for (const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
 const browser = await engine.launch({...options,headless:true});
 try {for(const width of [320,393,1440]) {
 const page = await browser.newPage({viewport:{width,height:1000}});
 const actions = [];
 await page.route('**/web/session',r=>r.fulfill({json:{hasOwner:true,setupNeeded:false}}));
 await page.route('**/health',r=>r.fulfill({json:{service:'image-gen-server',version:'0.9.1'}}));
 await page.route('**/api/*',r=>{const cmd=r.request().url().split('/').pop();if(cmd==='mutate') actions.push(r.request().postDataJSON().action);return r.fulfill({json:cmd==='get_workspace'?workspace:cmd==='image_data'?image:cmd==='get_jobs'?[]:cmd==='connection'?{account:null,capabilities:{}}:cmd==='server_status'?{connected:true,online:true,pending:0}:{}});});
 await page.goto(origin+'/#view=templates&org=all',{waitUntil:'domcontentloaded'});
 const library=page.getByRole('region',{name:'Templates library'}), cards=library.locator('.template-card');
 await expect(cards).toHaveCount(3);
 for (const theme of ['light','dark']) {
 await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
 const folderGrid = library.getByLabel('Template folders', {exact:true});
 await expect(folderGrid.locator('.project-card')).toHaveCount(4);
 const posterFolder = folderGrid.locator('.project-card').filter({has:page.getByRole('button',{name:'Open folder Posters',exact:true})});
 await expect(posterFolder).toContainText('Other Studio');
 await expect(posterFolder).toContainText('1 template');
 await expect(posterFolder.locator('.project-paper')).toHaveCount(1);
 const portraitFolder = folderGrid.locator('.project-card').filter({has:page.getByRole('button',{name:'Open folder Portraits',exact:true})});
 await expect(portraitFolder).toContainText('1 template'); // Excludes the trashed template.
 await expect(portraitFolder.locator('.project-paper')).toHaveCount(1);
 assert(await folderGrid.evaluate(grid => [...grid.children].every(card => {
 const a=grid.getBoundingClientRect(), b=card.getBoundingClientRect();
 return b.left>=a.left && b.right<=a.right+1;
 })));
 await page.screenshot({path:`work/template-folders-${name}-${width}-${theme}.png`});
 await posterFolder.getByRole('button',{name:'Open folder Posters',exact:true}).click();
 await expect(folderGrid).toHaveCount(0);
 await expect(cards).toHaveCount(1);
 await expect(cards).toContainText('Poster recipe');
 await expect(library.getByRole('heading',{name:'Posters',exact:false})).toContainText('Posters');
 await library.getByRole('button',{name:'All templates',exact:true}).click();
 await folderGrid.getByRole('button',{name:'Open folder General',exact:true}).click();
 await expect(cards).toHaveCount(0);
 await library.getByRole('button',{name:'All templates',exact:true}).click();
 }
 await expect(library.getByRole('button',{name:'All organisations',exact:true})).toHaveClass('active');
 await library.getByRole('textbox',{name:'Search templates'}).fill('tag1'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Poster recipe');
 await library.getByRole('textbox',{name:'Search templates'}).fill('');
 await library.getByRole('combobox',{name:'Filter templates by folder'}).selectOption('posters'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Poster recipe');
 await library.getByRole('button',{name:'Edit folder Posters',exact:true}).click();
 const rename = page.getByRole('dialog',{name:'Edit folder',exact:true});
 await rename.getByRole('textbox',{name:'Folder name'}).fill('Updated posters');
 await rename.getByRole('button',{name:'Save folder',exact:true}).click(); await expect(rename).toHaveCount(0);
 assert.equal(actions.at(-1).organisationId,'other'); assert.equal(actions.at(-1).id,'posters');
 await library.getByRole('button',{name:'Shared',exact:true}).click(); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Shared recipe');
 await expect(library.getByLabel('Template folders',{exact:true}).locator('.project-card')).toHaveCount(2);
 await expect(library.getByRole('combobox',{name:'Filter templates by folder'}).locator('option')).toHaveCount(3);
 await library.getByRole('button',{name:'All organisations',exact:true}).click(); await expect(cards).toHaveCount(3);
 await page.getByRole('combobox',{name:'Current organisation'}).selectOption('org'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Portrait recipe');
 await expect(library.getByLabel('Template folders',{exact:true}).locator('.project-card')).toHaveCount(2);
 await page.getByRole('combobox',{name:'Current organisation'}).selectOption('other'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Poster recipe');
 await page.getByRole('combobox',{name:'Current organisation'}).selectOption('all'); await expect(cards).toHaveCount(3);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.close(); console.log('PASS '+name+' '+width+': all organisations, Shared, search, folders and organisation switching');
 }}finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.httpServer.close(resolve));}
