import { createServer } from "vite";
import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";

// Local fixture only: no real workspace, account or server writes.
const pageData = (id, imageId, revisions = []) => ({ id, name: 'Page 1', messages: [], revisions, history: [{ imageId, revisionId: null, overlays: [] }], historyIndex: 0 });
const revision = (imageId, createdAt) => ({ id: imageId, imageId, createdAt, overlays: [], messages: [], prompt: '', threadId: '', turnId: '' });
const design = (id, name, pages, updatedAt, deletedAt = null) => ({ id, name, projectId: 'project', pages, updatedAt, deletedAt, width: 210, height: 297, unit: 'mm', tags: [] });
const longName = 'An exceptionally long design name that must stay on one line';
const workspace = { formatVersion: 3, organisations: [{ id: 'org', name: 'Studio', color: '#8864d7' }], projects: [{ id: 'project', organisationId: 'org', name: 'Poster collection', tags: [] }], documents: [
  design('old', 'Old design', [pageData('one', 'one', [revision('one', 100)])], 100),
  design('recent', longName, [pageData('four', 'four', [revision('two', 200), revision('four', 400)]), pageData('six', 'six', [revision('six', 600), revision('six', 600)])], 600),
  design('deleted', 'Deleted design', [pageData('seven', 'seven', [revision('seven', 700)])], 700, 700),
  design('import', 'Imported design', [pageData('five', 'five')], 500)
], assets: [], images: [], customSizes: [], handoffs: {} };
workspace.projects.push(...[1,2,3].map(i => ({ id: 'empty-'+i, organisationId: 'org', name: 'Another project with a long name '+i, tags: [] })));
const image = id => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><rect width="210" height="297" fill="#7052ac"/><text x="20" y="150" fill="white" font-size="36">'+id+'</text></svg>');
const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } });
await server.listen();
let browser;
try {
  const engine = process.argv[2] || "webkit";
  assert.ok(["webkit", "chromium"].includes(engine));
  browser = engine === "webkit"
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/web/session", r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
  await page.route("**/health", r => r.fulfill({ json: { service: "image-gen-server", version: "0.8.3" } }));
  await page.route("**/api/*", r => {
    const command = r.request().url().split("/").pop();
    return r.fulfill({ json: command === "image_data" ? image(r.request().postDataJSON().imageId) : command === "get_workspace" ? workspace : command === "get_jobs" ? [] : command === "server_status" ? { connected: true, online: true, name: "Test workspace", pending: 0, serverVersion: "0.8.3" } : command === "connection" ? { account: null, capabilities: {} } : {} });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);


  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  for (const width of [320, 390, 600, 601, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    const card = page.locator('.project-card').first();
    await expect(card.locator('.project-paper img')).toHaveCount(3);
    const ids = await card.locator('.project-paper img').evaluateAll(images => images.map(img => decodeURIComponent(img.src).match(/>([^<>]+)<\/text>/)[1]));
    assert.deepEqual(ids, ['six', 'five', 'four']);
    const projectBounds = await card.boundingBox();
    const newBounds = await page.locator('.new-project-card').boundingBox();
    assert.ok(Math.abs(projectBounds.height - newBounds.height) < 1, 'Project card heights at '+width);
    if (width <= 1024) {
      const logo = await page.locator('.mobile-brand').boundingBox();
      assert.ok(Math.abs(logo.x + logo.width / 2 - width / 2) < 1, 'Centred logo at '+width);
      const hamburger = await page.getByRole('button', { name: 'Open navigation', exact: true }).boundingBox();
      const actions = await page.locator('.mobile-appbar-actions').boundingBox();
      assert.ok(hamburger.x <= 12 && Math.abs(width - actions.x - actions.width - 12) < 1);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No workspace overflow at '+width);
    if ([390,1440].includes(width)) await page.screenshot({ path: 'work/layout-'+engine+'-'+width+'.png' });
    await page.getByRole('button', { name: 'Open '+longName, exact: true }).first().click();
    await expect(page.locator('.canvas-workspace')).toBeVisible();
    for (const label of ['Extract asset', 'Use in new design', 'Export']) {
      const button = page.locator('.editor-actions').getByRole('button', { name: label, exact: true });
      await expect(button).toBeVisible();
      if (width <= 600) {
        await expect(button.locator('span')).toBeHidden();
        const buttonBounds = await button.boundingBox();
        const titleBounds = await page.locator('.editor-title').boundingBox();
        assert.ok(Math.abs(buttonBounds.y + buttonBounds.height / 2 - titleBounds.y - titleBounds.height / 2) < 1, 'Actions beside title at '+width);
      } else await expect(button.locator('span')).toBeVisible();
    }
    if(width <= 600) assert.ok((await page.locator('.editor-topbar').boundingBox()).height <= 72);
    await expect(page.locator('.editor-actions .primary')).toHaveCSS('background-color', 'rgb(119, 83, 203)');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No editor overflow at '+width);
    if ([390,600,1440].includes(width)) await page.screenshot({ path: 'work/editor-layout-'+engine+'-'+width+'.png' });
    if(width === 390) {
      await page.getByRole('button', { name: 'Extract asset', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await page.getByTitle('Back to workspace', { exact: true }).click();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: '+engine+' latest project images, equal card heights, centred mobile header and single-row icon actions at 320-1440px.');
} finally {
  await browser?.close();
  await server.close();
}
