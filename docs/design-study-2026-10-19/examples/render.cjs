// Render the standalone proposal; does not launch or modify Image Gen.
const { chromium } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const screens = [
  ['home-desktop',1600,1000,'Home'],
  ['editor-desktop',1600,1000,'Desktop editor'],
  ['editor-tablet',820,1180,'Tablet editor'],
  ['editor-phone',390,844,'Phone canvas'],
  ['tools-phone',390,844,'Phone Assets sheet'],
  ['more-phone',390,844,'Phone document menu'],
  ['export-desktop',1600,1000,'Export panel'],
  ['chat-phone',390,844,'Phone Chat sheet'],
];
(async()=>{
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const checks = [];
  for(const [name,width,height] of screens){
    const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname,'mockups.html')).href+'?screen='+name);
    await page.screenshot({path:path.join(__dirname,name+'.png')});
    const layout=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],poster:(()=>{const r=document.querySelector('.canvas .artwrap')?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null})()}));
    checks.push({name,...layout,errors});
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname,'render-checks.json'),JSON.stringify(checks,null,2)+'\n');
  fs.writeFileSync(path.join(__dirname,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Image Gen example screens</title><style>body{font:16px/1.6 'Segoe UI',sans-serif;background:#f7f7fa;color:#282534;max-width:1200px;margin:40px auto;padding:0 24px}h1{letter-spacing:-1px}a{color:#6540b7}section{margin:40px 0;background:white;border:1px solid #eae8ef;border-radius:16px;padding:24px}img{max-width:100%;height:auto;display:block;border:1px solid #eae8ef;margin:16px 0}img.phone{max-width:390px}img.tablet{max-width:620px}</style><h1>Image Gen example screens</h1><p>19 October 2026 · Design proposal. Static illustrations with fictional artwork; controls are illustrative.</p><p><a href="../DESIGN-BRIEF.md">Design Brief</a> · <a href="../SPEC-SHEET.md">Spec Sheet</a> · <a href="mockups.html">HTML source preview</a></p>${screens.map(([n,w,h,title])=>`<section><h2>${title}</h2><p>${w} × ${h} CSS pixels · <a href="${n}.png">Open PNG</a> · <a href="mockups.html?screen=${n}">Open HTML at your window size</a></p><img class="${w===390?'phone':w===820?'tablet':''}" src="${n}.png" alt="Proposed ${title.toLowerCase()} for Image Gen"></section>`).join('')}</html>`);
  console.log(JSON.stringify(checks,null,2));
  if(checks.some(x=>x.errors.length||x.document[0]>x.viewport[0]||x.document[1]>x.viewport[1])) process.exitCode=1;
})();
