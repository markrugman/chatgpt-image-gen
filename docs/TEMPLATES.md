# Templates — design and acceptance specification

Status: implemented and locally validated, 2026-10-16. The user approved the complete design and its four edge cases, then authorised implementation and acceptance checks. No deployment or publication has been performed.

## Purpose

Save reusable image-generation recipes with recognisable examples, then apply them to different subjects without finding a website or copying an earlier conversation. Templates appear alongside Assets and Uploads in the library and image-creation picker. At most one template can be selected per generation; ordinary generation without a template continues to work.

Example: select Flat Vector Avatar, attach two photographs of the same person as Subject, and add “use a navy background and keep my glasses”. Source inspiration: https://chatsmith.io/blogs/prompt/ai-avatar-prompts-00346. The user's screenshot shows several avatar styles saved as designs.

## Template contents

| Field | Behaviour |
| --- | --- |
| Name | Required, editable display name. |
| Recipe | Required plain-text generation instructions, editable without configurable fields or a placeholder engine. |
| Example image | Required browsing preview. Excluded from generation unless explicitly attached as Style. |
| Library | One organisation or the separate Shared Library. |
| Folder | Exactly one within that library; defaults to General. |
| Tags | Optional multiple searchable labels. |
| Usage notes | Optional guidance shown on selection, e.g. “Attach photographs of the same person as Subject.” Separate from the recipe sent to generation. |

Templates do not store dimensions or transparency presets initially. Current design settings govern output. Source photographs, logos and conversations are not bundled into the reusable template.

## Creating templates

### From existing work

1. Choose Save as template on the current image or a selected earlier revision.
2. Open an editable form with that exact generated image as the preview, excluding overlays.
3. Prefill its generation prompt. For a template-derived request, expose the recorded recipe and additional instructions as starting material without losing the overrides.
4. Make the source conversation and references available for review. Do not automatically copy the conversation into the recipe or carry its attachments into future uses.
5. Review the recipe so it stands alone: for example, replace photo-specific wording with “the person shown in the Subject references”.
6. Enter a name, choose organisation/Shared destination and folder, optionally add tags and usage notes, then Save. Cancel creates no template.

A final edit such as “make the background blue” may depend on several earlier turns. Explain that those instructions need consolidating into a self-contained recipe. Copying the final prompt alone does not necessarily capture a multi-edit result. Source history is review material, not hidden template context.

### From scratch

New template opens the same form with an example-image upload and a pasted or typed recipe. Use existing supported image import/validation behaviour. Saving does not generate an image.

## Using templates

1. Open Templates next to Assets and Uploads, choose organisation or Shared library, then browse/search.
   In the chat composer, `/templates` opens the same template selector, following the existing `/asset` and `/upload` interaction. The command is removed from the generation text while preserving other draft instructions.
2. Selection captures the current template name and recipe into the draft and shows its example and usage notes. Only one template can be selected.
3. Attach references through existing flows and assign purposes. Attaching the example explicitly assigns Style; selecting the template alone does not attach it.
4. Add optional per-generation instructions. A nonempty recipe permits an empty additional-instructions box.
5. Expand View generation instructions to inspect the recipe, overrides, reference purposes and output settings.
6. Generate with fresh context: no previous page conversation and no automatically attached current page image. Earlier page work remains recoverable. A current/source image influences this request only when explicitly selected.
7. Successful submission clears the selected template alongside existing submitted draft/reference clearing. Later instructions continue editing the generated result normally. Selecting a template again starts another fresh generation.

Switching templates replaces only the recipe/selection, retaining user instructions and explicit references. Those references remain visible and removable, including an example previously attached explicitly.

Removing a template removes its recipe/fresh-start selection without erasing user instructions or references. Successful submission means the app accepted the request, matching the existing composer lifecycle; it does not mean waiting for image generation to finish. A rejected submission preserves the draft. Retry/reuse retains the captured request inputs.

## References and request composition

Each reference has a visible, editable purpose: Subject, Style, Logo or Other, plus an optional explanation. New references default to Other. Do not infer purposes automatically or enforce mandatory image counts. Templates with no references are valid.

Several Subject images can show the same person; the user can explain that relationship. Style guides appearance rather than identity. Logo references may be redrawn by generation; unchanged placement remains the separate overlay action.

Assemble the request directly, without an extra AI rewrite. Bind the actual attachment order to explicit image identifiers, purposes and explanations. The visible preview and submitted payload must agree about which image each label identifies.

