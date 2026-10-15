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
  await page.route("**/api/*", r => {
    const command = r.request().url().split("/").pop();
    return r.fulfill({ json: command === "get_workspace" ? workspace : command === "get_jobs" ? [] : command === "server_status" ? { connected: true, online: true, name: "Test workspace", pending: 0, serverVersion: "0.8.3" } : command === "connection" ? { account: null, capabilities: {} } : {} });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);

  await expect(page.locator('.mobile-appbar')).toBeVisible();
  const avatar = page.getByRole('button', { name: 'User menu', exact: true });
  const toggle = page.getByRole('menuitemcheckbox', { name: 'Dark mode' });
  await avatar.tap();
  await expect(toggle).toBeVisible();
  await toggle.locator('span').filter({ hasText: /^Dark mode$/ }).tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 2000 });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.locator('.theme-switch > span').tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await toggle.tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('imagegen-theme'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await avatar.tap();
  await page.locator('h1').tap();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await avatar.tap();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(avatar).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${engine} mobile taps on label, switch and button toggle both ways; reload persistence, outside tap, Escape and Tab dismissal.`);
} finally {
  await browser?.close();
  await server.close();
}
