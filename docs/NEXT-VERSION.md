# Next version design interview

## Project previews, compact headers and pasted references - 0.8.5 (2026-10-15)

Implemented and deployed after the user explicitly requested building and deploying these changes. The scope includes newest-first project-image previews across all pages, equal grid-row/card heights, centred compact navigation, a single title/action row with icon-only actions through 600px, and image paste into the chat composer. Pasted PNG/JPEG/WebP files use the existing import route, retain original bytes in organisation-owned Uploads, and attach the saved immutable version. Pending uploads block click/keyboard submission while preserving draft editing. Errors leave the draft and prior references intact. Text-only paste keeps browser defaults.

Local WebKit and Edge checks cover widths 320-1440px, multi-row project grids, long design titles, image timestamps/pages/deduplication/deleted designs, icon labels/action dialogs, actual touch input, clipboard events and the exact generation reference. A disposable instance of the built Linux server verifies real image imports and original bytes with both browser engines. Live read-only checks pass in desktop Edge and mobile WebKit; the workspace remains unchanged. The Safari toggle fix below is included. Production backup, preservation and build evidence is recorded in VALIDATION.md. The production image was built locally. Mark subsequently requested GitHub publication of 0.8.5; the clean release workflow, package checks and publication completed on 2026-10-16. See VALIDATION.md for release evidence.

## Safari appearance-toggle fix - local only (2026-10-15)

Mobile WebKit reproduced the reported failure: tapping the Dark mode label left the theme light and closed the menu. The event trace showed pointerdown, touchstart, mousedown and focusout with a null relatedTarget; blur dismissal unmounted the toggle before click. UserMenu now dismisses on blur only when focus moves to a known element outside the menu. Outside-pointer and Escape handling remain in place.

Regression: node scripts/test-theme-touch.mjs runs mobile WebKit; add chromium for mobile Edge. Both verify taps on the label, switch knob and button, light/dark changes, reload persistence, outside-tap dismissal, Escape/focus restoration and Tab dismissal. The test failed on the original code and passes with the fix. Existing theme checks, 28 frontend tests and the frontend build pass. Physical iPhone Safari verification remains outstanding. No deployment or publication; no native executable rebuild for this browser fix.

## Consolidated 0.8.4 release (2026-10-15)

Release 0.8.4 is published on GitHub and deployed to the existing server after explicit authorisation, superseding the local-only holds below. Release 0.8.4 combines organisation sidebar controls, avatar appearance settings and two-column phone grids from the separate chats, plus MIT licensing in packaged distributions. The browser warning investigation required no product changes: disabling the injecting extension removed the warnings. User-facing changes are consolidated in CHANGELOG.md; release and preservation evidence is recorded in VALIDATION.md.

## Two-column phone grids - local build (2026-10-15)

Projects, designs and asset/upload cards use two equal columns in browser viewports up to 600px. Compact spacing, wrapping titles and smaller preview padding preserve readable cards and existing touch targets. Wider layouts retain their automatic column counts.

Verification: `npm run build` passes. Isolated Edge checks against the built frontend with in-memory workspace fixtures confirm two columns without horizontal overflow at 320, 393 and 600px, and projects/designs still fit at 601, 768 and 1440px. The 393px screenshots were inspected. No publication or deployment; real workspace data was not modified. Physical phone/Safari checks remain outstanding.

## Avatar menu and dark mode - local build (2026-10-15)

The user avatar opens an appearance menu with a Dark mode toggle in the workspace, desktop editor and compact browser header. Light remains the default; the explicit choice is saved in device-local storage and restored before React renders, including the browser login screen. Keyboard focus, Escape, outside click and Tab dismissal are supported. Shared interface colours adapt across cards, navigation, editor, chat and dialogs. Artwork, paper backgrounds and explicit contrast previews retain their original colours. No workspace schema or server changes are required.

Verification: local frontend build, 28 frontend tests, isolated Playwright theme checks (toggle, reload persistence, keyboard/focus dismissal, desktop/editor/mobile/settings colours, unchanged paper and blocked storage), plus the browser-history regression. The optimized Windows executable also builds locally; a separate preview with checksum-verified executable/runtime copies is in outputs/local-dark-mode-preview/. The user explicitly authorised local builds for this update and kept deployment on hold. No publication or deployment.

## Organisation sidebar controls — local test builds (2026-10-15)

