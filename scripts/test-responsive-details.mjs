import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startResponsiveReview } from './responsive-review.mjs';
const review=await startResponsiveReview();
const output=path.resolve('outputs/responsive-review/verification');
try {
  const w=await review.post('get_workspace'), doc=w.documents[0], org=w.organisations[0];
  for(const [name,engine,options] of [['Edge',chromium,{channel:'msedge'}],['WebKit',webkit,{}]]){
    const browser=await engine.launch({...options,headless:true});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844}});
      await page.goto(`${review.origin}/#view=projects&org=${org.id}&design=${doc.id}`);
      const dock=page.locator('.mobile-editor-views'), tools=page.locator('.editor-tools');
      await dock.getByRole('button',{name:'Tools',exact:true}).click();
      await tools.getByRole('button',{name:'Templates',exact:true}).click();
      await tools.getByRole('button',{name:'Open folder General',exact:true}).click();
      await tools.getByRole('button',{name:'Use Evening event poster',exact:true}).click();
      await tools.getByRole('menuitem',{name:'Use Template',exact:true}).click();
      await expect(page.locator('.chat-panel')).toBeVisible();
      await expect(page.locator('.selected-template')).toContainText('Evening event poster');
      await page.getByRole('textbox',{name:'Design prompt'}).fill('Keep my keyboard draft.');
      // Simulate reduced visual-viewport space; physical keyboard behaviour is a later device check.
      await page.evaluate(()=>{
        Object.defineProperty(visualViewport,'height',{configurable:true,value:480});
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await expect.poll(()=>page.locator('.editor').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(480);
      await expect(page.getByRole('textbox',{name:'Design prompt'})).toHaveValue('Keep my keyboard draft.');
      await page.getByRole('button',{name:'Generate image',exact:true}).scrollIntoViewIfNeeded();
      const submit=await page.getByRole('button',{name:'Generate image',exact:true}).boundingBox();
      assert(submit.y+submit.height<=480,'Submit must remain above the simulated keyboard');
      await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});
      await page.getByRole('button',{name:'Remove template',exact:true}).click();
      await page.getByRole('button',{name:'Close Chat',exact:true}).click();
      await page.getByRole('button',{name:'More document actions',exact:true}).click();
      await page.screenshot({path:path.join(output,`${name}-390-more.png`)});
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button',{name:'More document actions',exact:true})).toBeFocused();
      await dock.getByRole('button',{name:'Tools',exact:true}).click();
      await page.locator('.editor-sheet-backdrop').click({position:{x:10,y:10}});
      await expect(tools).not.toBeVisible();
      await dock.getByRole('button',{name:'Pages',exact:true}).click();
      await tools.locator('.page-tile').nth(1).click();
      await expect(page.locator('.canvas-status')).toContainText('2 of 2 pages');
      await expect(tools).not.toBeVisible();
      await page.goBack();
      await expect(page.locator('.canvas-status')).toContainText('1 of 2 pages');
      assert.deepEqual((await review.post('get_workspace')).images,w.images);
      console.log(`PASS ${name}: Template selection, keyboard-space simulation, modal focus return, backdrop dismissal, page-switch Back; source artwork unchanged`);
    }finally{await browser.close();}
  }
  fs.writeFileSync(path.join(output,'detail-results.json'),JSON.stringify({status:'passed',physicalKeyboard:'not tested',checks:['Template selection','480px visual viewport','draft preservation','send control visibility','More focus return','backdrop dismissal']},null,2));
}finally{await review.close();}
