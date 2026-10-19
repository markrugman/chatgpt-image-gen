import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startResponsiveReview } from './responsive-review.mjs';

const review=await startResponsiveReview(), output=path.resolve('outputs/responsive-review/floating-tools');
fs.mkdirSync(output,{recursive:true});
const results=[];
try {
 const before=await review.post('get_workspace'),doc=before.documents[0],org=before.organisations[0],asset=before.assets[0];
 for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]) {
  const browser=await engine.launch({...options,headless:true});
  try {
   for(const [width,height] of [[320,740],[390,844],[820,1180],[1280,800],[1600,1000]]) for(const theme of ['light','dark']) {
    const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(theme=>localStorage.setItem('imagegen-theme',theme),theme);
    await page.goto(`${review.origin}/#view=projects&org=${org.id}&design=${doc.id}`);
    const status=page.getByRole('group',{name:'Canvas status and controls'}),canvas=page.locator('.design-canvas');
    await expect(canvas).toBeVisible();
    const within=async(locator,container)=>{
     const a=await locator.boundingBox(),b=await container.boundingBox();
     assert(a&&b&&a.x>=b.x-1&&a.y>=b.y-1&&a.x+a.width<=b.x+b.width+1&&a.y+a.height<=b.y+b.height+1,'Control must stay inside its container');
    };
    for(const title of ['Undo layout or image change','Redo','Zoom out','Fit to window','Zoom in']) await within(page.getByTitle(title,{exact:true}),status);
    await within(status,page.locator('.canvas-workspace'));
    await expect(status.locator('.canvas-page-count')).toHaveAttribute('aria-label','1 of 2 pages');
    const tools=page.locator('.editor-tools');
    if(width<768){await page.locator('.mobile-editor-views').getByRole('button',{name:'Tools',exact:true}).tap();await tools.getByRole('button',{name:'Assets',exact:true}).tap();}
    else await page.locator('.editor-rail').getByRole('button',{name:'Assets',exact:true}).click();
    await tools.getByRole('button',{name:'Use '+asset.name,exact:true}).click();
    if(width>=768&&width<1280)await expect(tools).not.toBeVisible();
    await expect(page.locator('.canvas-overlay')).toHaveCount(1);
    const pill=page.getByRole('toolbar',{name:'Selected image tools'});
    await expect(pill).toBeVisible();await within(pill,page.locator('.canvas-workspace'));
    const p=await pill.boundingBox(),s=await status.boundingBox();assert(p.y+p.height<s.y,'Selected tools must float above the status bar');
    for(const title of ['Bring forward','Remove overlay'])await within(pill.getByTitle(title),pill);
    await within(page.getByRole('slider',{name:'Placement size'}),pill);
    const rotation=page.getByRole('spinbutton',{name:'Overlay rotation'});await rotation.fill('25');await rotation.press('Tab');
    await expect.poll(async()=>{const w=await review.post('get_workspace');const d=w.documents.find(d=>d.id===doc.id),p=d.pages[0];return p.history[p.historyIndex].overlays.at(-1)?.rotation;}).toBe(25);
    await status.getByTitle('Undo layout or image change').click();
    await status.getByTitle('Redo',{exact:true}).click();
    await expect(page.locator('.canvas-overlay')).toHaveCount(1);
    await page.locator('.canvas-overlay').click();await expect(pill).toBeVisible();
    await status.getByTitle('Zoom in',{exact:true}).click();await expect(status.getByTitle('Fit to window')).not.toHaveText('Fit');
    await status.getByTitle('Fit to window').click();await expect(status.getByTitle('Fit to window')).toHaveText('Fit');
    await page.screenshot({path:path.join(output,`${name}-${width}-${theme}.png`)});
    await pill.getByTitle('Remove overlay').click();await expect(page.locator('.canvas-overlay')).toHaveCount(0);await expect(pill).toHaveCount(0);
    await expect.poll(async()=>{const w=await review.post('get_workspace');const p=w.documents.find(d=>d.id===doc.id).pages[0];return p.history[p.historyIndex].overlays.length;}).toBe(0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
    await page.close();results.push({browser:name,width,height,theme,passed:true});
   }
   // Asset workspace keeps preview backgrounds in a floating toolbar too.
   const page=await browser.newPage({viewport:{width:320,height:740}});
   await page.goto(`${review.origin}/#view=assets&org=${org.id}&asset=${asset.id}`);
   const imageTools=page.getByRole('toolbar',{name:'Image tools'});
   await expect(imageTools.getByRole('group',{name:'Asset preview background'})).toBeVisible();
   await imageTools.getByRole('button',{name:'Bright pink preview background',exact:true}).click();
   await expect(page.locator('.design-canvas')).toHaveCSS('background-color','rgb(255, 0, 184)');
   await page.close();console.log(`PASS ${name}: floating controls, placement rotation/remove, bottom Undo/Redo/zoom/pages, narrow bounds, asset preview`);
  }finally{await browser.close();}
 }
 const after=await review.post('get_workspace');assert.deepEqual(after.images,before.images);assert.deepEqual(after.assets,before.assets);
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({passed:true,results},null,2));
}finally{await review.close();}