Priority rules:

1. Current document dimensions/aspect and transparency settings govern output, even when recipe or additional text conflicts.
2. Explicit per-generation instructions override conflicting recipe details.
3. Retain the remaining recipe and use images for their stated purposes.

The initial request includes only these instructions and explicitly selected references. Text embedded in reference images is source content, not an additional user instruction. Usage notes remain composer guidance rather than silently appended generation instructions.

Example content, illustrative rather than fixed wording:

```text
Task: generate a new image using the recipe and selected references.
Additional instructions override conflicting recipe details.
Use the output settings below for dimensions and transparency.

Template: Flat Vector Avatar
Recipe: A flat vector portrait of the person in the Subject references.
Clean outlines, limited colours, pale-blue circular background.

Additional instructions: Use a navy background and keep my glasses.

Image 1 — Subject — Same person as Image 2; use for likeness.
Image 2 — Subject — Second photograph of the same person.

Output settings: [actual document dimensions/aspect and transparency]
```

The example thumbnail is absent unless explicitly attached. Exact likeness, exact logo reproduction and identical repeated output are not guaranteed by prompt composition.

## Editing, duplication and historical use

Edit template offers explicit Save/Cancel for name, recipe, example, folder, tags and usage notes. Detect stale concurrent saves and ask the user to reload instead of overwriting unseen changes.

Duplicate creates an independently editable “Copy of…” template with its own identity. Editing either copy does not affect the other.

A selected draft retains its captured template content. Subsequent library edits show Template updated with an explicit Use latest action. Refreshing replaces template content while retaining user instructions and explicit references. Running jobs retain their submitted content.

Each template generation preserves an immutable request snapshot containing:

- Template identity/name and recipe used.
- Per-generation instructions.
- Exact reference image versions, purposes and explanations, including any explicitly attached example.
- Output settings, assembled instructions and fresh-context intent.

Historical use must not require looking up today's library template or current source-image versions. Keep referenced image bytes available independently of later library edits/deletion.

Reuse these instructions restores historical request inputs into a new fresh-context draft. Selecting from the library uses latest saved content. If historical output settings differ from the current document, show and resolve that difference before sending; current document settings remain authoritative. Do not silently describe changed settings as an exact historical request.

Earlier images and recorded requests remain unchanged when a template is edited, moved or deleted. No template revision-history browser is included; generation history retains the content actually used.

## Deletion and restoration

Delete moves a template into existing Trash. Hide it from active browsing/search and allow Restore. Previous generations, historical reuse, running jobs and selected drafts continue from their snapshots. Selected drafts indicate Template deleted instead of losing their recipe.

Organisation-owned templates participate in existing organisation Trash/restore rules; Shared templates stay separate. Restoring an organisation must not revive templates that were already individually trashed. If a restored template's folder no longer exists, place it in General in its owning library.

## Organising and transferring

- Each organisation library and the Shared Library has independent, single-level folders.
- General is supplied automatically and cannot be deleted. Every template belongs to one folder.
- Create, rename and delete folders; move templates between them. Folder names are unique within their library, ignoring capitalisation.
- Deleting a folder moves its templates to General. Trashed templates must remain restorable even if their old folder is removed.
- All templates spans folders within the selected library. Combine folder filtering with search across names, tags and recipe text. Sort alphabetically initially.
- Copy to… and Move to… choose destination organisation/Shared library and folder, defaulting to General. Copy creates an independent destination item; Move transfers ownership and removes the source entry. Preserve example media and historical requests.

## Initial scope and implementation constraints

Excluded: website importing, bundled prompt packs, nested folders, configurable placeholders/forms, AI recipe extraction, automatic reference-purpose guesses and a template revision-history browser. No new generation provider or billing route.

Current code has generic references, page conversation continuation and stored prompt/reference history, but no template model or image-purpose binding. Integration points: src/Editor.tsx, src/LibraryImages.tsx, src/types.ts and src-tauri/src/{jobs,model,local_store,store}.rs. Metadata is Workspace JSON in SQLite; native and private-server modes share the Rust model. Existing immutable media/version handling should underpin historical references.

Cover native and server/browser behaviour, backup/restore, stale-client conflicts and older workspace compatibility. Older records must load without fabricated template provenance or newly inferred historical roles. Preserve existing ordinary generation behaviour. No live migration, deployment or publication is authorised by this review.

## Acceptance checks