Requested: reordering, a hover ellipsis menu, inline Rename, and Trash for an organisation and all its contents. Implemented drag-and-drop ordering and Alt+Up/Down on focused organisation buttons; ordering is saved per organisation and used in destination selectors. The menu also appears on keyboard focus and touch devices. Rename uses an inline textbox with Save/Enter and Cancel/Escape, rejects blank names, and preserves the draft when saving fails.

Organisation Trash atomically marks its projects, designs, assets and uploads deleted, retaining media, conversations, revisions and references. Shared libraries and other organisations stay unchanged. The organisation appears in Trash and can be restored with exactly the items deleted by that operation; previously trashed items remain deleted. Children cannot be individually restored until their organisation is restored. Active generation in any descendant blocks the operation. Local and server validation reject concurrent additions or restores into a trashed organisation. Optional metadata defaults preserve old workspaces and omit unset fields during serialization. Windows HTML5 dragging requires disabling Tauri's native file-drop handler; the window config now does so (uploads continue through the file picker).

Verification: 28 frontend tests, non-emitting TypeScript diagnostics, isolated development-browser checks for hover/menu, drag/keyboard order, reload, inline blank/cancel/save/error recovery, Trash/Restore, selection fallback and compact navigation, plus the existing browser-history regression. Rust source parses with rustfmt; backend regression tests cover cascade/restore, pre-existing trash, shared/other libraries, saved membership and invalid ordering. The initial no-build request was subsequently lifted for local testing only. All 26 native tests and 30 server tests pass (one separate network-login native test remains ignored). Local Windows portable, NSIS installer and Windows server packages are in `outputs/Local Test 2026-10-15-2234/`. Native MCP loader and bundled-runtime startup, ZIP integrity and checksums pass. The actual packaged server passes disposable-data tests for cascade, restart, exact restore, old trash, shared/other libraries and persisted order/rename. The installer was not executed. Test launchers use separate empty workspaces. No publication, deployment or real-user workspace changes occurred. See VALIDATION.md.


## Organisation libraries — 0.8.2 (2026-10-15)

Mark approved implementation and local/private-server testing of organisation switching/counts, separate Uploads and Assets, popup Reference/Place actions in a wider editor panel, and cross-organisation Copy/Move with preserved design history. Switching organisations retains the current section. After preview checks passed, Mark explicitly authorised GitHub publication and live-server deployment as 0.8.2. Implementation and preview verification are recorded in [ORGANISATION-LIBRARIES.md](ORGANISATION-LIBRARIES.md); release/deployment verification is recorded in VALIDATION.md.

## GitHub distribution status (2026-10-15)

Mark subsequently authorized compilation, packaging, remaining local checks and public distribution after checks pass. Public source is at https://github.com/markrugman/chatgpt-image-gen. [Release 0.8.1](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.8.1) includes the distribution setup, responsive browser layout and connection polish below. Local runtime/package qualification, clean release CI, anonymous image pull and real isolated Linux installer/backup/restore checks pass. The existing private server remains on 0.8.0. See [VALIDATION.md](VALIDATION.md) for evidence and limits. Earlier hold statements below record the historical sequence.

## Source-only GitHub distribution implementation (2026-10-15)

Mark authorized implementation of the README setup paths, server installer, companion installer changes and release workflow, while explicitly keeping compilation, packaging, publication and deployment on hold.

Implemented in source: public-release README quick starts and separate CHANGELOG; published-image-only Bash installer and release Compose file; native-app discovery and prerequisite checks in Install Companion.cmd; manual GitHub Actions workflow and release helpers with version agreement, required runtime files, draft releases and a separately opted-in/protected server-image publication step. Existing source-build Compose and live deployments are untouched. The connected GitHub login is verified as `markrugman`; the planned repository is `markrugman/chatgpt-image-gen`, not created by this task.

Verification: 18 source-only fixture tests pass (mock Docker/downloads and mocked Codex registration), Bash syntax passes, version metadata agrees at 0.8.0, YAML parses, and actionlint 1.7.7 reports no workflow errors. No application compilation, packaging, registry push, GitHub workflow execution, real companion registration or deployment occurred. Clean-machine setup, full image/installer acceptance and real generation remain deferred. See [maintainer release guide](RELEASING.md) and [server operations](SELF-HOSTED-SERVER.md).


## Pending connection-dialog polish (2026-10-15)

