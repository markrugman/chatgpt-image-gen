# Next version design interview

## 0.9.6 deployed and published (2026-10-17)

Mark confirmed the complete canvas design and explicitly requested implementation, testing and, once checks pass, deployment to the server and GitHub. This authorisation supersedes the earlier holds for the pending organisation highlight, Uploads drag/drop, template destination defaults and completed project composition-preview fix. All these changes are now deployed and public in [0.9.6](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.9.6) from `372e2c7128e9c691fe4be60081a1f5aa14e65b68`. Workspace/media, sessions/jobs and signed-in worker are preserved with verified stopped-volume/off-host backups. All final builds, tests, package/runtime and anonymous download/image checks pass. [VALIDATION.md](VALIDATION.md) records the evidence.

## Project previews include placed assets - local fix (2026-10-17)

Project cards now render the complete composition using the same renderer as design cards. Current-image previews include the selected history state's placed Asset/Upload versions and transforms; other revisions retain their saved overlays. An overlay edit brings the current composition forward using the design update time. The three unique recent images, imported backgrounds and deleted-design exclusion remain supported, and overlay-only pages also have a preview. Small compositions fit portrait/landscape pages inside the existing paper stack.

Regression coverage: `src/cards.test.tsx`; browser check: `node scripts/test-project-compositions.mjs`. This fix is local for the next release; no deployment performed by this task.

## Canvas context menu and shortcuts - implemented for 0.9.6 (2026-10-17)

Mark confirmed the following design and authorised implementation, tests and release:

- Commands target one selected overlay (a placed Asset or Upload). The generated page image remains the background. Cut/Delete removes the placement without deleting its library source; Copy/Paste/Duplicate creates another placement.
- Overlay context menu: Undo, Redo, Cut, Copy, Paste, Duplicate, Delete, Layer submenu (Move to top, Move up, Move down, Move to bottom) and Lock/Unlock. Right-click selects the overlay under the pointer before opening its menu. Empty canvas offers Undo, Redo and Paste. Unavailable actions remain visible but disabled.
- Canvas shortcuts: Ctrl+Z Undo; Ctrl+Shift+Z / Ctrl+Y Redo; Ctrl+X/C/V Cut/Copy/Paste; Ctrl+D Duplicate; Delete/Backspace Delete placement; Escape close menu/deselect; arrows Nudge, Shift+arrows larger Nudge. Use Command equivalents on macOS and show shortcuts in menu items.
- Shortcuts apply while working on the canvas; prompts, editable fields and dialogs retain their normal typing/text-editing shortcuts, including existing prompt image paste.
- Locked overlays remain selectable and copyable, while movement, resizing, rotation, layer changes, cutting and deletion are disabled. Duplicate/Paste creates unlocked placements. Lock state persists when reopening a design.
- The in-app overlay clipboard preserves the exact image version, size and rotation across pages/designs, including other organisations in the same workspace. Pasting creates an independent placement and does not transfer source-library ownership.
- Menu Paste uses the right-click location. Keyboard Paste and Duplicate use a 10-design-image-pixel offset, keeping the result visible and selected.
- Arrows nudge by one design-image pixel; Shift+arrows by ten, independent of zoom. A held-key movement is one undoable gesture.
- Cut/Paste/Duplicate/Delete/layer/Lock/Unlock each use one entry in existing page history, including generated-image changes. Copy/selection add no entries. Undo/Redo remains unavailable during generation.
- Images pasted from the operating-system clipboard onto the canvas become Uploads and unchanged overlays, rather than generation references. Save to the open design's owning organisation (matching chat paste), including when All organisations is selected; no destination chooser. Prompt paste retains its existing reference behaviour.
- Paste uses the latest supported clipboard content. A newly copied external image supersedes an older copied overlay; unrelated text does nothing on the canvas rather than pasting a stale overlay.
- External clipboard images initially use roughly 25% of canvas width, preserving proportions and fitting within the page. Keyboard paste centres them; menu Paste uses the right-click location. Multiple images are staggered to remain distinguishable.
- Continue after individual import failures, keeping successful uploads/placements and reporting filenames/reasons. One Undo removes the batch's placements; imported Uploads remain in their library.
- Custom-menu Paste attempts direct clipboard access where supported. If unavailable or denied, show "Press Ctrl+V to paste" (Command equivalent on macOS) and focus the canvas. Do not silently fall back to a stale copied overlay. Existing PNG/JPEG/WebP validation and 50 MB per-image limit apply. Browser clipboard-read constraints: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/read.
- Implemented with persisted backward-compatible overlay locks, serialized layout saves, stale-layout conflict checks and canvas-scoped clipboard events. The clipboard is cleared when switching storage workspaces. PNG/JPEG/WebP source bytes are preserved; pasted batches create one placement-history entry, leaving Uploads available after Undo.
- Production frontend canvas checks pass against a real disposable server in Edge/WebKit. Actual Windows clipboard image and overlay keyboard paste passes in Edge. Hidden isolated native WebView/IPC checks pass for lock persistence, duplicate/delete/undo, image import/placement and Uploads first card. Physical macOS/iOS clipboard behaviour remains unqualified.

