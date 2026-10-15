# Building and releasing Image Gen

On 2026-10-15, Mark authorized compilation, packaging, remaining checks and public distribution once checks pass. This supersedes the earlier source-only hold. Existing private production deployment remains separate.

Release 0.8.3 and the separately authorised private production upgrade are complete; see [VALIDATION.md](VALIDATION.md). For REST-based release operations, resolve draft releases through the authenticated releases list and release ID: the tag endpoint can return 404 while the release is a draft.

## Local development

Windows build prerequisites: Rust stable MSVC, Microsoft C++ Build Tools, Node.js 24 and WebView2. `Build Image Gen.cmd` remains the local developer build command; it writes build artifacts outside OneDrive under `%LOCALAPPDATA%\ImageGenBuild\target`. `Run Image Gen.cmd` opens an existing local build. These commands differ from installing a published release.

The Tauri wrapper downloads the pinned official managed runtime into ignored `node_modules/.cache/imagegen-runtime` and bundles both `codex.exe` and `codex-code-mode-host.exe` plus their licence/notice. Resource paths are relative to `src-tauri`; keeping the cache on the checkout drive avoids Tauri's Windows drive-prefix removal when CI source and AppData use different drives. The companion release uses an existing native installation rather than bundling another app executable. Its optional plugin manifests under `companion/` remain a separate developer integration.

Typical checks, once compilation is authorized:

```text
npm ci
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo test --locked --manifest-path server/Cargo.toml
npm run tauri -- build --bundles nsis
```

## Repository preparation

Public distribution repository: `markrugman/chatgpt-image-gen`. Source can be staged privately while release qualification runs. Publishing release files and images is separate from upgrading the existing private server.

Before the first release:

1. Review the source and `.gitignore`, then create the public repository and upload approved source. Do not upload `outputs`, `work`, real `.env` files, databases, workspace images or credentials.
2. Enable Actions with permissions to write repository contents and packages. Create the `release-publication` environment and configure required reviewers. The publication job checks that required-reviewer protection exists; an unprotected environment is insufficient.
3. Ensure the chosen version matches package.json, package-lock.json, Tauri config, native/server Cargo manifests and lockfiles, and companion/plugin.json. `python scripts/release.py check --version 0.8.1` validates these without compiling or packaging.
4. Review the Windows signing policy before public distribution. The workflow does not configure Authenticode signing; do not represent its installers as signed.
5. When publication is authorized, update the source-only distribution status notices in README and this guide before preparing that release. Keep historical validation evidence explicit about which checks were actually run.

## Prepare, review, then publish

The workflow has only a manual `workflow_dispatch` trigger. Pushing source or tags does not run it. All jobs use the selected source commit. Version strings are passed through environment variables and checked against source metadata before building.

1. Once explicitly authorized, open **Actions → Prepare Image Gen release → Run workflow**. Select the source branch/commit, enter its `X.Y.Z` version, and leave **publish_server_image** unchecked.
2. The Windows job runs frontend/native tests, builds the x64 NSIS installer, checks required runtime files and creates the installer, full portable ZIP and companion ZIP. The Linux job runs server tests, builds the x64 server image, checks runtime/health/version/authentication, and saves the image as a private workflow artifact for seven days. These checks do not prove real ChatGPT generation or installed-app acceptance.
3. The draft job collects the downloads, installer script, release Compose file and SHA-256 sums into a **draft** GitHub Release. No image is pushed in this default run. This draft is intentionally incomplete for server installation until `server-image.txt` is added later.
4. Review the draft, download and qualify packages on clean supported machines, and verify creation preservation/upgrades and real generation. Do not publish an incomplete draft. If changes are needed, prepare a new version or delete the old draft deliberately; the workflow refuses to replace a draft belonging to another commit or a published release.
5. Once image publication is explicitly approved, rerun the same version from the exact same source commit with **publish_server_image** checked. It builds/verifies packages again, refreshes that draft, then waits at the protected `release-publication` environment. After reviewer approval, it pushes the versioned GHCR image, adds its immutable digest as `server-image.txt` and refreshes SHA256SUMS. Matching already-pushed images can be reused; a version from a different source commit is never overwritten.
6. Set the GHCR package visibility to **Public**. In an environment with no saved registry credentials, verify that pulling the digest from `server-image.txt` works without authentication. GHCR package visibility is configured separately from the public source repository.
7. Confirm the draft has the three Windows downloads, `install.sh`, `compose.release.yaml`, `server-image.txt` and `SHA256SUMS`. Publish the GitHub Release manually only after all acceptance checks pass. No workflow step publishes it or deploys a server.

The server installer downloads only assets from the exact published `vX.Y.Z` release, checks SHA256SUMS and requires the correct repository's image pinned by SHA-256 digest. It never builds on the destination server. The initial script should also be verified before execution as shown in README. Checksums detect mismatched files; they are not a substitute for trusting the publisher.

If image publication fails after pushing but before uploading the digest, rerun the same commit/version with publication enabled. The job verifies the existing image's revision label before reusing it and completing the draft. Do not overwrite a released version to correct it.

Workflow references: [manual workflow execution](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow), [workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts), [draft releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository), and [GHCR visibility and authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
