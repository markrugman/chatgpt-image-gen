# Responsive workspace local implementation

2026-10-19. Implemented following Mark's approval of the [Design Brief](DESIGN-BRIEF.md) and [Spec Sheet](SPEC-SHEET.md). Mark subsequently requested deployment to the existing local server for testing. **LAN server testing is authorised; public release, GitHub publication and replacement of the installed Windows app remain on hold.** Product version remains 0.11.0.

## Review

**Also local, not deployed:** composition thumbnails clip off-page placements to the document rectangle. The shared Home/design/project preview container now hides overflowing artwork without changing placement data or source files. `scripts/test-preview-clipping.mjs` reproduces the original overflow and checks left/right/top/bottom edges, rotated placements and portrait/square/landscape previews in Edge/WebKit, both themes, at phone/desktop widths. Evidence: `outputs/preview-clipping/`.

**New layout, local review only:** selected Asset/Upload size, rotation, layer-forward and removal controls appear in a floating pill above the canvas. Image framing and Asset preview swatches use the same floating treatment when no placement is selected. Undo/Redo, zoom and page count share the bottom status bar; phone page counts are compact and keep a full accessible label. The pill stays outside the measured viewport and its space is reserved regardless of selection, preventing canvas movement. Local screenshots/evidence: `outputs/responsive-review/floating-tools/`; regression: `scripts/test-floating-canvas-tools.mjs`. This layout is not deployed; the LAN server remains the interaction-fixes release described below.

**Deployed for LAN testing:** Mark explicitly authorised deployment of the drawer-switching and context-menu fixes, lifting the previous local hold. The dock/tablet rail remains interactive while Pages, Tools or Chat is open; switching retains the same Back entry, drafts and tool filters. The canvas stays inert. Keyboard focus includes the active drawer and its navigation; drawers are nonmodal dialogs so assistive technology can reach the switcher. Export and other native modal dialogs still block background navigation. Short phone layouts reserve space for the dock. `scripts/test-drawer-switching.mjs` passes direct touch switching, state retention, single-entry Back, Canvas/Escape and export isolation in Edge/WebKit at 320×740, 390×844, 390×480 and 820×1180. Both fixes now run as `interaction-fixes-20261019`; public publication and installed Windows app replacement remain on hold.

**Context-menu fix, now deployed for LAN testing:** Mark rejected the added phone Place/Reference action row and reaffirmed click-to-place, right-click/long-press-for-menu. That row and its styles are removed. Asset/Upload drawers place on one mouse click or short touch tap; a 500 ms touch hold opens the existing Add as/Place menu. Hold release cannot place or activate a menu item. Movement over 10 px, pointer cancellation and a second finger cancel the hold. Existing keyboard menu controls, desktop dragging and non-placement Template/picker activation remain intact. `scripts/test-library-context.mjs` verifies Assets and Uploads in both themes at phone/desktop widths, trusted Edge touch streams, real WebKit taps plus synthetic holds/cancellation, reference roles and unchanged original media/asset versions. Physical-phone long-press qualification remains pending user testing.

Deployment evidence for both fixes: `work/interaction-deploy/` (private/ignored). Backup `before-interaction-20261019T191711Z` has verified full stopped-volume and off-host copies. All 30 designs, 29 library items and 83 media hashes, configuration, sessions/jobs and byte-identical signed-in worker credentials survived cutover. Live Edge/WebKit drawer switching and context interactions pass; live placement requests are intercepted to keep test edits out of the production workspace. The completed live runs preserve the workspace. Previous `checker-fix-20261019` is registered as rollback. See [validation](../VALIDATION.md) for the current deployment record.

