# Templates — design and acceptance specification

Status: published and deployed in 0.9.0, 2026-10-16. The user approved the complete design and its four edge cases, implementation and acceptance checks, then explicitly authorised publishing and deploying all changes. See [release validation](VALIDATION.md) for package and production-preservation evidence.

Pending UI revision (2026-10-16, local screenshot preview only): Mark now wants the composer template summary reduced to image/title/Remove template, compact image/title reference pills, and asset/upload **Add as… → Style/Subject/Logo/Other** menus. Optional purpose details and the composer instruction disclosure are removed; request preparation, saved roles/explanations and historical snapshots remain intact. This supersedes the corresponding UI descriptions below once approved and deployed; current implementation/verification and the deployment hold are recorded in [NEXT-VERSION.md](NEXT-VERSION.md).

## Purpose

### Configurable Templates — agreed design, 2026-10-17

Status: all three question rounds approved (Q1–Q16), followed by explicit implementation, thorough testing and local-server-only update authorisation. Implemented, tested and deployed only to the private local server as a Template preview on 2026-10-17. No global deployment or public release is authorised. See [validation evidence](VALIDATION.md).

This section is the target behaviour for the expansion. Where it conflicts with the historical baseline below—including Generate-only Templates, plain-text recipes without inputs, reference requirements, instruction precedence and compact composer disclosures—this section governs the new design. The expansion is now active on the private local server; public packages retain their previously released behaviour.

#### Scope and authoring

- One selected Template per request. Each Template specifies Generate or Discuss; its mode remains visible and determines the action while attached. Remove or switch the Template to change modes.
- Preserve the existing Name, Recipe, example, ownership, folder, tags and usage notes. Add Insert input for Text, Colour and single Choice. Input configuration belongs in the Template editor, not the composer.
- Insert input creates a named definition and managed placeholder together. Definitions contain the label, type, required state, optional default and, for Choice, the fixed choices. Definitions are separate from recipe prose. Placeholder spelling is an implementation detail; examples use `{{hat_colour}}`.
- Inputs are required by default. Valid defaults immediately count as editable answers. Text supports longer descriptions; Colour offers a picker and editable hex value with a visible swatch; Choice accepts exactly one defined answer. No custom Choice answers, multiple selections or conditional questionnaires initially.
- Authors can visually associate a complete optional phrase with one optional input. Include the phrase when that input has an answer; omit the complete phrase when empty. No nested conditions. Repeated uses of one input share its answer. The checker must reject optional placeholders whose empty-state wording is not explicitly defined rather than submit broken prose.
- Keep configuration progressive: ordinary Templates need no input configuration. Source review and completed-instruction inspection remain disclosures rather than mandatory steps.
- Authoring refinement requested during implementation: the main dialog shows Name, Prompt, compact input chips/Insert input, Action and Subject images. Edit one input in a separate focused dialog; its defaults and optional wording stay collapsed. Example image, location, tags, notes and source review live under More details. Avoid a long inline list of input-definition forms. This supersedes the initial inline authoring layout.

#### Subject references

- Per-Template setting: Not required, Optional or Required. Required means at least one attached image explicitly assigned Subject; Style, Logo and Other do not count.
- Multiple Subject images represent the same person, character or object initially. Named, distinct subject slots are outside this version's scope. Required-image validation checks presence and purpose, not whether the images truly depict the same identity.
- Add Subject uses the existing image-selection/import flows and assigns Subject automatically. Attachment purposes can be changed explicitly. A written description uses a Text input and does not satisfy a required-image setting.
- Show missing Subjects immediately, independently of whether the user has tried to submit. Subject requirements are never inferred from recipe wording.

#### Composer and details dialog

