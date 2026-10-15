import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

// Isolated browser regression: no real server, credentials or workspace writes.
const pageData = { id: "page", name: "Page 1", messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0, threadId: null, branchTurnId: null };
const workspace = { formatVersion: 3, organisations: [{ id: "org", name: "Courtyard", color: "#8864d7" }], projects: [{ id: "project", organisationId: "org", name: "Halloween", tags: [], deletedAt: null }], documents: [{ id: "doc", projectId: "project", name: "Halloween poster", width: 210, height: 297, unit: "mm", pages: [pageData], tags: [], updatedAt: Date.now(), deletedAt: null, sourceDocumentId: null }], assets: [], images: [], customSizes: [], handoffs: {} };
const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: process.platform === "win32" ? "msedge" : undefined, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/web/session", r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
  await page.route("**/health", r => r.fulfill({ json: { service: "image-gen-server", version: "0.8.3" } }));
  await page.route("**/api/*", r => {
    const command = r.request().url().split("/").pop();
    return r.fulfill({ json: command === "get_workspace" ? workspace : command === "get_jobs" ? [] : command === "server_status" ? { connected: true, online: true, name: "Test workspace", pending: 0, serverVersion: "0.8.3" } : command === "connection" ? { account: null, capabilities: {} } : {} });
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(origin);
  await expect(page.locator(".document-card")).toBeVisible();
  const initialLength = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Halloween", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => history.length), initialLength + 1, "Internal navigation must add browser history");
  await page.getByRole("button", { name: "Open Halloween", exact: true }).click();
  await expect(page.locator(".document-card")).toBeVisible();
  await page.locator(".document-card").click();
  await expect(page.locator(".canvas-workspace")).toBeVisible();
  const editorUrl = page.url();
  await page.goBack();
  await expect(page.locator(".document-card")).toBeVisible();
  await expect(page.locator(".canvas-workspace")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Open Halloween", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.nav-item.selected')).toHaveText("Overview");
  assert.equal(new URL(page.url()).origin, origin, "Back must stay inside the app until its internal history is exhausted");
  await page.goForward();
  await page.goForward();
  await page.goForward();
  await expect(page.locator(".canvas-workspace")).toBeVisible();
  assert.equal(page.url(), editorUrl);
  await page.reload();
  await expect(page.locator(".canvas-workspace")).toBeVisible();
  assert.equal(page.url(), editorUrl, "Reload must restore the same design");
  assert.deepEqual(errors, []);
  console.log("PASS: Projects → project → design; Back/Forward restore views; reload restores design.");
} finally {
  await browser?.close();
  await server.close();
}