Source-only UI fixes requested after 0.8.0; compilation and deployment remain on hold. Keep me signed in overrides the general label column/grid rules with a horizontal, centered 16-pixel checkbox row. Native workspace-server management hides address/credentials/connect controls while connected, shows a connected indicator plus Refresh/Disconnect, and requests confirmation before switching to local storage. Cancel leaves the server connected; failed disconnects show the error without switching. Browser sign-out also requires confirmation. Loading status does not flash a disconnected login form. Existing copy/recovery tools and version reporting remain available.

Verification: 25 frontend tests and non-emitting TypeScript diagnostics pass. Local development preview with mocked IPC/HTTP verifies actual checkbox geometry, connected/disconnected views, confirm/cancel, failed disconnect and browser sign-out. No native/server release build, packaging, deployment or stored-data/key changes.


Release status (2026-10-15): the user subsequently authorised compilation and deployment. Owner login, remembered sessions, sidebar connection fixes and version reporting are included in 0.8.0. Earlier source-only hold notes below are historical. See VALIDATION.md for release checks.

## GitHub distribution design interview (2026-10-15)

Accepted by Mark in round 1:

- Public GitHub Releases for native and companion downloads, and a public GitHub Container Registry server image; users do not need a GitHub account to download.
- Initial supported distribution: Windows native app and local Codex companion; Debian/Ubuntu Linux Docker server. Other desktop platforms remain awaiting validation.
- Server installer requires existing Docker Engine and Compose, and points to installation instructions if either is missing.
- Companion means the existing local Codex integration that opens designs in the native app; provide a distributable Install Companion.cmd and a dedicated README setup path.
- README leads with Native app, Server and Companion setup paths; release history moves elsewhere.

Accepted by Mark in round 2:

- Offer browser image generation during server installation, selected by default; explain subsequent ChatGPT sign-in through browser Settings.
- Manual server updates through the same script with an explicit update option, using a specific published version and creating a backup before changes. Preserve the access key, workspace and ChatGPT sign-in; show the installed version on completion.
- Companion installer discovers the installed native app, checks Codex availability, and explains missing prerequisites rather than assuming a development folder.
- Public repository name: `chatgpt-image-gen`. Current product scope uses ChatGPT; other AI providers are not planned for now. GitHub owner was subsequently verified as `markrugman` during source implementation.

Accepted by Mark in round 3:

- Detect the installation host's private IP automatically when one suitable address exists; ask the user to choose when several exist. Default port is 8787. Display the complete browser/native connection URL.
- Initial release packages: Windows x64 installer, complete portable ZIP, companion ZIP, and Linux x64 Docker image. README presents the Windows installer as the primary desktop download. Other architectures await validation.
- Rerunning installation detects the existing installation and displays its status, URL and key without changing it unless an update is explicitly requested. Failed updates report the problem and retain the backup and previous-version information for recovery.
- One manually started GitHub Actions workflow builds matching native, companion and server packages, verifies them and prepares a draft GitHub Release for review before publication.

Deployment design is agreed. Mark explicitly reaffirmed on 2026-10-15: keep compilation and deployment on hold. The interview itself made documentation changes only; subsequent source implementation is recorded above. Repository availability remains to be verified before creation/publication; no repository has been created by this work.

Future implementation acceptance checks:

- README offers separate Native app, Server and Companion setup paths, with release history moved out of the quick-start flow and no development-folder assumptions.
- A clean supported Docker host can install a published server image without building source or authenticating to GitHub; completion displays a usable connection URL and privately retrieved Server Access Key.
- Browser generation setup leads to the existing ChatGPT sign-in flow; setup remains usable with browser generation declined.
- Repeated installation leaves the existing version, key, workspace and worker sign-in unchanged; explicit updates create a backup first, preserve those records and report health failures clearly.
- Companion installation discovers a normal native-app installation and explains missing native/Codex prerequisites.
- Release preparation produces matching versioned packages and a draft release; publication requires review. These checks remain unrun while compilation and deployment are deferred.

## Unreleased source changes — owner login (2026-10-15)

Approved by Mark: ownership established with the existing server access key; optional single username/password owner; key-only dismissal; browser/native login by either method; browser Keep me signed in. Explicit instruction: **do not compile or deploy yet; preserve existing creations and server access key**.

Source adds a separate authentication database and persisted/revocable sessions, salted Argon2id passwords, key-verified first-owner setup, browser session/persistent cookies, and native password-to-vault-token exchange. Empty-key new servers generate a stable private key file; existing configured keys retain precedence without being rewritten. Full behaviour and backup rules are canonical in SELF-HOSTED-SERVER.md. Frontend unit/source checks run; Rust integration tests are prepared but execution remains deferred because it would compile. Live server, existing data, key and release artifacts remain untouched.