## Uploads drag-and-drop and drawer upload card - local implementation (2026-10-17)

Mark confirmed the completed design and authorised local implementation/testing, with no deployment:

- Accept file drops across the Uploads drawer and full Uploads library, with a visible drop highlight including empty space.
- Add an upload-icon card as the first card in the Uploads drawer. Clicking it opens the file picker. Both picker and drop support multiple images.
- New uploads target the selected organisation even when viewing Shared; switch to its Organisation tab so the uploaded cards appear.
- With All organisations selected, ask for a destination organisation instead of silently saving to Shared.
- Drawer uploads save images without attaching references or placing overlays, and keep the current design open.
- Keep successful uploads when individual files fail, continue through the batch, and report failed filenames and reasons.
- Importing the same file again creates a separate Upload; do not overwrite or silently skip existing images.
- Fix the destination when the batch starts, even if the selected organisation changes during uploading. Show the destination alongside upload progress.
- Retain the deployment hold; this work is for the next release.

Implemented through one app-level batch upload flow, retaining progress/results across navigation and keeping the destination fixed. The drawer's first upload card works in empty, Organisation and Shared views. A chosen destination is displayed in the drawer without closing the design. The destination chooser requires an active organisation; with none available it explains that an organisation must be created. Assets and the `/upload` selection popup retain their existing controls. Existing PNG/JPEG/WebP validation and the 50,000,000-byte per-file limit are preserved.

Verification: `npx tsc --noEmit`, all 37 frontend tests, `node scripts/test-uploads.mjs`, `node scripts/test-uploads-server.mjs` and `node scripts/test-navigation-paths.mjs` pass. Edge/WebKit upload checks cover 393/1440px in both themes, picker/drop/multiple files, nested drag highlighting, mixed failures, repeat imports, oversize rejection, chooser/cancel/no-organisations, busy-batch rejection and destination preservation while switching organisation. Real disposable-server checks verify actual imports/rejection, original bytes, independent duplicates, unchanged design state and reload. Screenshots under ignored `work/uploads-*.png` were inspected. Physical device dragging and packaged native UI were not tested. No release build, version bump, source push, publication or deployment.

## Organisation selection highlight - local implementation (2026-10-17)

The selected Organisations row, including All organisations, now shares the Workspace selected-row background, text colour and font weight in both themes. Existing selection/navigation behaviour is unchanged. Verified locally with `npx tsc --noEmit` and isolated Edge/WebKit checks at 393/1440px: switching between two organisations and All organisations leaves exactly one organisation highlighted, its computed styles match the active Workspace row, and selection survives reload. Screenshots: ignored `work/organisation-highlight-*.png`. No release build, version bump, publication or deployment; held for the next release as requested.


## New template destination defaults - local implementation (2026-10-16)

New template inherits the folder currently open and that folder's library, including when browsing a folder through All organisations. General uses the current organisation or Shared scope; All templates retains the existing default library and General folder. Both controls remain editable, and changing Library resets Folder to General. Existing templates retain their saved locations. This update is local only; production remains 0.9.5. Frontend build and all 37 frontend tests pass. Isolated Edge/WebKit checks at 320/393/1440px verify default Library/Folder values and saved action destinations for organisation, Shared, General and All organisations folder contexts.