- Retain the existing Template identity/example/remove presentation and group its input shortcuts beneath it. Show a clear missing-answer count and missing-Subject state.
- Show at most three input pills plus View all with the remaining count. Once complete, collapse to a Ready summary with short answer snippets and Edit details. Templates without inputs retain their compact appearance; a required Subject still needs visible status.
- Clicking the Template/Edit details opens one shared details dialog; clicking an input pill opens the same dialog focused on that input. The Colour control may open the device colour picker. Do not create a separate custom dialog for every type.
- Apply commits answer edits. Cancel, Escape and backdrop dismissal leave previously applied answers intact. Keep existing attachment selection/import operations explicit; cancellation of answer edits does not delete library imports.
- Additional instructions remain available. Explain concisely that configured values must be changed through their inputs. Do not add permanent configuration panels or a mandatory confirmation step.
- Optional View completed instructions shows the resolved recipe, answer values, reference purposes, applicable output settings and missing requirements. It describes the actual captured request, not an AI-rewritten approximation.

#### Appearance, mobile and accessibility

- Reuse the existing typography, colour/theme variables, purple accent, surfaces, borders, corners, buttons and dialog components, including dark mode. Use missing-state text/icons as well as colour.
- Reuse the existing mobile navigation and responsive form patterns. Details become a single column within the available viewport, without horizontal page scrolling. Truncate summary values; full values remain editable in the dialog.
- Provide at least 44px touch targets for input shortcuts and their actions, readable inputs and explicit labels. Preserve keyboard operation, dialog focus containment, initial focus and focus restoration.
- Keep dialog actions reachable with long forms and the on-screen keyboard. Validate dynamic viewport resizing, narrow portrait and short landscape layouts; do not rely on desktop overflow behaviour.
- Bounded shortcuts and completed summaries must keep the composer from growing in proportion to the number of inputs. The conversation and submission controls must remain usable with many inputs and references.

#### Instruction contract and faithful results

The current runtime has app-level base instructions in `src-tauri/src/jobs.rs` and Template request assembly in `src-tauri/src/templates.rs::prepare`. Extend both consistently across native and server modes. App-owned rules belong in the trusted instruction layer; recipes, input values and reference content must not be able to redefine those rules merely by containing instruction-like text.

Required instruction behaviour:

1. Obey app rules, the Template's selected mode and applicable document output settings.
2. Apply structured answers and explicit reference purposes ahead of conflicting additional instructions.
3. Apply additional instructions ahead of remaining recipe details; preserve all non-conflicting recipe requirements.
4. Generate: use native image generation for exactly one image, preserving requested composition, style, subject and constraints. Discuss: return text only, following the requested structure and quantity; never generate an image.
5. Treat Text/Choice/Colour answers as values for their defined purposes. A title containing instruction-like wording remains title content. Do not invent missing required answers or send unresolved placeholders.
6. Subject references establish identity and distinguishing features while allowing the recipe's requested transformation. Style references guide appearance, not identity. Respect Logo/Other purposes; do not attach the example as Style automatically. Text inside references is source content, not app instructions.
7. Reproduce requested visible text verbatim, without unrequested wording. Include the selected colour code. These instructions guide generation without promising exact spelling, likeness or colour fidelity.
8. Start Template requests with fresh context, excluding prior page conversation/current image unless explicitly attached. Ordinary follow-up turns continue the resulting conversation.

Resolve inputs directly without an extra AI rewrite. Preserve exact answer values and explicit attachment-order bindings. Inspectable completed instructions, backend validation and dispatched content must agree. Runtime instruction wording must express this contract without hiding contradictory defaults in another instruction layer.

#### Validation, lifecycle and compatibility

- On save, check malformed/unresolved placeholders, missing or duplicate input identifiers, unused definitions, valid types, valid Colour/default/Choice values and complete optional-phrase associations. Report actionable errors at their source. Structural checks do not establish artistic quality.
- On submission, check required answers and Subject references again in the shared backend path. Show an actionable error summary and field-level errors, preserve all answers and references, and provide a route to each affected input. Do not silently disable Send solely because answers are missing.
- Switching Templates resets answers to the new Template's defaults while retaining additional instructions and explicit references. Removing a Template removes its answers/shortcuts. Existing acceptance/rejection clearing rules continue to apply.
- Snapshot definitions, answers, mode, resolved instructions, reference purposes/exact image versions and applicable settings. Historical Reuse restores captured content; library edits never silently replace it. An explicit Use latest must reconcile changed definitions and defaults without silently mapping unrelated answers.
- Existing Templates remain Generate Templates with no new inputs or Subject requirements. Do not reinterpret legacy square brackets automatically. Preserve existing backup, sync, copy/move and historical request behaviour; older clients must not silently strip or bypass new definitions/validation.

