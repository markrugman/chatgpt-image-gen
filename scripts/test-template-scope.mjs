import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';

// Isolated built-frontend fixture: no real workspace writes or generation.
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
const server = await preview({preview:{host:'127.0.0.1',port:0}});
const origin = 'http://127.0.0.1:'+server.httpServer.address().port;
try {
 for (const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
 const browser = await engine.launch({...options,headless:true});
 try {for(const width of [393,1440]) {
 const page = await browser.newPage({viewport:{width,height:1000}});
 const actions = [];
 await page.route('**/web/session',r=>r.fulfill({json:{hasOwner:true,setupNeeded:false}}));
 await page.route('**/health',r=>r.fulfill({json:{service:'image-gen-server',version:'0.9.1'}}));
 await page.route('**/api/*',r=>{const cmd=r.request().url().split('/').pop();if(cmd==='mutate') actions.push(r.request().postDataJSON().action);return r.fulfill({json:cmd==='get_workspace'?workspace:cmd==='image_data'?image:cmd==='get_jobs'?[]:cmd==='connection'?{account:null,capabilities:{}}:cmd==='server_status'?{connected:true,online:true,pending:0}:{}});});
 await page.goto(origin+'/#view=templates&org=all');
 const library=page.getByRole('region',{name:'Templates library'}), cards=library.locator('.template-card');
 await expect(cards).toHaveCount(3);
 await expect(library.getByRole('button',{name:'All organisations',exact:true})).toHaveClass('active');
 await library.getByRole('textbox',{name:'Search templates'}).fill('tag1'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Poster recipe');
 await library.getByRole('textbox',{name:'Search templates'}).fill('');
 await library.getByRole('combobox',{name:'Filter templates by folder'}).selectOption('posters'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Poster recipe');
 await library.getByRole('button',{name:'Rename folder',exact:true}).click();
 const rename = page.getByRole('dialog',{name:'Rename folder',exact:true});
 await rename.getByRole('textbox',{name:'Folder name'}).fill('Updated posters');
 await rename.getByRole('button',{name:'Save folder',exact:true}).click(); await expect(rename).toHaveCount(0);
 assert.equal(actions.at(-1).organisationId,'other'); assert.equal(actions.at(-1).id,'posters');
 await library.getByRole('button',{name:'Shared',exact:true}).click(); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Shared recipe');
 await expect(library.getByRole('combobox',{name:'Filter templates by folder'}).locator('option')).toHaveCount(3);
 await library.getByRole('button',{name:'All organisations',exact:true}).click(); await expect(cards).toHaveCount(3);
 await page.getByRole('combobox',{name:'Current organisation'}).selectOption('org'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Portrait recipe');
 await page.getByRole('combobox',{name:'Current organisation'}).selectOption('other'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Poster recipe');
 await page.getByRole('combobox',{name:'Current organisation'}).selectOption('all'); await expect(cards).toHaveCount(3);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.close(); console.log('PASS '+name+' '+width+': all organisations, Shared, search, folders and organisation switching');
 }}finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.httpServer.close(resolve));}