## Optional template details - privately deployed in 0.9.5 (2026-10-16)

A Name and Recipe are sufficient to save a template. Add an Example image, Tags and Usage notes later through Edit template. Image references are validated when supplied; templates without an example offer recipe-only use. Built locally and deployed to the existing server after explicit authorisation. Edge/WebKit minimal-save, reload and later-enrichment checks pass; production data and signed-in worker are preserved. See [validation](VALIDATION.md). No public release or GitHub push.

## 0.9.4 deployed and published (2026-10-16)

Mark explicitly authorised building and deploying all completed navigation and Templates drawer changes. They are now deployed on the private server and public in [GitHub 0.9.4](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.9.4) from `8f430f3ee587eb3189bc9bb1bfddd38640a977e6`. All builds/tests, compiled Edge/WebKit UI matrices, live read-only browser checks, package/runtime checks and anonymous image/download qualification pass. Workspace/media, access key, sessions/jobs and worker sign-in are preserved with stopped-volume and off-host backups. This supersedes the wait/source-only/pending statuses below. See [VALIDATION.md](VALIDATION.md) for evidence.

## Templates drawer folders and library-only management — source only (2026-10-16)

Mark requested folder-first browsing in the design Templates sidebar. Compact Templates pickers now initially show alphabetically sorted folder preview cards, including General. Selecting a folder shows only its templates; a Folders back button returns to the folder list. Folder-name search is available at the root, with template name/tag/recipe search inside a folder. Scope changes return to the folder list. The drawer has no folder dropdown, rename/delete controls or folder-management dialogs; template Use Template / Use and Attach as Style popups remain available.

Folder management lives in the full library's three-dot Edit folder dialog: edit the name, Save/Cancel, or Delete folder with a separate padded confirmation. The library toolbar no longer displays inline rename/delete actions. The selected-folder heading also exposes the three-dot dialog. General has no management action. Deletion uses the dialog's folder ID, including from the overview, and retains the existing move-to-General behaviour.

Verification: `npx tsc --noEmit`, all 37 frontend tests, the navigation matrix and the Templates scope checks pass against development source. `node scripts/test-template-folders.mjs` covers sorted folders, search, back/empty/scope transitions, selection, absence of drawer management, and mocked library rename/delete at 320/393/768/1440px in light/dark in Edge/WebKit. Screenshots inspected under ignored `work/template-folder-drawer-*.png`. Existing drawer checks include opening General before template selection; affected server/native acceptance scripts are updated for folder-first pickers but their runtime suites were not repeated. No release build, version bump, source push or deployment; the earlier request to wait for more changes remains in effect.

## Navigation and compact sidebar — source only (2026-10-16)

Mark approved implementation and navigation testing, then explicitly requested waiting for more changes. Do not release-build, publish or deploy this pending work. Production and the published release remain 0.9.3.

The compact editor sidebar now navigates to the full Overview, Projects, Assets, Uploads, Templates and Trash pages, using the same handlers as the main sidebar. The editor's top library tools remain local drawers. Removed the obsolete sidebar-to-drawer request path.

Shared navigation state now serializes organisation, project, design/page, asset/upload, library scope, Templates folder/detail/filter, and workspace search/query category into the existing hash URLs. Back/Forward, direct hash changes and reload restore these destinations. Search typing updates one search entry rather than adding an entry per character. Template-detail Cancel returns to its parent entry where available; direct-link closure replaces the detail with its parent. Temporary creation/management dialogs and editor tools add no history entries. Copy/Move dialogs retain the detail route and return to details when cancelled. Missing/deleted targets recover to a valid parent, with canonical URL corrections replacing the current entry instead of creating a loop. Avoid redundant history writes on restoration because Safari enforces a write-rate limit. Ctrl+K focuses workspace search after leaving the editor.