## Unreleased source changes — sidebar connections and versions (2026-10-15)

Mark explicitly requested fixes only: do not compile, package or deploy yet. The running server and released 0.7.1 packages remain unchanged.

- Replace the fixed-position server badge with a matching sidebar connection card in normal flow. Both cards fit the sidebar and truncate long secondary text.
- ChatGPT and workspace cards open only their respective management dialog; general Settings remains separately accessible.
- Main Settings and workspace management show native app/server versions (browser interface/server when using the browser), with match/difference, local, unknown and offline states.
- Native app version comes from package build metadata. Server version uses the existing /health endpoint, with a short timeout; cached version data remains backward compatible. No server API or workspace schema changes.
- Twenty-two frontend tests pass, including direct dialog rendering, version comparisons, existing-server health reporting and non-blocking reporting failure. Native compilation, packaging, deployment and visual runtime acceptance are intentionally deferred.


Requested 2026-10-15. All three behaviour questions were accepted by Mark, who authorised implementation and packaging while preserving existing creations.

## Requested outcomes

- Resize the displayed document canvas with the application window.
- Extract an object from existing generated artwork into a reusable asset, such as the Black Rose shot glass in a Halloween poster.
- Add A2 (420 × 594 mm), A5 (148 × 210 mm), and A6 (105 × 148 mm) starting sizes.
- Support inches for custom document dimensions.
- Save created custom sizes and display a Custom sizes section below the standard starting sizes.
- Preserve existing creations when installing the next version.

## Accepted behaviour

1. Viewport fitting: default automatic fit to available width and height; manual zoom remains until Fit to window is selected. This changes display scale only.
2. Extraction: optionally draw a box around the desired object and supply a description or asset name. Open its asset workspace for AI-assisted transparent-background generation and refinement. Preserve the original poster; fine details may change. A crop is a generation reference, not an exact cutout promised to the user.
3. Custom size library: reusable across organisations, automatic dimension labels, deduplicate identical sizes, and allow removing a saved size without changing existing documents.

## Current storage evidence

The installed application uses Tauri app_local_data_dir with identifier com.mark.imagegenapp. Metadata is in workspace.sqlite3 and image files are under media, separate from the installed executable. Store initialization inserts an empty workspace only if none exists. The generated NSIS update path preserves application data; data deletion requires the explicit uninstall checkbox and is excluded in update mode. Version 0.2.0 retains the same identity and adds a default-empty customSizes field for older saved workspaces. Before its first write, opening an older workspace creates before-v0.2.0.zip with the original JSON and image bytes. Actual installer execution against the user’s installation is intentionally not part of acceptance testing.

## Verification

- Resize portrait and landscape documents in both automatic fit and manual zoom; verify document dimensions and exports remain unchanged.
- Extract a selected object from an existing revision, preserve the source, and reuse the resulting asset from another document.
- Create and reopen inch-based and paper-preset documents; verify physical PDF dimensions.
- Persist custom sizes across restart and verify duplicate/removal behaviour.
- Load a copy of the previous version's workspace and exercise new features without modifying the user's original workspace. Installer retention is verified by script inspection and backward-compatible data/restart checks; the live installation was not upgraded during development.

All implementation acceptance checks above passed. See VALIDATION.md for evidence and limits.

## Follow-up version 0.3.0

Mark approved both faithful extraction and clean recreation with an editable JSON description, plus contrasting preview backgrounds, on 2026-10-15. Implemented workflow and preservation details are canonical in ASSET-EXTRACTION.md; native checks and remaining limits are in VALIDATION.md. The first opening of older data creates before-v0.3.0.zip before recording workspace format 3. The app identifier and data location remain unchanged.

## Follow-up version 0.3.1

Mark requested object-adaptive extraction and JSON-analysis guidance, including logos, while preserving existing work. Automatic visual identification and explicit object-type overrides now select relevant logo, glass, food or general guidance. Logo instructions preserve lettering and flat artwork without the cocktail-specific template. JSON analysis records object_type and uses appropriate fields. Workspace format stays 3; the first opening of an existing workspace in this release saves before-v0.3.1.zip. Existing briefs are preserved and can be re-analysed. See ASSET-EXTRACTION.md and VALIDATION.md for details and evidence.

## Follow-up version 0.4.0

