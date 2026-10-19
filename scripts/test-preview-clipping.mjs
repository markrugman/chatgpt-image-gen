import { preview } from 'vite';
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const svg=color=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${color}"/></svg>`);
const placements=[
 {id:'left',x:-20,y:40,width:40,height:20,rotation:0},
 {id:'right',x:80,y:40,width:40,height:20,rotation:0},
 {id:'top',x:40,y:-20,width:20,height:40,rotation:0},
 {id:'bottom',x:60,y:80,width:40,height:40,rotation:0},
 {id:'rotated',x:82,y:75,width:35,height:35,rotation:45},
].map(o=>({...o,assetVersionId:'original-version'}));
const page={id:'page',name:'Page 1',messages:[],revisions:[],history:[{imageId:'background',revisionId:null,overlays:placements}],historyIndex:0};
const workspace={formatVersion:3,organisations:[{id:'org',name:'Studio',color:'#7753cb'}],projects:[{id:'project',organisationId:'org',name:'Preview test',tags:[]}],documents:[['portrait',100,200],['square',100,100],['landscape',200,100]].map(([id,width,height],i)=>({id,projectId:'project',name:id,width,height,unit:'px',pages:[{...page,id:id+'-page'}],tags:[],updatedAt:3-i})),assets:[{id:'asset',organisationId:'org',name:'Original',tags:[],versions:[{id:'original-version',imageId:'asset-image'}],currentVersionId:'original-version',page}],images:[{id:'background',width:100,height:100,mime:'image/svg+xml'},{id:'asset-image',width:100,height:100,mime:'image/svg+xml'}],customSizes:[],handoffs:{},templateFolders:[],templates:[]};
const original=structuredClone(workspace),output='outputs/preview-clipping';fs.mkdirSync(output,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:0}}),origin=`http://127.0.0.1:${server.httpServer.address().port}`,results=[];
try {
 for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
  const browser=await engine.launch({...options,headless:true});
  try {
   for(const width of [390,1600]) for(const theme of ['light','dark']) {
    const browserPage=await browser.newPage({viewport:{width,height:1000}});
    await browserPage.addInitScript(theme=>localStorage.setItem('imagegen-theme',theme),theme);
    await browserPage.route('**/web/session',r=>r.fulfill({json:{hasOwner:true,setupNeeded:false}}));
    await browserPage.route('**/health',r=>r.fulfill({json:{service:'image-gen-server',version:'0.11.0'}}));
    await browserPage.route('**/api/*',r=>{
     const command=r.request().url().split('/').pop();assert.notEqual(command,'mutate','Preview checks must never write');
     return r.fulfill({json:command==='get_workspace'?workspace:command==='image_data'?svg(r.request().postDataJSON().imageId==='asset-image'?'#ff00b8':'#1289bd'):command==='get_jobs'?[]:command==='connection'?{account:null,capabilities:{}}:command==='server_status'?{connected:true,online:true,pending:0}:{}});
    });
    await browserPage.goto(origin+'/#view=home&org=all');
    await expect(browserPage.locator('.document-preview .card-composition')).toHaveCount(3);
    for(const composition of await browserPage.locator('.card-composition').all()) {
     await expect(composition).toHaveCSS('overflow','hidden');
     await expect(composition.locator('.card-overlay')).toHaveCount(5);
    }
    for(const composition of await browserPage.locator('.document-preview .card-composition').all()) {
     await composition.scrollIntoViewIfNeeded();
     const inspect=()=>composition.evaluate(el=>{
      const r=el.getBoundingClientRect();
      const points=[[r.left-3,r.top+r.height*.5],[r.right+3,r.top+r.height*.5],[r.left+r.width*.5,r.top-3],[r.left+r.width*.8,r.bottom+3]];
      return points.map(([x,y])=>document.elementFromPoint(x,y)?.classList.contains('card-overlay')||false);
     });
     assert.deepEqual(await inspect(),[false,false,false,false],'Off-page portions must not paint/hit outside the page');
     await composition.evaluate(el=>el.style.overflow='visible');
     assert((await inspect()).some(Boolean),'The fixture must reproduce the old off-page overflow');
     await composition.evaluate(el=>el.style.removeProperty('overflow'));
     assert.deepEqual(await inspect(),[false,false,false,false]);
    }
    await browserPage.screenshot({path:`${output}/${name}-${width}-${theme}.png`,fullPage:true});
    results.push({browser:name,width,theme,passed:true});await browserPage.close();
   }
   console.log(`PASS ${name}: Home/design/project composition clipping, four edges and rotation, source placement data unchanged`);
  } finally {await browser.close();}
 }
 assert.deepEqual(workspace,original);fs.writeFileSync(output+'/results.json',JSON.stringify({passed:true,results},null,2));
} finally {await new Promise(resolve=>server.httpServer.close(resolve));}