Verification without a release build: `npx tsc --noEmit`, all 37 frontend tests, `node scripts/test-browser-history.mjs`, `node scripts/test-editor-opening.mjs` and `node scripts/test-navigation-paths.mjs` pass. The new matrix covers 21 direct-link/reload destinations and folder/detail/scope/filter, every sidebar destination from design mode, top tools, design-page selection, organisation switching, workspace search return, Ctrl+K, transient dialogs, live hash changes, and invalid/deleted targets in Edge and WebKit at 393/1440px. The editor-opening regression also covers 393/768/1024px and desktop resizing in both engines. All browser fixtures are isolated from production and reject workspace mutations. Physical Safari and native operating-system deep-link registration were not tested or changed. No production build, packaging, version bump, source push or deployment was performed.

## 0.9.3 deployed and published (2026-10-16)

The Safari template-example containment, visible Templates folder cards, Create/Rename folder spacing and uniform preview backgrounds below are now deployed on the private server and published in [GitHub 0.9.3](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.9.3). All tests/builds and anonymous package/image qualification pass; workspace/media, access key, sessions and worker sign-in are preserved. This supersedes the local-only/pending status below. Physical Safari confirmation remains pending. See [VALIDATION.md](VALIDATION.md) for source, workflow, backups and evidence.

## 0.9.3 release preparation (2026-10-16)

Mark authorised fixing the physical Safari template-preview overflow, building and deploying all pending UI changes to the server and GitHub. Template example images now use explicit width/height inside a bounded, clipped preview with `object-fit: contain`, removing reliance on percentage max-height in a flex container. A tall 1024×1536 PNG fixture verifies loaded-image bounds, form layout and footer reachability in Edge/WebKit in light/dark at 320/393/768/1440px. The available modern WebKit did not reproduce the physical-phone overflow before the change; physical Safari confirmation remains outstanding.

## Uniform preview backgrounds — local changes (2026-10-16)

Design previews in Projects now use the same shared checkerboard as Assets, Uploads and Templates in both themes. Removed the design-specific base and dark-mode background-colour overrides that produced the harsher checkerboard; artwork and composition paper are unchanged. `npm run build` passes. Isolated Edge/WebKit computed-style checks confirm identical background colour, gradient, sizing and positioning at 320/393/1440px in light/dark; screenshots inspected under ignored `work/uniform-previews-*.png`. Not deployed or published.

## Template folders — local changes (2026-10-16)

The full Templates library now shows a Folders section above All templates, using the Projects page's card, folder icon and stacked image-preview styles. Cards include General and every folder in the selected library scope, show active template counts, and open a folder filter with an All templates return control. Custom folders expose Rename through their three-dot control; the existing folder dropdown and rename/delete controls remain available. Compact template pickers retain their existing layout. The Create/Rename folder dialog also uses the shared padded body and separated Cancel/Save footer.

Verification: `npm run build`, all 28 frontend tests, and `node scripts/test-template-scope.mjs` pass. The browser checks cover folder navigation, General, counts/previews excluding Trash, Shared/organisation scopes, search and rename ownership in Edge/WebKit at 320/393/1440px in light/dark. Screenshots inspected under ignored `work/template-folders-*.png`. Local only; not deployed or published.

## GitHub 0.9.2 published (2026-10-16)

