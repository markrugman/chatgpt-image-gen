import { test, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("Tauri wrapper passes existing relative resources, independent of cache drive", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "imagegen-tauri-"));
  try {
    await fs.mkdir(path.join(root, "scripts"));
    await fs.copyFile("scripts/tauri.mjs", path.join(root, "scripts/tauri.mjs"));
    await fs.mkdir(path.join(root, "src-tauri"));
    for (const name of ["CODEX-LICENSE.txt", "CODEX-NOTICE.txt", "THIRD-PARTY-NOTICES.txt"])
      await fs.writeFile(path.join(root, "src-tauri", name), "fixture");
    const version = "0.162.0-alpha.17.2";
    // Populate both layouts so this test exercises configuration, without npm/network.
    const caches = [
      path.join(root, "appdata", "ImageGenBuild", "runtime"),
      path.join(root, "node_modules", ".cache", "imagegen-runtime"),
    ];
    const target = process.platform === "win32" ? "x86_64-pc-windows-msvc"
      : process.platform === "darwin" ? "x86_64-apple-darwin" : "x86_64-unknown-linux-musl";
    for (const cache of caches) {
      const bin = path.join(cache, version, `${process.platform}-${process.arch}`, "node_modules", "@openai", `codex-${process.platform}-${process.arch}`, "vendor", target, "bin");
      await fs.mkdir(bin, { recursive: true });
      await fs.writeFile(path.join(bin, process.platform === "win32" ? "codex.exe" : "codex"), "fixture");
    }
    const cli = path.join(root, "node_modules", "@tauri-apps", "cli");
    await fs.mkdir(cli, { recursive: true });
    await fs.writeFile(path.join(cli, "tauri.js"), `require('node:fs').writeFileSync('captured.json', process.argv[process.argv.indexOf('--config') + 1]);`);
    execFileSync(process.execPath, ["scripts/tauri.mjs", "build"], {
      cwd: root, env: { ...process.env, LOCALAPPDATA: path.join(root, "appdata") },
    });
    const config = JSON.parse(await fs.readFile(path.join(root, "captured.json"), "utf8"));
    const resources = config.bundle.resources;
    expect(Object.values(resources).sort()).toEqual([
      "THIRD-PARTY-NOTICES.txt", "runtime/", "runtime/LICENSE.txt", "runtime/NOTICE.txt",
    ]);
    for (const resource of Object.keys(resources)) {
      expect(path.isAbsolute(resource), resource).toBe(false);
      expect(await fs.stat(path.resolve(root, "src-tauri", resource))).toBeTruthy();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
