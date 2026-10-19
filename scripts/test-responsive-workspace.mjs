import { chromium, webkit, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startResponsiveReview } from './responsive-review.mjs';

// Real disposable storage and compiled UI. No real account, workspace or provider calls.
const review = await startResponsiveReview();
const output = path.resolve('outputs/responsive-review/verification');
fs.mkdirSync(output, { recursive: true });
const results = [];
try {
  const baseline = await review.post('get_workspace');
  const doc = baseline.documents[0], org = baseline.organisations[0], asset = baseline.assets.find(a => a.libraryKind !== 'upload');
  assert(asset, 'Seeded asset must be available');
  const url = `${review.origin}/#view=projects&org=${org.id}&design=${doc.id}&page=${doc.pages[0].id}`;
  for (const [name, engine, options] of [['Edge', chromium, { channel: 'msedge' }], ['WebKit', webkit, {}]]) {
    const browser = await engine.launch({ ...options, headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const dock = page.locator('.mobile-editor-views');
      const tools = page.locator('.editor-tools'), chat = page.locator('.chat-panel');
      const openChat = async width => {
        if (await chat.isVisible()) return;
        if (width < 768) await dock.getByRole('button', { name: 'Chat', exact: true }).click();
        else if (width < 1280) await page.locator('.editor-rail').getByRole('button', { name: /^Chat/ }).click();
        await expect(chat).toBeVisible();
      };
      const openAssets = async width => {
        if (width < 768) {
          await dock.getByRole('button', { name: 'Tools', exact: true }).click();
          await tools.getByRole('button', { name: 'Assets', exact: true }).click();
        } else await page.locator('.editor-rail').getByRole('button', { name: 'Assets', exact: true }).click();
        await expect(tools).toBeVisible();
      };
      for (const theme of ['light', 'dark']) for (const [width, height] of [[320,740],[390,844],[820,1180],[1024,760],[1280,800],[1600,1000]]) {
        await page.setViewportSize({ width, height });
        await page.goto(url);
        await expect(page.locator('.design-canvas')).toBeVisible();
        await page.evaluate(theme => { localStorage.setItem('imagegen-theme', theme); document.documentElement.dataset.theme = theme; }, theme);
        await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'More document actions' })).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${width}: outer overflow`);
        if (width >= 1280) {
          await expect(chat).toBeVisible();
          if (await tools.isVisible()) await tools.getByRole('button', { name: 'Close tools' }).click();
          await expect(tools).not.toBeVisible();
        } else await expect(tools).not.toBeVisible();
        await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-canvas.png`) });
        await openChat(width);
        await page.getByRole('textbox', { name: 'Design prompt' }).fill('Keep this draft and its references.');
        if (width < 1280) {
          await expect(chat).toHaveAttribute('role', 'dialog');
          await expect(chat).not.toHaveAttribute('aria-modal', 'true');
          await page.keyboard.press('Shift+Tab');
          assert(await page.evaluate(() => !!document.activeElement.closest('.chat-panel, .editor-rail, .mobile-editor-views')), 'Focus must remain in the sheet or drawer navigation');
          await page.getByRole('button', { name: 'Close Chat' }).click();
        }
        await openAssets(width);
        await page.getByRole('textbox', { name: 'Search assets' }).fill('Citrus');
        await expect(tools.getByRole('button', { name: 'Use Citrus cocktail', exact: true })).toBeVisible();
        if (width < 768) {
          await tools.getByRole('button', { name: 'Expand sheet' }).click();
          await expect(page.locator('.editor')).toHaveClass(/sheet-expanded/);
          await tools.getByRole('button', { name: 'Collapse sheet' }).click();
          await tools.getByRole('button', { name: 'Use Citrus cocktail', exact: true }).click({ button: 'right' });
          await tools.getByRole('menuitem', { name: 'Add as…', exact: true }).click();
          await tools.getByRole('menuitem', { name: 'Other', exact: true }).click();
        } else {
          await tools.getByRole('button', { name: 'Use Citrus cocktail', exact: true }).click({ button: 'right' });
          await tools.getByRole('menuitem', { name: 'Add as…', exact: true }).click();
          await tools.getByRole('menuitem', { name: 'Style', exact: true }).click();
        }
        await expect(chat).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Design prompt' })).toHaveValue('Keep this draft and its references.');
        await expect(chat.locator('.reference-chips')).toContainText('Citrus cocktail');
        if (width < 1280) await page.getByRole('button', { name: 'Close Chat' }).click();
        else await tools.getByRole('button', { name: 'Close tools' }).click();
        await openAssets(width);
        await expect(page.getByRole('textbox', { name: 'Search assets' })).toHaveValue('Citrus');
        await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-tools.png`) });
        if (width < 1280) {
          await page.goBack();
          await expect(tools).not.toBeVisible();
          await expect(page.locator('.design-canvas')).toBeVisible();
        } else await tools.getByRole('button', { name: 'Close tools' }).click();
        await page.getByRole('button', { name: 'More document actions' }).click();
        await expect(page.getByRole('dialog', { name: 'Document', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Rename and manage', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Edit design', exact: true })).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        await expect(page.locator('.export-panel')).toBeVisible();
        await expect(page.locator('.export-dimensions')).toContainText('210 × 297 mm');
        await expect(page.locator('.export-dimensions')).toContainText('2480 × 3508 px');
        try { await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled(); }
        catch (error) { console.log(await page.locator('.export-panel').innerText(), errors); await page.screenshot({path:path.join(output,'failure.png')}); throw error; }
        const button = await page.getByRole('button', { name: 'Export PNG', exact: true }).boundingBox();
        assert(button.x >= 0 && button.y >= 0 && button.x + button.width <= width + 1 && button.y + button.height <= height + 1, 'Export action must stay in the viewport');
        await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}-export.png`) });
        await page.getByRole('button', { name: 'Close dialog' }).click();
        await expect(page.locator('.export-panel')).toHaveCount(0);
        results.push(`${name} ${width}×${height} ${theme}: canvas, panels, focus, Back, draft/reference, More, export`);
        console.log('PASS', results.at(-1));
      }

      // Switching through tablet/phone/wide layouts retains the open tool and draft.
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.goto(url);
      await page.getByRole('textbox', { name: 'Design prompt' }).fill('Resize must preserve this draft.');
      for (const width of [820,390,1600]) {
        await page.setViewportSize({ width, height: 1000 });
        await openChat(width);
        await expect(page.getByRole('textbox', { name: 'Design prompt' })).toHaveValue('Resize must preserve this draft.');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Close Chat' }).click();
      await openAssets(390);
      const before = await review.post('get_workspace');
      await tools.getByRole('button', { name: 'Use Citrus cocktail', exact: true }).click();
      await expect(tools).not.toBeVisible();
      await expect(page.locator('.canvas-overlay')).toHaveCount(1);
      await expect(page.getByTitle('Undo layout or image change')).toBeEnabled();
      await page.getByTitle('Undo layout or image change').click();
      await expect(page.locator('.canvas-overlay')).toHaveCount(0);
      const after = await review.post('get_workspace');
      assert.deepEqual(after.images, before.images, 'Placement/undo cannot rewrite source images');
      assert.deepEqual(after.assets, before.assets, 'Placement/undo cannot rewrite asset versions');

      // Real downloadable files from the unchanged exporter and real storage.
      for (const format of ['PNG','JPEG','PDF']) {
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        await page.getByLabel('File format', { exact: true }).selectOption(format === 'PNG' ? 'png' : format === 'JPEG' ? 'jpg' : 'pdf');
        await page.getByLabel('Export resolution', { exact: true }).selectOption('150');
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: `Export ${format}`, exact: true }).click();
        const file = await download;
        const target = path.join(output, `${name}-actual-export.${format === 'PNG' ? 'png' : format === 'JPEG' ? 'jpg' : 'pdf'}`);
        await file.saveAs(target);
        const bytes = fs.readFileSync(target);
        if (format === 'PNG') { assert.equal(bytes.readUInt32BE(16),1240); assert.equal(bytes.readUInt32BE(20),1754); }
        if (format === 'JPEG') assert.equal(bytes.readUInt16BE(0), 0xffd8);
        if (format === 'PDF') assert.equal((await PDFDocument.load(bytes)).getPageCount(), doc.pages.length);
        await expect(page.locator('.export-panel')).toHaveCount(0);
      }
      const final = await review.post('get_workspace');
      assert.deepEqual(final.images, baseline.images);
      assert.deepEqual(final.assets, baseline.assets);

      // A failed file save keeps format/settings and permits an actual successful retry.
      await page.getByRole('button',{name:'Export',exact:true}).click();
      await page.evaluate(()=>{ window.reviewAnchorClick=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){throw Error('Review download failure');}; });
      await page.getByRole('button',{name:'Export PNG',exact:true}).click();
      await expect(page.getByRole('alert')).toContainText('Review download failure');
      await expect(page.getByRole('button',{name:'Retry export PNG',exact:true})).toBeEnabled();
      await page.evaluate(()=>{ HTMLAnchorElement.prototype.click=window.reviewAnchorClick; delete window.reviewAnchorClick; });
      const retryDownload=page.waitForEvent('download');
      await page.getByRole('button',{name:'Retry export PNG',exact:true}).click();
      await (await retryDownload).saveAs(path.join(output,`${name}-retried-export.png`));
      await expect(page.locator('.export-panel')).toHaveCount(0);

      // Job feedback remains reachable without a provider call or automatic application.
      let job = { id:'review-job', target:{kind:'document',id:doc.id,pageId:doc.pages[0].id}, status:'running', message:'Generating review image', createdAt:Date.now(), cancelRequested:false };
      await page.route('**/api/get_jobs', route => route.fulfill({json:[job]}));
      await expect(dock).toContainText('Working', {timeout:10000});
      await openAssets(390);
      job = {...job,status:'completed',message:'Ready'};
      await page.getByRole('button',{name:'Close tools',exact:true}).click();
      await expect(dock).toContainText('Ready', {timeout:10000});
      assert.equal((await review.post('get_workspace')).images.length, baseline.images.length);
      await dock.getByRole('button',{name:/^Chat/}).click();
      await page.screenshot({path:path.join(output,`${name}-390-chat.png`)});
      await page.getByRole('button',{name:'Close Chat',exact:true}).click();
      job={...job,status:'failed',message:'Review failure'};
      await expect(dock).toContainText('Request failed',{timeout:10000});
      await dock.getByRole('button',{name:/^Chat/}).click();
      await expect(chat.locator('.job-error')).toContainText('Review failure');
      await page.getByRole('button',{name:'Close Chat',exact:true}).click();
      await expect(chat).not.toBeVisible();
      await page.unroute('**/api/get_jobs');

      // Actual asset PNG retains transparency; PDF remains a document-only choice.
      await page.goto(`${review.origin}/#view=assets&org=${org.id}&asset=${asset.id}`);
      await expect(page.locator('.editor-name')).toHaveText(asset.name);
      await page.getByRole('button',{name:'Export',exact:true}).click();
      try { await expect(page.getByLabel('File format')).not.toContainText('PDF'); }
      catch(error){console.log('Asset navigation failure', {url:page.url(), title:await page.locator('.editor-name').innerText(), dimensions:await page.locator('.export-dimensions').innerText(), assetId:asset.id,docId:doc.id});throw error;}
      const assetDownload=page.waitForEvent('download');
      await page.getByRole('button',{name:'Export PNG',exact:true}).click();
      await (await assetDownload).saveAs(path.join(output,`${name}-transparent-asset.png`));

      // An initial failure offers Retry and never pretends that the workspace is empty.
      let failLoading=true;
      await page.route('**/api/get_workspace',route=>failLoading?route.fulfill({status:503,json:{error:'Review workspace temporarily unavailable'}}):route.continue());
      await page.goto('about:blank');
      await page.goto(review.origin);
      await expect(page.getByRole('alert')).toContainText('Could not open your workspace');
      await expect(page.getByText('Your ideas belong here',{exact:true})).toHaveCount(0);
      failLoading=false;
      await page.getByRole('button',{name:'Retry',exact:true}).click();
      await expect(page.getByRole('heading',{name:/^Continue designing/})).toBeVisible();
      await page.unroute('**/api/get_workspace');
      assert.deepEqual(errors, [], `${name}: JavaScript errors`);
      await expect(page.getByRole('heading', { name: /^Continue designing/ })).toBeVisible();
      for (const width of [390,820,1600]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Home must reflow');
        await page.screenshot({ path: path.join(output, `${name}-${width}-home.png`) });
      }
      results.push(`${name}: placement/undo, source preservation, cross-breakpoint draft, PNG/JPEG/PDF files, transparent asset, job status, initial error/retry, Home`);
      console.log('PASS', results.at(-1));
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({ status:'passed', checks:results, workspace:review.root },null,2));
} finally { await review.close(); }