Mark requested deploying the completed 0.9.2 changes to GitHub. Source commits are pushed and [0.9.2 is public](https://github.com/markrugman/chatgpt-image-gen/releases/tag/v0.9.2), including the previously private 0.9.1 improvements. All five workflow jobs, actual CI portable/runtime/companion checks, anonymous downloads/checksums and immutable Linux image checks pass. The existing private deployment remains in place. Publication evidence is in VALIDATION.md.

## 0.9.2 built and deployed (2026-10-16)

Mark explicitly requested building and deploying all changes below: compact template cards and management dialog, All organisations filtering, compact composer/reference-role menus and collapsible user chat messages. This supersedes their local-preview/deployment holds. Version 0.9.2 is built locally and deployed to the existing private server, with Windows installer/portable/companion packages verified. Live Edge/mobile WebKit verify the new behaviour and unchanged workspace. Complete stopped-volume/config backups have a checksum-verified off-host copy; all 49 media hashes, 16 designs, 21 library items, server identity, sign-in and sessions are preserved. See VALIDATION.md. No GitHub push or public release was performed.

## Collapsible user chat messages - deployed in 0.9.2 (2026-10-16)

Mark requested that large prompts occupy only a few lines in the design chat. User messages in Discuss and Generate/Edit now show at most five rendered lines by default, with More… and Show less buttons for independent expansion. The control appears only when text exceeds five lines at the current width, and remeasures when the layout changes. Full text remains in the message and DOM; saved history, request payloads, references, template records and assistant responses are unchanged. The button exposes expansion state and its controlled content for accessibility.

Verification: production frontend build and all 28 frontend tests pass. The isolated built-frontend fixture `work/test-message-collapse.mjs` passes in Edge/WebKit at 393/1440px, covering multiline and long paragraph prompts, full text preservation, independent expansion, keyboard collapse, short messages, assistant messages and no browser errors. Light/dark screenshots inspected under `work/message-collapse-*.png`. Included in the verified 0.9.2 packages and deployment above.

## Compact Templates page cards - deployed in 0.9.2 (2026-10-16)

The All organisations view now lists every active template across organisation and Shared libraries, matching Assets/Uploads; Shared remains a separate filter. The previous code mapped no selected organisation to Shared and hid the All organisations tab. All-library folder choices and card subtitles identify the owning library; renaming a folder retains its original organisation. `node scripts/test-template-scope.mjs` reproduces the original missing-template bug and passes after the fix in Edge/WebKit at 393/1440px, covering Shared, organisation switching, tag search, folder filtering, Trash exclusion and folder-rename ownership. Build, 28 frontend tests and ten real-server acceptance groups also pass. Included in 0.9.2.

Mark requested the same card aesthetic as Assets, Uploads and designs, with details behind the three-dot button. Full-page Templates now uses the shared asset preview, card caption, truncated title, folder subtitle and ellipsis button. Recipe, tags and usage notes appear in Edit template; Duplicate, Copy to…, Move to… and Move to Trash are available inside that dialog. Clicking the preview or title also opens it. Drawer selection remains unchanged.

Verification: production frontend build, all 28 frontend tests and ten real-server template acceptance groups pass. Isolated Edge/WebKit checks cover light/dark at 320/393/768/1440px, compact card contents, dialog fields, Save/Duplicate/Copy/Move/Trash request routing, keyboard opening/Escape/focus restoration and overflow. Local screenshots are under ignored `work/template-cards-*.png` and `work/template-details-*.png`; the fixture is `work/test-template-cards.mjs`. Included in the verified 0.9.2 packages and deployment above.

## Compact composer and reference-role menus - deployed in 0.9.2 (2026-10-16)

Mark requested screenshots before deployment. The selected template normally shows only its image, title and Remove template; usage notes, Attach example as Style and generation-instruction disclosure are removed from the composer. Existing actionable update/deletion/output-setting notices and preview errors remain available. Canonical request preparation and historical request snapshots are preserved internally.

References return to small image/title/remove pills, with their role available as a tooltip. Asset/upload popup menus replace Reference with **Add as…**, opening a contained menu for **Style, Subject, Logo, Other**. This applies in drawers and slash-command pickers. Choosing a role sets it directly on the request without duplicating an existing reference. Inline role selectors and optional purpose-detail inputs are removed; existing saved explanations remain intact in historical snapshots.

Local production frontend build, 28 frontend tests, ten real-server template acceptance groups and Edge/WebKit drawer checks pass. A local preview using copies of existing library images verifies all eight asset/upload role choices in intercepted submission payloads on desktop Edge and mobile WebKit, including empty explanations and compact composer layout. No preview generation, workspace mutation, native rebuild, GitHub push or deployment was performed. Screenshots and evidence are under ignored `work/reference-ui-preview/`; this preview was subsequently authorised, built and deployed as 0.9.2 above.

## Templates library styling - built and deployed in 0.9.1 (2026-10-16)

Mark authorised building and deploying all of these template/drawer/form updates on 2026-10-16. Version 0.9.1 Windows installer/portable/companion packages are built and verified locally, and the existing private server runs the qualified local Linux image. Source is committed locally; no GitHub push or public release was performed. See [final validation and preservation evidence](VALIDATION.md).

Templates now follows Assets/Uploads: shared page heading with full-size icon actions at the right (Create folder, then purple New template), a recipe-specific information strip, underlined library tabs, a separate search/folder row, the shared asset grid/card/checker preview styles and a shared empty state. Organisation tabs show the organisation name on the library page; the all-organisations selection continues to show Shared templates. Existing template ownership, search, folders, editing and generation behaviour is preserved.

Verification: `npm run build`, all 28 frontend tests and all ten groups in `node scripts/test-templates.mjs` pass against a disposable real server. Isolated Edge and WebKit layout checks pass in light/dark at 320/393/768/1440px, covering both library contexts, creation dialogs and no horizontal overflow; desktop/phone screenshots inspected. Build/deployment qualification is recorded in VALIDATION.md.

The Assets, Uploads and Templates editor drawers now share two-column image/title tiles and the same popup component. Templates omits recipe/notes/tags and library-management actions in pickers; its menu offers **Use Template** (recipe only) and **Use and Attach as Style** (recipe plus the example as an explicitly labelled Style reference). Existing draft text and references survive selection, repeated Style attachment does not duplicate references, and compact selection opens Chat. The `/templates` dialog uses the same tiles and menu. Full-page template management remains available.

Drawer verification: `node scripts/test-library-drawers.mjs` checks all three drawers in Edge/WebKit, light/dark, at 320/393/768/1440px: two columns, image/title-only cards, popup bounds for both columns and the last row, keyboard navigation/Escape/focus restoration, both template actions, deduplication and compact Chat switching. Updated real-server template acceptance checks also cover both menu actions and resulting generation inputs. Build and all 28 frontend tests pass. Screenshot fixtures are under ignored `work/drawer-*.png`.

The New/Edit template form also uses the shared padded `form-body` and separated `modal-footer`, with right-aligned Cancel/Save controls, field-local helper text, a styled file chooser and bordered example preview. Library/Folder use the shared two-column form grid and stack on phones. Existing upload, validation and save behaviour is unchanged. Build, 28 frontend tests and real-server template acceptance pass; isolated Edge/WebKit new/edit checks cover both themes at 320/393/768/1440px, including spacing, preview, responsive fields, no horizontal overflow and reachable footer controls. Screenshots inspected under ignored `work/template-form-*.png`. Included in the qualified 0.9.1 local packages and private deployment.

## Templates — released in 0.9.0 (2026-10-16)

The approved [Templates design and acceptance specification](TEMPLATES.md) is implemented with organisation/Shared libraries, user folders and General, tags/search, creation from images/revisions or uploads, editing/duplication/transfers/Trash, and `/templates` selection alongside `/asset` and `/upload`. Generation uses explicit reference purposes, a canonical visible request, fresh initial context and immutable request snapshots for draft/history reuse. T01–T24 have local coverage, including real server/browser and hidden native IPC/WebView checks, backup/restart/compatibility tests, plus two actual managed-ChatGPT generations. The linked specification records evidence and environment limits. Published and deployed as 0.9.0 after explicit authorisation; see [release validation](VALIDATION.md). No installer ran over the user installation.

## Canvas on opening compact editors - released in 0.9.0 (2026-10-16)

Assets, uploads and designs opened from projects start on Canvas in compact browser layouts (through 1024px), even after a previous editor opened a library drawer. The editor retains the requested desktop library tab but only switches the compact view to Tools for a new explicit library request within the current editor. Resizing no longer replays a previous request. The existing Canvas/Tools/Chat controls remain available.

Verification: TypeScript checks, all 28 frontend tests and `node scripts/test-editor-opening.mjs` pass. Isolated Edge and WebKit fixtures cover assets, uploads, project designs, explicit library navigation, Back/Forward, reload and resizing at 393/768/1024px, plus simultaneous canvas/chat/library visibility at 1440px. Published and deployed in 0.9.0; live Edge/WebKit checks pass without workspace mutations.

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
