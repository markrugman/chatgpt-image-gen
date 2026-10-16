import { createServer } from "vite";
import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";

// Local fixture only: no real workspace, account or server writes.
const workspace = { formatVersion: 3, organisations: [{ id: "org", name: "Studio", color: "#8864d7" }], projects: [{ id: "project", organisationId: "org", name: "Posters", tags: [] }], documents: [{ id: "doc", projectId: "project", name: "Theme preview", width: 210, height: 297, unit: "mm", pages: [{ id: "page", name: "Page 1", messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 }], tags: [], updatedAt: Date.now() }], assets: [], images: [], customSizes: [], handoffs: {} };
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
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1cAAAAASUVORK5CYII=';
  let uploads = 0, failUpload = false, releaseUpload;
  let submitted = [];
  await page.route('**/api/*', async route => {
    const command = route.request().url().split('/').pop();
    const args = route.request().postDataJSON();
    if (command === 'import_asset_data') {
      uploads++;
      assert.equal(args.organisationId, 'org');
      assert.equal(args.data, png);
      assert.equal(args.replaceId, null);
      if (failUpload) return route.fulfill({ status: 400, json: { error: 'Clipboard upload failed' } });
      await new Promise(resolve => { releaseUpload = resolve; });
      const id = 'upload-' + uploads, version = 'version-' + uploads;
      workspace.assets.push({ id, name: args.name, libraryKind: 'upload', organisationId: args.organisationId, versions: [{ id: version, imageId: id, createdAt: Date.now() }], currentVersionId: version, page: { id: 'asset-page-'+uploads, messages: [], revisions: [], history: [{ imageId: id, overlays: [] }], historyIndex: 0 }, tags: [] });
      return route.fulfill({ json: id });
    }
    if (command === 'submit_prompt') { submitted.push(args.request); return route.fulfill({ json: 'job' }); }
    return route.fulfill({ json: command === 'get_workspace' ? workspace : command === 'image_data' ? 'data:image/png;base64,'+png : command === 'get_jobs' ? [] : command === 'server_status' ? { connected: true, online: true, name: 'Fixture', pending: 0, serverVersion: '0.8.5' } : command === 'connection' ? { account: null, capabilities: {} } : {} });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);


  await page.locator('.document-card').click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  const prompt = page.getByRole('textbox', { name: 'Design prompt' });
  const send = page.getByRole('button', { name: 'Generate image', exact: true });
  await prompt.fill('Keep this draft');
  const pasteImage = (type = 'image/png') => prompt.evaluate((element, { png, type }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob(png), char => char.charCodeAt(0))], 'Clipboard.png', { type }));
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, { png, type });
  assert.equal(await pasteImage(), true);
  await expect(page.locator('.prompt-box [role="status"]')).toHaveText('Adding pasted image…');
  await expect(send).toBeDisabled();
  await prompt.press('Control+Enter');
  assert.equal(submitted.length, 0, 'Do not send while a reference is uploading');
  await prompt.fill('Keep this draft and my new words');
  await expect.poll(() => typeof releaseUpload).toBe('function');
  releaseUpload();
  await expect(page.locator('.reference-chips .reference-name')).toHaveText('Clipboard');
  await expect(page.locator('.reference-chips > span').filter({ hasText: 'Clipboard' })).toHaveAttribute('data-purpose', 'Other');
  await expect(prompt).toHaveValue('Keep this draft and my new words');
  await expect(send).toBeEnabled();
  assert.equal(workspace.assets[0].libraryKind, 'upload');
  assert.equal(workspace.assets[0].organisationId, 'org');
  await page.screenshot({ path: 'work/pasted-reference-'+engine+'.png' });
  // Normal text pastes must keep browser defaults.
  assert.equal(await prompt.evaluate(element => {
    const transfer = new DataTransfer(); transfer.setData('text/plain', 'ordinary text');
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true });
    element.dispatchEvent(event); return event.defaultPrevented;
  }), false);
  failUpload = true;
  await pasteImage();
  await expect(page.locator('.toast')).toContainText('Clipboard upload failed');
  await expect(page.locator('.prompt-box [role="status"]')).toHaveCount(0);
  await expect(prompt).toHaveValue('Keep this draft and my new words');
  await expect(page.locator('.reference-chips .reference-name')).toHaveText('Clipboard');
  await expect(send).toBeEnabled();
  await pasteImage('image/gif');
  await expect(page.locator('.toast')).toContainText('Paste a PNG, JPEG or WebP image.');
  assert.equal(uploads, 2, 'Unsupported images must not be uploaded');
  await send.click();
  await expect.poll(() => submitted.length).toBe(1);
  assert.deepEqual(submitted[0].references, ['version-1']);
  assert.equal(submitted[0].prompt, 'Keep this draft and my new words');
  assert.equal(submitted[0].target.id, 'doc');
  await expect(page.locator('.reference-chips')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('PASS: '+engine+' clipboard image uploads to design organisation, attaches exact version, preserves text, blocks sending until ready and retains drafts/references on error.');
} finally {
  await browser?.close();
  await server.close();
}