Mark requested logo extraction without regeneration and a clear Upgrade installer option. Keep original pixels provides native-resolution crop, optional connected-background alpha erasing, tolerance, undo/reset and contrasting previews. Exact retained pixels and original source files are preserved. Existing faithful and JSON recreation methods remain available. Upgrade is the default for an older NSIS installation; repair/reinstall is the default for the same version. The optional upgrade removal fallback uses /UPDATE to protect saved data. Storage identity and format stay unchanged; first opening creates before-v0.4.0.zip. See ASSET-EXTRACTION.md and VALIDATION.md for behaviour and evidence.

## Follow-up version 0.5.0

Mark approved both bleed methods, crop marks, RGB/CMYK PDF and JPEG quality controls, with a generic professional CMYK target. Implementation and limits are canonical in ADVANCED-EXPORT.md. The bundled target is Coated FOGRA39 (VIGC, 300% ink limit), converted using Little CMS and embedded in CMYK PDFs. Exact TrimBox/BleedBox/MediaBox dimensions and a screen colour comparison support review. Version 0.5.0 preserves the same data identity, format and installer Upgrade routing, with before-v0.5.0.zip on first existing-workspace launch. See VALIDATION.md for native and independent PDF checks.


## Optional private server — 0.6.0 (2026-10-15)

Approved: a separately deployable Rust Docker service, optional desktop connection in Settings, one private owner/workspace, LAN first and HTTPS reverse proxy for internet access. Generation stays on the client that starts it; the server stores shared workspace metadata and immutable media, never ChatGPT credentials or generation jobs.

Implementation uses SQLite and media on a persistent Docker volume; the existing local SQLite workspace stays separate and unchanged. Connecting never uploads implicitly. Explicit copy to an empty server verifies SHA-256 image uploads and the committed metadata. Access keys use the desktop system credential vault. Record-based optimistic merging accepts independent document changes and rejects stale edits to the same document/asset. Offline mode shows cached work; failed writes keep local recovery snapshots and new image files, exportable as workspace backups. There is no automatic offline replay or force overwrite. Shared-server restore is blocked; restore in local mode.

Canonical setup, workflow, limits and operations: [SELF-HOSTED-SERVER.md](SELF-HOSTED-SERVER.md). Workspace format remains 3 and app identity remains `com.mark.imagegenapp`; first existing-workspace opening saves `before-v0.6.0.zip`. Installer Upgrade behaviour is retained.


## Browser access and self-contained desktop install — 0.7.0

Mark approved shared browser access and an optional Linux generation worker. Desktop generation remains on the starting PC; browser generation uses the explicitly enabled server worker and survives closing the tab. The existing React editor and Rust operations are shared, rather than rewriting the application into WebAssembly. A private access-key login establishes an HttpOnly session; browser exports/backups download normally. Server worker credentials and provider sessions use a separate private Docker volume. The workspace identity/format stay unchanged.

Mark also clarified that destination PCs may not have Codex installed. The Windows installer now bundles the qualified official managed runtime and companion helper; Settings offers ChatGPT OAuth/device-code sign-in. Portable distributions include the runtime folder. Runtime versions are pinned and qualified with actual image generation, not capability detection alone. Setup and limits are canonical in SELF-HOSTED-SERVER.md; checks are in VALIDATION.md.


## Browser responsive layout (2026-10-15, source only)

- Browser windows at 1024px or narrower use a modal workspace-navigation menu and full-width Canvas / Tools / Chat editor views. Panels stay mounted so switching views preserves chat drafts. Wider browser windows and native desktop retain the existing panel layout.
- Removed browser-only desktop minimum width; viewport uses dynamic height. Workspace headers, cards, controls and dialogs adapt to phone widths. Custom dimensions place the units selector below width/height on phones. Chat controls have larger touch targets and readable text; short landscape chat layouts reserve room for the composer.
- Verified with local development preview and mocked read-only server responses at widths 320, 390, 768, 1024 and 1440: overview, navigation with Escape/focus restoration, create/extract/export/server dialogs, editor panels and preserved draft, phone/landscape/desktop resizing, landscape composer visibility, and narrow signed-out login. No horizontal clipping or frontend runtime errors in these checks. Existing mocked native disconnect/browser sign-out checks pass. Source TypeScript check emits no files; all 25 frontend tests pass.
- This is browser-emulated validation in Edge; physical phone/Safari and real mobile keyboard qualification remain outstanding. No release compilation, packaging, deployment, data migration or access-key change performed. Production remains on its prior release until deployment is authorised.
