import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const version = "0.162.0-alpha.17.2";
const args = process.argv.slice(2);
function run(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      stdio: "inherit",
      windowsHide: true,
      ...options,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`${exe} exited ${code}`)),
    );
  });
}
const cli = path.resolve("node_modules/@tauri-apps/cli/tauri.js");
if (["build", "dev"].includes(args[0])) {
  // Tauri strips Windows drive prefixes from resources. Keep runtime resources
  // on the checkout drive (GitHub runners use D: for source and C: for AppData).
  const cache = path.resolve(
    "node_modules",
    ".cache",
    "imagegen-runtime",
    version,
    `${process.platform}-${process.arch}`,
  );
  const packageRoot = path.join(
    cache,
    "node_modules",
    "@openai",
    `codex-${process.platform}-${process.arch}`,
  );
  if (!(await fs.stat(packageRoot).catch(() => null))) {
    await fs.mkdir(cache, { recursive: true });
    // Use npm's own registry integrity verification and the pinned official package.
    if (process.platform === "win32") {
      const npmCli = path.join(
        path.dirname(process.execPath),
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      );
      await run(process.execPath, [
        npmCli,
        "install",
        "--prefix",
        cache,
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
        `@openai/codex@${version}`,
      ]);
    } else
      await run("npm", [
        "install",
        "--prefix",
        cache,
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
        `@openai/codex@${version}`,
      ]);
  }
  const target =
    process.platform === "win32"
      ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`
      : process.platform === "darwin"
        ? `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`
        : `${process.arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-musl`;
  let runtime;
  for (const folder of ["bin", "codex"]) {
    const candidate = path.join(packageRoot, "vendor", target, folder);
    if (
      await fs
        .stat(
          path.join(
            candidate,
            process.platform === "win32" ? "codex.exe" : "codex",
          ),
        )
        .catch(() => null)
    ) {
      runtime = candidate;
      break;
    }
  }
  if (!runtime)
    throw Error("The official generation runtime package is incomplete");
  const resources = {
    "CODEX-LICENSE.txt": "runtime/LICENSE.txt",
    "CODEX-NOTICE.txt": "runtime/NOTICE.txt",
    [path.relative(path.resolve("src-tauri"), runtime) + path.sep]: "runtime/",
    "THIRD-PARTY-NOTICES.txt":
      "THIRD-PARTY-NOTICES.txt",
  };
  // Merge an explicit caller config (for example an isolated acceptance identifier).
  let config = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--config" || args[i] === "-c") {
      const input = args[i + 1];
      const more = JSON.parse(
        input.trim().startsWith("{") ? input : await fs.readFile(input, "utf8"),
      );
      config = {
        ...config,
        ...more,
        bundle: { ...config.bundle, ...more.bundle },
      };
      args.splice(i, 2);
      i--;
    }
  }
  config.bundle = {
    ...config.bundle,
    resources: { ...config.bundle?.resources, ...resources },
  };
  args.push("--config", JSON.stringify(config));
  console.log(
    `Bundling the managed generation runtime ${version} (${process.platform}/${process.arch}).`,
  );
}
try {
  await run(process.execPath, [cli, ...args]);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