Verification uses isolated workspaces and copied fixtures. Automated request/storage checks establish exact inputs; live generation establishes integration and visual usability without treating output as deterministic. Evidence and environment limits are recorded below.

| ID | Scenario | Required result |
| --- | --- | --- |
| T01 | Create from scratch; omit required fields; cancel; save/reopen | Name, recipe and valid example required; General defaults; optional fields work; cancel creates no item; saved data/media persist. |
| T02 | Save current image and earlier revision with overlays | Exact underlying image and source prompt selected; overlays excluded; source conversation/references reviewable; original design unchanged. |
| T03 | Save multi-edit and template-derived results | Dependency guidance shown; recipe and overrides available; source conversation/attachments not bundled into reusable template. |
| T04 | Browse organisation/Shared; select two templates successively | Correct scope; one selected; replacement preserves extra instructions/references; thumbnail alone is not submitted. |
| T05 | Recipe-only submission; remove template; empty ordinary request | Recipe alone sufficient; removal retains user input/references; empty ordinary request remains invalid. |
| T06 | Two Subject photos, Style example and Logo; remove/reorder references | Preview and payload bind purposes/explanations to correct exact images; defaults Other except explicit example-as-Style. |
| T07 | Conflicting recipe, override and output settings | Request explicitly applies priority rules; saved recipe unchanged. |
| T08 | Apply template on page with conflicting earlier image/conversation | Fresh request excludes old image/transcript; history recoverable; explicitly selected references included. |
| T09 | Follow generation with “make outline thinner” | Normal edit continuation; template selection cleared; selecting again starts fresh. |
| T10 | Inspect preview and dispatched native/server requests | Same recipe, overrides, images/roles and settings; no hidden usage notes or AI rewrite. |
| T11 | Edit/cancel/save/duplicate; modify copies | Cancel harmless; saves appear on future selection; copies independent. |
| T12 | Another client edits selected template; retain or Use latest; conflicting saves | Notice shown; no silent replacement; refresh preserves extra input/references; stale save cannot overwrite unseen changes. |
| T13 | Edit template/example during generation | Running job and result retain captured recipe and exact image versions. |
| T14 | Edit/delete/move template and source images; reuse history | Earlier result/request unchanged; historical recipe, roles and media usable; library selection uses latest saved template. |
| T15 | Historical reuse on differently sized document | Difference visible and resolved under current-document output rules before dispatch; stored history unchanged. |
| T16 | Delete/restore selected template | Hidden from active library; draft indicates deleted state and remains usable; restore to correct library or General if folder removed. |
| T17 | Folder case-only duplicates; remove populated folder | Unique names enforced; flat structure; templates moved to General; General protected; trashed templates restorable. |
| T18 | Search/filter names, tags and recipe across scopes | Alphabetic results; folder/query combine; All templates limited to selected library; trashed/unrelated items excluded. |
| T19 | Copy/move organisation ↔ Shared; restart | Correct destination folder/media; independent copies; source removed on move; existing historical requests intact. |
| T20 | Organisation Trash/restore with active and previously trashed templates | Existing cascade rules respected; previously trashed items stay trashed; Shared unaffected. |
| T21 | Rejected/accepted submissions; retry after generation failure | Rejected draft intact; accepted submission clears selection; retry uses captured content, not latest library version. |
| T22 | Older workspace fixture; save/restart; backup/restore; sync | Existing documents/history/media unchanged; no fabricated provenance; templates/folders/snapshots round-trip in native/server modes. |
| T23 | Keyboard and narrow desktop/mobile layouts | Forms, picker, roles, menus, Trash and preview usable without overflow/lost input; controls labelled and focus restored. |
| T24 | Live avatar with two Subject photos, optional Style example, then follow-up | Visually assess subject/style separation and override; fresh generation and continuation work; verify exact request independently. |

## Validation results — 2026-10-16

T01–T24 have local acceptance coverage. The following records distinguish deterministic fixture checks from actual provider generation and native UI integration.

