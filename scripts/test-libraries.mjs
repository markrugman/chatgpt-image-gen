// Against an isolated preview only: creates organisations and exercises real writes.
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const url = process.argv[2] || "http://127.0.0.1:18815";
const keyPath =
  process.argv[3] ||
  path.join(
    process.env.LOCALAPPDATA,
    "ImageGenBuild/libraries-preview-20261015/server-access-key",
  );
const key = fs.readFileSync(keyPath, "utf8").trim();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const checks = [],
  errors = [];
const record = (name) => {
  checks.push(name);
  console.log("PASS " + name);
};
const headers = { "X-Imagegen-Request": "1" };
const post = async (command, data = {}) => {
  const response = await context.request.post(url + "/api/" + command, {
    headers,
    data,
  });
  assert(response.ok(), `${command}: ${await response.text()}`);
  return response.json();
};
const act = async (action) =>
  post("mutate", { action: { ...action, _base: await post("get_workspace") } });
const kind = (a) => a.libraryKind || "asset";
const suffix = Date.now();
try {
  const login = await context.request.post(url + "/web/login", {
    headers,
    data: { accessKey: key, remember: true },
  });
  assert(login.ok());
  const session = await (
    await context.request.get(url + "/web/session")
  ).json();
  if (session.setupNeeded)
    assert(
      (
        await context.request.post(url + "/web/owner", {
          headers,
          data: { keyOnly: true },
        })
      ).ok(),
    );
  const before = await post("get_workspace");
  const orgA = await act({ op: "organisation", name: `Preview A ${suffix}` });
  const orgB = await act({ op: "organisation", name: `Preview B ${suffix}` });
  const projectA = await act({
    op: "project",
    name: "Transfer source",
    organisationId: orgA,
  });
  const projectB = await act({
    op: "project",
    name: "Transfer destination",
    organisationId: orgB,
  });
  // Reuse an existing immutable image solely as fixture input.
  const dataUrl = await post("image_data", { imageId: before.images[0].id });
  const data = dataUrl.split(",")[1];
  const importImage = (name, organisationId) =>
    post("import_asset_data", { name, data, organisationId, replaceId: null });
  const assetA = await importImage("Preview logo", orgA);
  const uploadA = await importImage("Preview upload", orgA);
  await importImage("Shared preview upload", null);
  const sharedAsset = await importImage("Shared preview asset", null);
  await act({ op: "classify", id: assetA, libraryKind: "asset" });
  await act({ op: "classify", id: sharedAsset, libraryKind: "asset" });
  let w = await post("get_workspace");
  assert.equal(kind(w.assets.find((a) => a.id === uploadA)), "upload");
  assert.equal(kind(w.assets.find((a) => a.id === assetA)), "asset");
  const uploadVersion = w.assets.find((a) => a.id === uploadA).currentVersionId;
  const assetVersion = w.assets.find((a) => a.id === assetA).currentVersionId;
  const docId = await act({
    op: "document",
    projectId: projectA,
    name: "Preview transfer design",
    width: 1080,
    height: 1080,
    unit: "px",
    sourceImageId: w.assets.find((a) => a.id === uploadA).versions[0].imageId,
  });
  await act({ op: "page", id: docId });
  // Give the test design historic references and overlays via the normal sync endpoint.
  const snapshotResponse = await context.request.get(url + "/v1/workspace", {
    headers: { Authorization: "Bearer " + key },
  });
  const snapshot = await snapshotResponse.json();
  const next = structuredClone(snapshot.workspace);
  const testDoc = next.documents.find((d) => d.id === docId),
    testPage = testDoc.pages[0];
  testPage.messages = [
    {
      id: crypto.randomUUID(),
      role: "user",
      text: "Preserve this history",
      mode: "generate",
      createdAt: 1,
      references: [uploadVersion, assetVersion],
    },
  ];
  const revisionId = crypto.randomUUID();
  testPage.history[0].revisionId = revisionId;
  testPage.history[0].overlays = [
    {
      id: crypto.randomUUID(),
      assetVersionId: uploadVersion,
      x: 5,
      y: 5,
      width: 20,
      height: 20,
      rotation: 0,
    },
  ];
  testPage.revisions = [
    {
      id: revisionId,
      imageId: testPage.history[0].imageId,
      prompt: "Earlier artwork",
      createdAt: 1,
      threadId: "fixture-thread",
      turnId: "fixture-turn",
      messages: structuredClone(testPage.messages),
      overlays: structuredClone(testPage.history[0].overlays),
      parentRevisionId: null,
    },
  ];
  const put = await context.request.put(url + "/v1/workspace", {
    headers: { Authorization: "Bearer " + key },
    data: {
      serverId: snapshot.serverId,
      baseWorkspace: snapshot.workspace,
      workspace: next,
    },
  });
  assert(put.ok(), await put.text());
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.getByLabel("Current organisation")).toBeVisible();
  await page.getByLabel("Current organisation").selectOption(orgA);
  const nav = (label) =>
    page.locator(".sidebar").getByTitle(label, { exact: true });
  await expect(nav("Asset library").locator("b")).toHaveText("1");
  await expect(nav("Uploads").locator("b")).toHaveText("1");
  await nav("Asset library").click();
  await page.getByLabel("Current organisation").selectOption(orgB);
  await expect(
    page.getByRole("heading", { name: "Asset library", exact: true }),
  ).toBeVisible();
  await expect(nav("Asset library").locator("b")).toHaveText("0");
  await page.getByLabel("Current organisation").selectOption(orgA);
  await expect(
    page.getByRole("heading", { name: "Asset library", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Preview logo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open Shared preview asset",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Shared preview asset",
      exact: true,
    }),
  ).toBeVisible();
  record(
    "Header organisation switching, owned counts, separate shared library",
  );
  await nav("Uploads").click();
  await page.getByRole("button", { name: "Shared", exact: true }).click();
  await page.getByLabel("Upload image file").setInputFiles({
    name: "Shared browser upload.png",
    mimeType: dataUrl.slice(5, dataUrl.indexOf(";")),
    buffer: Buffer.from(data, "base64"),
  });
  await expect(
    page.getByRole("heading", { name: "Uploads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open Shared browser upload",
      exact: true,
    }),
  ).toBeVisible();
  record("Uploading into Shared keeps the new Upload visible in Shared");
  await nav("Overview").click();
  await page
    .getByRole("button", { name: "Open Preview transfer design", exact: true })
    .click();
  await page.getByTitle("Uploads", { exact: true }).last().click();
  await expect(page.locator(".editor-tools")).toHaveCSS("width", "248px");
  assert.equal(await page.locator(".tool-tabs > button").count(), 4);
  assert(
    (await page
      .locator(".tool-tabs > button")
      .first()
      .evaluate((e) => e.getBoundingClientRect().width)) >= 55,
  );
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use Preview upload", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Add as…", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Place", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("menuitem", { name: "Add as…", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use Preview upload", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add as…", exact: true }).click();
  await page.getByRole("menuitem", { name: "Other", exact: true }).click();
  await expect(page.locator(".reference-chips")).toContainText(
    "Preview upload",
  );
  await page
    .getByRole("button", { name: "Use Preview upload", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Place", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await post("get_workspace")).documents
          .find((d) => d.id === docId)
          .pages[0].history.at(-1).overlays.length,
    )
    .toBe(2);
  const composer = page.locator(".chat-panel textarea");
  await composer.fill("Use /upload");
  await expect(
    page.getByRole("heading", { name: "Choose an upload", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Use Preview upload", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add as…", exact: true }).click();
  await page.getByRole("menuitem", { name: "Other", exact: true }).click();
  await expect(composer).toHaveValue("Use ");
  await composer.fill("/asset");
  await expect(
    page.getByRole("heading", {
      name: "Choose an asset or design page",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Use Preview upload", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await nav("Asset library").click();
  await expect(
    page.locator(".editor-library .panel-heading").first(),
  ).toHaveText("YOUR ASSETS");
  await page.screenshot({ path: "work/libraries-editor.png" });
  record(
    "Wider four-button panel, both drawers, popup keyboard actions, reference/place, slash commands, outer sidebar opens drawer",
  );
  // Copy Design through the actual nested dialogs.
  await page.locator(".editor-title > div > button").click();
  await page.getByRole("button", { name: "Copy to…", exact: true }).click();
  const transfer = page.getByRole("dialog").last();
  await transfer.getByLabel("Destination organisation").selectOption(orgB);
  await transfer.getByLabel("Destination project").selectOption(projectB);
  await transfer
    .getByRole("button", { name: "Copy here", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  w = await post("get_workspace");
  const copied = w.documents.find(
    (d) =>
      d.id !== docId &&
      d.projectId === projectB &&
      d.name === "Preview transfer design",
  );
  assert(copied);
  assert.equal(copied.pages.length, 2);
  assert.equal(copied.pages[0].revisions.length, 1);
  assert.equal(copied.pages[0].messages[0].text, "Preserve this history");
  assert.notEqual(copied.pages[0].messages[0].references[0], uploadVersion);
  const destImages = w.assets.filter((a) => a.organisationId === orgB);
  assert.equal(destImages.length, 2);
  assert(destImages.some((a) => kind(a) === "upload"));
  assert(destImages.some((a) => kind(a) === "asset"));
  assert.equal(w.assets.find((a) => a.id === uploadA).organisationId, orgA);
  record(
    "Design copy through UI preserves multipage history and creates independent asset/upload dependencies",
  );
  await page.getByLabel("Current organisation").selectOption(orgA);
  await nav("Uploads").click();
  await page
    .getByRole("button", { name: "Edit Preview upload", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save as asset", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  w = await post("get_workspace");
  assert.equal(kind(w.assets.find((a) => a.id === uploadA)), "upload");
  assert(
    w.assets.some(
      (a) =>
        a.id !== uploadA &&
        a.name === "Preview upload" &&
        a.organisationId === orgA &&
        kind(a) === "asset",
    ),
  );
  await page
    .getByRole("button", { name: "Edit Preview upload", exact: true })
    .click();
  await page.getByRole("button", { name: "Move to…", exact: true }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByLabel("Destination organisation")
    .selectOption(orgB);
  await page.getByRole("button", { name: "Move here", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  w = await post("get_workspace");
  assert.equal(w.assets.find((a) => a.id === uploadA).organisationId, orgB);
  assert.equal(
    w.assets.find((a) => a.id === uploadA).currentVersionId,
    uploadVersion,
  );
  assert.equal(
    w.documents.find((d) => d.id === docId).pages[0].messages[0].references[0],
    uploadVersion,
  );
  record(
    "Save as asset retains Upload; moving Upload preserves existing design references",
  );
  await act({
    op: "rename",
    kind: "asset",
    id: uploadA,
    name: "Edited preview upload",
  });
  assert.equal(
    kind((await post("get_workspace")).assets.find((a) => a.id === uploadA)),
    "upload",
  );
  await act({
    op: "transfer",
    kind: "document",
    id: docId,
    mode: "move",
    organisationId: orgB,
    projectName: "New preview campaign",
  });
  w = await post("get_workspace");
  const moved = w.documents.find((d) => d.id === docId);
  assert.equal(
    w.projects.find((p) => p.id === moved.projectId).organisationId,
    orgB,
  );
  assert.equal(moved.pages[0].revisions.length, 1);
  for (const version of moved.pages[0].messages[0].references)
    assert(
      w.assets.some(
        (a) =>
          a.organisationId === orgB && a.versions.some((v) => v.id === version),
      ),
    );
  record(
    "Editing preserves Upload classification; Design move creates project and preserves history",
  );
  await page.getByLabel("Current organisation").selectOption(orgA);
  await nav("Asset library").click();
  await page
    .getByRole("button", { name: "Edit Preview logo", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy to…", exact: true }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByLabel("Destination organisation")
    .selectOption(orgB);
  await page.getByRole("button", { name: "Copy here", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  w = await post("get_workspace");
  const originalLogo = w.assets.find((a) => a.id === assetA);
  const independentLogo = w.assets
    .filter((a) => a.organisationId === orgB && a.name === "Preview logo")
    .at(-1);
  assert.notEqual(independentLogo.id, originalLogo.id);
  assert.notEqual(
    independentLogo.currentVersionId,
    originalLogo.currentVersionId,
  );
  assert.equal(
    independentLogo.versions[0].imageId,
    originalLogo.versions[0].imageId,
  );
  await page.getByLabel("Current organisation").selectOption(orgA);
  await nav("Asset library").click();
  await page
    .getByRole("button", { name: "Edit Preview logo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move to Uploads", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  w = await post("get_workspace");
  assert.equal(kind(w.assets.find((a) => a.id === assetA)), "upload");
  assert.equal(
    w.assets.find((a) => a.id === assetA).currentVersionId,
    assetVersion,
  );
  record(
    "Asset Copy to creates an independent item; reclassification keeps exact versions",
  );
  // Responsive tools retain all four buttons without horizontal clipping.
  await page.reload();
  await page.getByLabel("Current organisation").selectOption(orgB);
  await page
    .getByRole("button", { name: "Open Preview transfer design", exact: true })
    .first()
    .click();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 1024)
      await page.getByRole("button", { name: "Tools", exact: true }).click();
    await expect(page.locator(".tool-tabs > button")).toHaveCount(4);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
    const boxes = await page
      .locator(".tool-tabs > button")
      .evaluateAll((buttons) =>
        buttons.map((b) => b.getBoundingClientRect().width),
      );
    assert(
      boxes.every((w) => w >= 55),
      `Crowded tabs at ${width}`,
    );
  }
  record("Responsive navigation at 390, 768, 1024, 1440px");
  w = await post("get_workspace");
  for (const list of [
    "organisations",
    "projects",
    "documents",
    "assets",
    "images",
  ])
    for (const original of before[list])
      assert.deepEqual(
        w[list].find((item) => item.id === original.id),
        original,
      );
  assert.deepEqual(errors, []);
  record(
    "Original copied workspace records unchanged; no browser runtime errors",
  );
  fs.writeFileSync(
    "work/libraries-browser-evidence.json",
    JSON.stringify({ passed: true, url, checks, errors }, null, 2),
  );
} finally {
  await browser.close();
}
