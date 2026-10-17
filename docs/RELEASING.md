# Building and releasing Image Gen

## 0.11.0 release and deployment authorised (2026-10-18)

Mark requested a full build, GitHub publication and server deployment of all current updates. This lifts the earlier local-only holds for configurable Templates, the simplified authoring dialog, transparency preview/PNG export and current-design project previews. Windows Setup/Portable/Companion and the immutable Linux server image are in scope. Apply the [retention and deployment headroom policy](SERVER-RETENTION.md), preserve workspace/media, sessions/jobs/configuration and signed-in worker state, and qualify the published downloads and server before recording completion. Earlier release statuses below are historical.

## 0.10.3 — all current updates released and deployed (2026-10-17)

Mark authorised the complete pending set. All canvas transforms, drawer/clipboard, precise recency and same-organisation Copy/Move/type-safe drag changes are published in [0.10.3](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.10.3) from `55180e8f5b4c47bd83e4e2834f299f2ba6b52416` and deployed to the existing server with workspace/media, configuration, sessions/jobs and signed-in worker preserved. Verified stopped-volume/off-host backups and successful [workflow](https://github.com/markrugman/chatgpt-image-gen/actions/runs/39059113530); [VALIDATION.md](VALIDATION.md) is canonical. Earlier holds/statuses below are historical.

## 0.10.3 release and deployment authorised (2026-10-17)

Mark explicitly requested building, deploying and releasing all current updates. This lifts the earlier publication/deployment holds for canvas corner/Shift resizing and rotation, drawer left-click Place/right-click options, clipboard permission recovery, precise edit recency across libraries, same-organisation Copy/Move and typed library drag moves. Windows packages, immutable server image and the existing local server upgrade are in scope. Qualification/preservation evidence will be added here after verification.

Current release and local server: [0.10.2](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.10.2) (2026-10-17), source `68a83da67a85eea0a56a22eee8b28edbdd39dd59`, all-success [workflow](https://github.com/markrugman/chatgpt-image-gen/actions/runs/39044328340). All pending drop/proportion and library/folder-order updates are published with Windows Setup/Portable/Companion and immutable GHCR image. Private production is `releases/v0102-release` using the public image, with verified stopped-volume/off-host backups and unchanged workspace/media, sessions/jobs, configuration and signed-in worker. [VALIDATION.md](VALIDATION.md) records evidence/limitations. Earlier holds and current-version statements below are historical.

## 0.10.2 release and server update authorised (2026-10-17)

Mark requested building and publishing the external-file canvas-drop, original-proportion and Uploads drop-feedback fixes as 0.10.2, including Windows downloads and the server image, then updating the existing local server. Mark subsequently requested publishing all updates: Asset/Upload library ordering and Project/Template folder ordering are included too. This lifts their earlier local-only holds. Qualification and preservation evidence will be recorded in VALIDATION.md.


Current published release: [0.10.1](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.10.1) (2026-10-17), source `6dd9b0ae0a18da26b3819d973de48eba2f8c1c7a`, all-success [workflow](https://github.com/markrugman/chatgpt-image-gen/actions/runs/39035536656). Windows downloads and the immutable GHCR server image are public; package/runtime, checksums and anonymous downloads/image checks pass. Private production remains the separately qualified `releases/v0101-private` deployment. [VALIDATION.md](VALIDATION.md) records evidence and limitations. This supersedes earlier no-publication/current-release statements below.

Source publication authorised on 2026-10-17: Mark requested committing and pushing the tested 0.10.1 changes to GitHub. The earlier no-push statements below describe the deployment's original scope. Public downloadable release remains 0.9.6; no release workflow is requested.

Private server 0.10.1 is deployed (2026-10-17), explicitly authorised without a GitHub push. It replaces the annotation modal/button with context-menu Edit, inline canvas regions, chat pills and server-enforced single-item requests. Production is `releases/v0101-private`, image `imagegen-local:0.10.1-2fc2376213a1`, with verified stopped-volume/off-host backups and full workspace/media/session/worker preservation. Public GitHub remains 0.9.6; the installed Windows app and launcher were not upgraded by this task. [VALIDATION.md](VALIDATION.md) records source provenance, tests and limitations. This supersedes the older private-production paths below, not the public release status.

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