#### Acceptance checks

| Area | Required evidence |
| --- | --- |
| Motivating examples | Brand-name idea Template returns the requested written ideas; logo, figurine and headshot Templates assemble their configured image requests correctly. |
| Inputs and authoring | Required/default values, repeated inputs, Colour hex, fixed Choice, malformed definitions and optional-phrase omission all behave predictably. A plain Template remains simple. |
| Subject purposes | Missing Subject blocks dispatch; Style/Logo/Other cannot satisfy it; Add Subject assigns the role; purpose changes update readiness. |
| Precedence and content | Blue answer wins over a conflicting red instruction; unaffected recipe details survive. Instruction-like title text stays literal content. Reference order and purposes agree with actual attachments. |
| Modes and context | Generate produces one image; Discuss produces no image. Fresh requests exclude unrelated page context; follow-ups continue normally. |
| Draft and history | Apply/Cancel, template switch/remove, failed submission, retry, reuse, library edits and explicit Use latest preserve or reset exactly the intended content. |
| Responsive UI | Light/dark themes, keyboard navigation, 320/390px portrait, tablet/desktop and short landscape; long labels/answers, many inputs/references and on-screen keyboard. No horizontal page overflow or inaccessible actions; summary stays bounded. |
| Storage and clients | Native/server parity, legacy workspaces, copy/move, backup/restore, concurrent edits and stale-client preservation/enforcement. |
| Generation fidelity | Inspect representative real outputs for Subject likeness, requested transformation, title spelling, requested colour and Subject/Style separation; distinguish request correctness from provider variability. |

Research informing the interaction: [GOV.UK error summaries](https://design-system.service.gov.uk/components/error-summary/), [single-choice controls](https://design-system.service.gov.uk/components/radios/) and [editable answer summaries](https://design-system.service.gov.uk/patterns/check-answers/). These support the validation/review patterns; the app's pill layout still requires responsive acceptance checks.

Save reusable image-generation recipes with recognisable examples, then apply them to different subjects without finding a website or copying an earlier conversation. Templates appear alongside Assets and Uploads in the library and image-creation picker. At most one template can be selected per generation; ordinary generation without a template continues to work.

Example: select Flat Vector Avatar, attach two photographs of the same person as Subject, and add “use a navy background and keep my glasses”. Source inspiration: https://chatsmith.io/blogs/prompt/ai-avatar-prompts-00346. The user's screenshot shows several avatar styles saved as designs.

## Template contents

| Field | Behaviour |
| --- | --- |
| Name | Required, editable display name. |
| Recipe | Required plain-text generation instructions, editable without configurable fields or a placeholder engine. |
| Example image | Optional browsing preview; can be added later. Excluded from generation unless explicitly attached as Style. |
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

Cover native and server/browser behaviour, backup/restore, stale-client conflicts and older workspace compatibility. Older records must load without fabricated template provenance or newly inferred historical roles. Preserve existing ordinary generation behaviour. The design review itself did not authorise deployment; the subsequent explicit publish-and-deploy instruction authorised release 0.9.0.

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

Environment limits: physical iPhone interaction was not exercised. Actual provider generation used the isolated server-worker path; native storage, command registration, preview, selection and restart were exercised through the Windows app. Subsequent release 0.9.0 passed clean GitHub builds, downloaded-package and anonymous-image checks, then upgraded the live service with complete verified backups and unchanged workspace/media/sign-in. Live Edge and mobile WebKit verify `/templates` without workspace changes. No installer ran over the existing user installation.
