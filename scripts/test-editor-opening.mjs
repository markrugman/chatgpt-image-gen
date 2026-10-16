import { createServer } from "vite";
import { chromium, webkit, expect } from "@playwright/test";
import assert from "node:assert/strict";

// Isolated navigation regression; no real workspace or server writes.
const pageData = { id: "page", name: "Page 1", messages: [], revisions: [], history: [{ imageId: null, revisionId: null, overlays: [] }], historyIndex: 0 };
const workspace = {
  formatVersion: 3,
  organisations: [{ id: "org", name: "Test organisation", color: "#8864d7" }],
  projects: [{ id: "project", organisationId: "org", name: "Test project", tags: [] }],
  documents: [{ id: "doc", projectId: "project", name: "Test design", width: 210, height: 297, unit: "mm", pages: [pageData], tags: [], updatedAt: 1 }],
  assets: ["asset", "upload"].map(kind => ({ id: kind, libraryKind: kind, organisationId: "org", name: `Test ${kind}`, tags: [], versions: [], currentVersionId: null, page: { ...pageData, id: `${kind}-page` } })),
  images: [], customSizes: [], handoffs: {}, templates: [],
};
const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
try {
  for (const [engine, browserType, options] of [
    ["Edge", chromium, { channel: process.platform === "win32" ? "msedge" : undefined }],
    ["WebKit", webkit, {}],
  ]) {
    const browser = await browserType.launch({ ...options, headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.route("**/web/session", r => r.fulfill({ json: { hasOwner: true, setupNeeded: false } }));
      await page.route("**/health", r => r.fulfill({ json: { service: "image-gen-server", version: "0.8.5" } }));
      await page.route("**/api/*", r => {
        const command = r.request().url().split("/").pop();
        return r.fulfill({ json: command === "get_workspace" ? workspace : command === "get_jobs" ? [] : command === "server_status" ? { connected: true, online: true, name: "Fixture", pending: 0 } : command === "connection" ? { account: null, capabilities: {} } : {} });
      });
      const nav = async name => {
        const toggle = page.getByRole("button", { name: "Open navigation", exact: true });
        if (page.viewportSize().width <= 1024) {
          await expect(toggle).toBeVisible();
          await toggle.click();
        } else {
          await expect(toggle).toHaveCount(0);
        }
        await page.locator(".nav-item").filter({ hasText: new RegExp(`^${name}`) }).click();
      };
      const canvas = async () => {
        await expect(page.locator(".editor")).toHaveClass("editor mobile-view-canvas");
        await expect(page.locator(".canvas-workspace")).toBeVisible();
        await expect(page.getByRole("button", { name: "Canvas", exact: true })).toHaveAttribute("aria-pressed", "true");
      };
      for (const width of [393, 768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin);
        await page.getByRole("button", { name: "Open Test design", exact: true }).click();
        await canvas();
        for (const [section, name] of [["Asset library", "asset"], ["Uploads", "upload"]]) {
          // Sidebar library navigation leaves the editor for the full library.
          await nav(section);
          await expect(page.locator(".editor")).toHaveCount(0);
          await page.getByRole("button", { name: `Open Test ${name}`, exact: true }).click();
          await canvas();
        }
        // Returning through Projects still opens a design on Canvas.
        await nav("Uploads");
        await nav("Projects");
        await page.getByRole("button", { name: "Open Test project", exact: true }).click();
        await page.getByRole("button", { name: "Open Test design", exact: true }).click();
        await canvas();
        await page.goBack();
        await expect(page.locator(".editor")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Open Test design", exact: true })).toBeVisible();
        await page.goForward();
        await canvas();
        await page.reload();
        await canvas();
        // Top library tools remain available in the editor, independently of the sidebar.
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator(".tool-tabs").getByRole("button", { name: "Assets", exact: true }).click();
        await expect(page.locator(".tool-tabs .active")).toHaveText("Assets");
        await expect(page.locator(".canvas-workspace")).toBeVisible();
        await expect(page.locator(".chat-panel")).toBeVisible();
        await page.setViewportSize({ width, height: 900 });
        await canvas();
        console.log(`PASS ${engine} ${width}px: assets, uploads, project designs, sidebar libraries, top tools, history, reload and resizing`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
