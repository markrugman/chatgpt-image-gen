import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve('outputs/responsive-review'), output=path.join(base,'screens');
fs.mkdirSync(output,{recursive:true});
const {url:origin}=JSON.parse(fs.readFileSync(path.join(base,'preview.json'),'utf8'));
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Review captures must use the loopback preview');
const w=await (await fetch(origin+'/api/get_workspace',{method:'POST',headers:{'Content-Type':'application/json','X-Imagegen-Request':'1'},body:'{}'})).json();
const doc=w.documents[0], org=w.organisations[0];
const screens=[['home-desktop',1600,1000],['editor-desktop',1600,1000],['editor-tablet',820,1180],['editor-phone',390,844],['tools-phone',390,844],['chat-phone',390,844],['more-phone',390,844],['export-desktop',1600,1000],['export-phone',390,844]];
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const [name,width,height] of screens){
    const page=await browser.newPage({viewport:{width,height}});
    await page.goto(name==='home-desktop'?origin:`${origin}/#view=projects&org=${org.id}&design=${doc.id}&page=${doc.pages[0].id}`);
    if(name==='home-desktop')await expect(page.getByRole('heading',{name:/^Continue designing/})).toBeVisible();
    else await expect(page.locator('.design-canvas')).toBeVisible();
    if(name==='editor-desktop')await page.locator('.editor-rail').getByRole('button',{name:'Assets',exact:true}).click();
    if(name==='tools-phone'){
      await page.locator('.mobile-editor-views').getByRole('button',{name:'Tools',exact:true}).click();
      await page.locator('.tool-chooser').getByRole('button',{name:'Assets',exact:true}).click();
    }
    if(name==='chat-phone'){
      await page.locator('.mobile-editor-views').getByRole('button',{name:'Chat',exact:true}).click();
      await page.getByRole('textbox',{name:'Design prompt'}).fill('Make a matching 9:16 story image.');
    }
    if(name==='more-phone')await page.getByRole('button',{name:'More document actions'}).click();
    if(name.startsWith('export')){
      await page.getByRole('button',{name:'Export',exact:true}).click();
      await expect(page.getByRole('button',{name:'Export PNG',exact:true})).toBeEnabled();
    }
    await page.screenshot({path:path.join(output,name+'.png')});
    await page.close();
  }
}finally{await browser.close();}
fs.writeFileSync(path.join(base,'review-gallery.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Image Gen local implementation screens</title><style>body{font:16px/1.6 'Segoe UI',sans-serif;color:#282534;background:#f7f7fa;max-width:1200px;margin:32px auto;padding:0 20px}section{background:white;border:1px solid #eae8ef;border-radius:16px;padding:20px;margin:32px 0}img{display:block;max-width:100%;height:auto;border:1px solid #eae8ef}.phone{max-width:390px}.tablet{max-width:620px}a{color:#6540b7}</style><h1>Image Gen local implementation</h1><p>Working application captures · 19 October 2026 · Disposable sample workspace · No release or deployment.</p><p><a href="${origin}">Open local review</a></p>${screens.map(([name,width,height])=>`<section><h2>${name.replaceAll('-',' ')}</h2><p>${width} × ${height} · <a href="screens/${name}.png">Open PNG</a></p><img class="${width===390?'phone':width===820?'tablet':''}" src="screens/${name}.png" alt="Working Image Gen ${name.replaceAll('-',' ')}"></section>`).join('')}</html>`);
console.log(`Captured ${screens.length} actual implementation screens in ${output}`);
