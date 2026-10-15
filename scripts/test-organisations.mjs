import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

// UI acceptance against in-memory HTTP fixtures only. No real workspace writes.
const workspace = {
  organisations: ["Courtyard", "College", "Personal"].map((name, index) => ({ id: String(index), name, color: "#7654cf" })),
  projects: [], documents: [], assets: [], images: [], customSizes: [], handoffs: {},
};
const mutations = [];
let failRename = false;
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
  await page.route("**/api/*", async r => {
    const command = r.request().url().split("/").pop();
    if (command === "mutate") {
      const { action } = r.request().postDataJSON();
      mutations.push(action);
      if (action.op === "rename" && failRename) return r.fulfill({ status: 409, json: { error: "Test rename conflict" } });
      if (action.op === "reorder_organisations") action.ids.forEach((id, position) => { workspace.organisations.find(o => o.id === id).position = position; });
      else {
        const org = workspace.organisations.find(o => o.id === action.id);
        if (action.op === "rename") org.name = action.name;
        if (action.op === "delete") org.deletedAt = 100;
        if (action.op === "restore") org.deletedAt = null;
      }
    }
    return r.fulfill({ json: command === "get_workspace" ? workspace : command === "get_jobs" ? [] : command === "server_status" ? { connected: true, online: true, name: "Test", pending: 0 } : command === "connection" ? { account: null, capabilities: {} } : {} });
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  const rows = page.locator(".organisation-row .org-item");
  await expect(rows).toHaveText(["COCourtyard", "COCollege", "PEPersonal"]);
  await expect(page.getByRole("button", { name: "Organisation menu for Courtyard" })).toHaveCSS("opacity", "0");
  await rows.first().hover();
  await expect(page.getByRole("button", { name: "Organisation menu for Courtyard" })).toHaveCSS("opacity", "1");
  await rows.nth(2).dragTo(rows.first());
  await expect(rows).toHaveText(["PEPersonal", "COCourtyard", "COCollege"]);
  await rows.first().focus(); await page.keyboard.press("Alt+ArrowDown");
  await expect(rows).toHaveText(["COCourtyard", "PEPersonal", "COCollege"]);
  await page.reload();
  await expect(rows).toHaveText(["COCourtyard", "PEPersonal", "COCollege"]);
  await page.getByRole("button", { name: "Organisation menu for Courtyard" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("textbox", { name: "Organisation name", exact: true });
  await expect(input).toBeFocused();
  await input.fill("  "); await input.press("Enter");
  await expect(input).toBeVisible();
  assert.equal(mutations.filter(a => a.op === "rename").length, 0);
  await input.fill("Cancelled"); await input.press("Escape");
  await expect(rows.first()).toContainText("Courtyard");
  await page.getByRole("button", { name: "Organisation menu for Courtyard" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await input.fill("  The Courtyard  ");
  failRename = true; await input.press("Enter");
  await expect(page.getByText("Error: Test rename conflict", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("  The Courtyard  ");
  failRename = false; await input.press("Enter");
  await expect(rows.first()).toContainText("The Courtyard");
  assert.equal(mutations.find(a => a.op === "rename").name, "The Courtyard");
  await rows.first().click();
  await page.getByRole("button", { name: "Organisation menu for The Courtyard" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Organisation menu for The Courtyard" }).click();
  await page.getByRole("menuitem", { name: "Trash" }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByRole("button", { name: "All organisations", exact: true })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.locator(".trash-row")).toContainText("The Courtyard");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Organisation menu for Personal" }).click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(input).toBeVisible();
  await input.fill("Personal renamed"); await input.press("Enter");
  await expect(page.locator(".mobile-navigation")).toContainText("Personal renamed");
  assert.deepEqual(errors, []);
  console.log("PASS: hover menu, drag/keyboard order, reload, inline rename/blank/cancel, Trash/Restore, selected fallback, compact navigation.");
} finally {
  await browser?.close();
  await server.close();
}