| Checks | Evidence |
| --- | --- |
| T01 | Real server/browser creation, image upload, required-field rejection and saved reopening; current-image form Cancel creates no template. |
| T02–T03 | Current image and earlier revision forms checked against exact image data with an active overlay; earlier recipe plus override retained; multi-edit guidance and source conversation/reference review present. |
| T04–T05 | `/templates` opens the selector; switching templates preserves instructions and explicitly selected references; recipe-only submission works and removal preserves the rest of the draft. Native IPC/WebView exercises the shortcut too. |
| T06–T07 | Exact image/purpose bindings, Other defaults, explicit Style example, Subject explanation and override/output-setting rules checked in preview and actual dispatched RPC payload. |
| T08–T10 | Instrumented app-server fixture verifies fresh thread/start, exclusion of sentinel prior context and current page image, exact preview text, and subsequent ordinary thread/resume with the generated image. Live follow-up also completes in the same thread. |
| T11–T12 | Real UI edit/cancel, independent duplication, stale-save rejection, update notices while typing and explicit Use latest preserving draft instructions and roles. |
| T13 | Hold an actual dispatched fixture job, delete its library template, then complete it; the resulting revision retains the original captured request. Snapshot unit tests also cover later recipe edits. |
| T14–T16 | Saved request content survives library edit/delete/move; historical reuse restores inputs; differing document dimensions require an explicit Use current document settings action; deleted drafts remain usable and restoration after folder deletion uses General. |
| T17–T20 | Folder rename/delete/unique-name validation, protected General, name/tag/recipe search, copy/move across scopes and organisation cascade preserving pre-existing Trash. |
| T21 | Provider failure after accepted submission retains snapshot history; retry restores it; accepted submission clears selection; stale-preview rejection occurs before acceptance. |
| T22 | Additive server merging preserves new entities for stale clients; native/server restart, exact-media template backup/restore and older-workspace preservation tests pass. |
| T23 | Real-server Edge at 390/768/1440px; mobile WebKit selector and Style attachment; Escape restores composer focus; expanded preview/send controls remain reachable. Hidden Windows WebView checks native selection and preview. Existing responsive and clipboard checks also pass. |
| T24 | Two copied Subject photographs from the motivating Flat Vector design plus its example as Style produced a real managed-ChatGPT avatar with a navy background override. A second normal edit completed in the same thread; both revisions and the exact original request remain preserved. Outputs were visually inspected. |

Main evidence:

- `scripts/test-templates.mjs`: disposable real server, browser UI, concurrent changes and deterministic provider RPC capture. Writes `outputs/templates-acceptance.json`.
- `scripts/fixtures/template-runtime.mjs`: clearly isolated deterministic app-server fixture; does not read credentials or contact a provider.
- `scripts/test-template-generation.mjs`: optional live integration using explicitly supplied cached source workspace, bundled runtime and copied app login in a disposable runtime directory. Removes the copied auth file afterward. Writes `outputs/templates-live/result.json`, `avatar.png` and `followup.png`.
- `scripts/test-template-history.mjs`: continues only that disposable live fixture for source creation, overlays, historical reuse, editing, keyboard and Edge/WebKit layouts. Writes `outputs/templates-live/history-acceptance.json` and screenshots.
- `scripts/test-template-native.mjs`: real Tauri IPC, hidden native WebView selection/preview and restart. Writes `outputs/templates-native-acceptance.json`.
- Shared Rust template tests cover validation, conflicts, ownership, snapshots and exact-media backup/restore; server sync tests cover additive entities and stale edits.

The frontend production build and all 28 frontend unit tests pass. Native Rust tests pass (31 passed; one pre-existing network/device-login test remains ignored). Server tests pass (30 unit plus six integration tests). Clipboard checks pass in Edge and WebKit; responsive-card and compact-editor-opening regression checks pass.

The native UI acceptance build used a separate `com.mark.imagegenapp.templates-test` identifier, a hidden window and a disposable data directory. Repository product identity/settings remain unchanged. To reproduce that build, pass this JSON through TAURI_CONFIG only for `cargo build --manifest-path src-tauri/Cargo.toml`, then clear it before normal builds:

```json
{"identifier":"com.mark.imagegenapp.templates-test","productName":"Image Gen Templates Test","app":{"windows":[{"label":"main","title":"Templates acceptance","width":1440,"height":940,"visible":false,"minWidth":1000,"minHeight":700,"dragDropEnabled":false}]}}
```

The native test additionally needs the existing pinned bundled runtime at `outputs/Image Gen 0.8.5 Portable/runtime/` and localhost port 1420 available. It copies the runtime beside the ignored debug executable and runs the frontend through Vite. It does not close or replace the running user app.

Environment limits: physical iPhone interaction was not exercised. Actual provider generation used the isolated server-worker path; native storage, command registration, preview, selection and restart were exercised through the Windows app. No installer ran, no release was published, and the live workspace/service was not upgraded. Local build artifacts retain the existing development version until a release is prepared.