The responsive workspace is deployed for testing at [the existing LAN server](http://192.168.178.96:8787). This uses the real workspace and signed-in worker. The private frontend image keeps the qualified 0.11.0 backend unchanged. Current release directory is `interaction-fixes-20261019`; the public 0.11.0 release and installed Windows app are unchanged.

The dark checkerboard follow-up removes the responsive thumbnail base-colour override. The shared pale checkerboard is restored on Home and Asset cards in both themes; artwork and export paths are unchanged. The production frontend build and targeted Edge/WebKit checks pass, including reproduction of the faulty override, Home/Assets/canvas, light/dark, and phone/desktop. Live checks pass with the workspace unchanged. Private evidence/screenshots are in `work/checker-deploy/`, and reusable regression is `scripts/test-transparency-background.mjs`. Backup `before-checker-20261019T190147Z` has verified stopped-volume and off-host copies. All 30 designs, 29 library items, 83 media hashes, sessions/jobs/configuration and byte-identical signed-in worker credentials are preserved. `drawer-fixes-20261019` is registered as rollback.

The screenshot follow-up fixes separate Pages from Tools, contain the Ready status inside Chat, enable tap/keyboard/swipe drawer handles, and vertically centre the export header title. The targeted regression passes in Edge/WebKit at 320/390/820/1600 px, including emulated touch taps and pointer drags; the broader six-width light/dark suite and detail workflows pass again. Live LAN checks pass all eight browser/width combinations without changing the workspace. Job status is simulated in those browser checks; no generation is requested. Real physical iPhone gesture verification remains for user testing.

Follow-up backup `before-drawer-20261019T185551Z` has verified complete stopped-volume and off-host copies. All 30 designs, 29 library items and 83 media hashes, configuration/sessions/jobs and byte-identical signed-in worker credentials are preserved. Private deployment and live capture evidence is in ignored `work/drawer-deploy/`; repeat the targeted test with `node scripts/test-responsive-drawers.mjs`.

Live Edge and WebKit checks pass at all six sizes listed below in both themes, covering Home, canvas bounds, Chat draft persistence, tool sheets, browser Back, More, export reachability and actual PNG downloads. Both browser runs verify the workspace is unchanged. Testing on the actual plain-HTTP LAN origin caught and fixed a secure-context dependency in sheet history identifiers; opening phone/tablet sheets now works on this origin. These remain browser viewport checks, not physical-device qualification.

Deployment preserves all 30 designs, 29 library items and 83 media hashes, configuration, server identity, existing sessions/jobs and byte-identical signed-in worker credentials. Complete stopped-volume backup `before-responsive-20261019T184428Z` was copied to `%LOCALAPPDATA%/ImageGenBuild/server-backups/` and checksum/archive verified before cutover. The corrected frontend reuses that backup only after exact workspace/media/auth comparison. Other application containers were unchanged. Private operational evidence and screenshots are in ignored `work/responsive-deploy/`.

The initial responsive deployment's retention registration and cleanup passed with `v0110-release` as its rollback. The drawer follow-up's registration and cleanup also pass: `responsive-preview-20261019-r2` is the rollback, superseded artifacts are archived and verified off-host, and live volumes remain preserved. Server storage remains 44% used with approximately 25 GiB available.

Open [the local sample workspace](http://127.0.0.1:4175). The localhost preview uses its own workspace under `outputs/responsive-review/workspace`, sample poster artwork, and a disabled generation worker. Editing these samples does not change the installed app or production workspace. Desktop, tablet and phone layouts can be reviewed by resizing the browser. The preview is bound to loopback, so this URL is for this computer.

Use [Review Responsive Design.cmd](../../Review%20Responsive%20Design.cmd) to reopen the running preview or build/start it again. Keep the launch window open when it starts a new preview. Existing app launchers are unchanged.

Actual implementation captures and downloadable test files are under [local verification outputs](../../outputs/responsive-review/verification); the [screenshot gallery](../../outputs/responsive-review/review-gallery.html) collects representative screens. Original design mockups remain in `examples/` and are labelled separately from the working application.

## Implemented behaviour

- Transparency previews keep the original pale checkerboard in both themes. A responsive card override had changed only the base to `--page`, leaving pale checker squares over a dark base. Removing that override restores the shared `.checker` treatment without changing artwork or export compositing. `scripts/test-transparency-background.mjs` reproduces that override and checks Home, Assets and canvas colours in Edge/WebKit, both themes, phone/desktop.
- Phone/tablet Pages has a distinct navigation state and page-only drawer. Tools excludes Pages and retains its selected tool and filters while visiting Pages. The completed-request indicator stays inside the Chat dock button as an accessible status dot. Phone drawer handles accept tap/keyboard expansion and pointer swipes: up expands, down collapses, and down again dismisses through the existing Back handling. Chat uses the same handle. The export title is vertically centred against its Close control.
- Home leads with Continue designing, followed by projects and a reusable-prompt Template shortcut. Project-only navigation retains its existing ordering. Current composed previews, distinct-design project previews, sorting and organisation ownership remain in their existing data paths.
- The editor has a 64 px tool rail, a collapsible 288 px drawer and 360 px conversation at widths of 1280 CSS px and above. Global workspace navigation is reached through Back rather than occupying a second editor rail.
- At 768–1279 px, the rail stays available and tools/Chat use one right overlay sheet. Below 768 px, a four-destination dock opens bottom sheets. Tools can expand/collapse with an explicit button.
- Tool subtrees remain mounted, preserving library filters and scroll positions. Draft text, references and selected artwork remain in the editor when panels change. Asset/Upload cards use click/tap to Place and right-click/long-press for context options; the initial responsive phone action row has been removed at Mark's request. Keyboard menu controls and dragging remain available.
- More groups supported document actions. Export stays labelled in the header. Save progress/errors and ongoing/completed/failed request indicators remain reachable.
- The canvas stays inert while a drawer is open; the active drawer and navigation share a keyboard focus loop. Escape, backdrop and Back dismiss sheets. History entries drain before a dismissed sheet exposes the canvas, preventing navigation races on fast design switches and breakpoint changes. Switching pages consumes the sheet entry before navigating to the page. Direct drawer switching is deployed for LAN testing, as noted above.
- Shared responsive rules now apply to native windows. Native minimum inner dimensions are 320 × 480, replacing the previous desktop-only minimum.
- Export uses the existing exporter inside a focused panel/sheet. Document dimensions, output dimensions, source resolution and page scope are explicit. A captured composition stays stable during export. File-save failures retain settings and allow Retry. PNG transparency, JPEG quality, PDF page scope and advanced print options retain their existing implementations.
- Initial workspace errors offer Retry; refresh failures preserve already loaded work. Compact Chat responds to changes in available visual-viewport height without clearing its draft.

The glossary remains unchanged: Templates are reusable prompts, Assets/Uploads are distinct libraries, Reference guides generation, and Place preserves an original image. No storage migration or backend behaviour change was required.

## Verification

| Check | Result |
|---|---|
| Production frontend build | Pass |
| Existing frontend unit suite | 64 tests across 15 files pass |
| Compiled UI with real disposable server/storage | Edge and WebKit, light/dark, 320 × 740, 390 × 844, 820 × 1180, 1024 × 760, 1280 × 800, 1600 × 1000 |
| State and navigation | Draft/reference/filter persistence, resize transitions, focus trapping, Back, grouped More, placement/undo and source-version preservation pass |
| Export files | Actual PNG/JPEG/multipage PDF downloads and failed-download Retry pass; source images/Assets remain unchanged |
| Transparency | Actual Asset PNG downloads retain transparent pixels; analysis recorded with local outputs |
| Additional workflows | Template selection, reduced visual-viewport simulation, focus return, backdrop dismissal and page-switch Back pass in both engines |
| Canvas regression | Existing selection/deselection stability passes in Fit and manual zoom in Edge/WebKit at 1440/768/393/320 px |
| Native | Separate-identifier hidden Windows debug build; actual WebView2/IPC checks at 1600/820/390/320 px using CDP viewport emulation |

Browser evidence: `outputs/responsive-review/verification/results.json` and `detail-results.json`. Native evidence: `outputs/responsive-review/native/results.json`. Browser job-status checks use simulated job responses against the disposable server; they make no provider calls. The review worker is disabled. Physical phones, a real software keyboard, manual screen-reader use and native physical-window dragging have not been qualified; the keyboard and native viewport checks are simulations in their respective actual browser engines.

Reproduce from the repository root:

```text
npm run build
npm test
node scripts/test-responsive-workspace.mjs
node scripts/test-responsive-details.mjs
node scripts/test-responsive-drawers.mjs
node scripts/test-drawer-switching.mjs
node scripts/test-library-context.mjs
node scripts/test-floating-canvas-tools.mjs
node scripts/test-canvas-selection-layout.mjs
node scripts/capture-responsive-review.mjs
```

The browser checks require the existing local server executable at `server/target/debug/image-gen-server.exe`, installed Edge, and Playwright WebKit. They create disposable workspaces and stop their own servers. The preview launcher uses persistent sample data only under its dedicated review directory.

For native acceptance, use the repository's normal Cargo PATH/target setup, then:

```text
npm run tauri -- build --debug --no-bundle --config scripts/responsive-native-config.json
node scripts/test-responsive-native.mjs
```

The test copies that isolated build into `outputs/responsive-review/native`, starts it hidden with a disposable `IMAGEGEN_DATA_DIR`, checks real IPC and the WebView, then stops it. This is an acceptance executable, not an installer or a replacement for the installed application. The native helper assumes the normal Windows build cache at `%LOCALAPPDATA%/ImageGenBuild/target`.
