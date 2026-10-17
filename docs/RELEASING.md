# Building and releasing Image Gen

Current release: [0.9.6](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.9.6) (2026-10-17), application source `372e2c7128e9c691fe4be60081a1f5aa14e65b68`, all-success [workflow](https://github.com/markrugman/chatgpt-image-gen/actions/runs/39024421425). Private production is `releases/v096-release`, with all workspace/media and signed-in worker preserved. Windows downloads, portable MCP/runtime, all anonymous downloads/checksums and the immutable Linux image are verified. `Run Image Gen.cmd` prefers `outputs/Image Gen 0.9.6 Portable/`. See VALIDATION.md for backups and evidence. This supersedes the previous release/deployment-hold statuses below.


Private 0.9.5 local build and server deployment (2026-10-16): templates require only Name and Recipe. Windows installer/portable/companion packages are verified under `outputs/Desktop-0.9.5/`; launcher prefers `outputs/Image Gen 0.9.5 Portable/`. Production is `releases/v095`, with workspace/media, sessions and signed-in worker preserved. No GitHub push/public release; 0.9.4 remains latest public. See [validation](VALIDATION.md).

Server cleanup (2026-10-16): Mark requested latest-only retention. Older Image Gen server releases, server backups, automatic backup ZIPs and obsolete test deployments/images were removed after 0.9.4. Current workspace/worker volumes and Windows off-host backups remain. See [VALIDATION.md](VALIDATION.md) for cleanup verification.

Current release: [0.9.4](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.9.4) (2026-10-16), source `8f430f3ee587eb3189bc9bb1bfddd38640a977e6`, all-success [workflow 38915547534](https://github.com/markrugman/chatgpt-image-gen/actions/runs/38915547534). Includes complete navigation/history and folder-first Templates drawers with library-only folder management. GitHub-built packages, all seven anonymous downloads/checksums and the public immutable Linux image are verified. The private server runs the same source under `releases/v094`, preserving all workspace/media, key, sessions and signed-in worker credentials with stopped-volume and verified off-host backups. [VALIDATION.md](VALIDATION.md) is canonical. The verified local portable is `outputs/Image Gen 0.9.4 Portable/` and is preferred by `Run Image Gen.cmd`. This supersedes the current-release statements below.

Release 0.9.2 is [public on GitHub](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.9.2) (2026-10-16), from source `362fe7bf0ed98b1713283faa914a4106f08aef2a`. Clean workflow, GitHub-built Windows downloads, all anonymous downloads/checksums and the immutable public Linux image are verified; see [VALIDATION.md](VALIDATION.md). Verified downloads are in `outputs/GitHub-0.9.2/`. The existing private server retains its previously qualified local 0.9.2 image from application source `ba537216db936b6c180f1cee18fde035ccb12d9f`; publication did not redeploy it. Local Windows packages remain in `outputs/Desktop-0.9.2/`, and `Run Image Gen.cmd` prefers their extracted portable. Complete stopped-volume/off-host backups and preservation evidence are recorded in VALIDATION.md.

On 2026-10-15, Mark authorized compilation, packaging, remaining checks and public distribution once checks pass. This supersedes the earlier source-only hold. Existing private production deployment remains separate.

For REST-based release operations, resolve draft releases through the authenticated releases list and release ID: the tag endpoint can return 404 while the release is a draft. When updating draft notes, explicitly preserve `tag_name`, `target_commitish`, `name` and `draft`, and verify the returned tag before publication. A notes-only PATCH reset the unpublished 0.8.4 tag to an `untagged-*` value; restoring the tag allowed retrying just publication with the already verified packages.

Release 0.9.0 (2026-10-16) includes Templates and compact-editor Canvas opening. Windows installer/portable/companion downloads and all checksums are verified; private production points to releases/v090 with the original workspace and worker volumes, sign-in and media preserved. See VALIDATION.md for the workflow, image digest, backup and qualification evidence. No Windows installer ran over the existing user installation. When adapting a private upgrade helper, resolve the actual current symlink first and keep that old path separate from the new version; a broad version replacement can otherwise invalidate the preflight guard before any service change.

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
3. Ensure the chosen version matches package.json, package-lock.json, Tauri config, native/server Cargo manifests and lockfiles, and companion/plugin.json. The native Cargo.lock contains both `image-gen-app` and its `image-gen-server` test dependency; update both package entries. `python scripts/release.py check --version X.Y.Z` validates these without compiling or packaging.
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
