# Release history

## New in 0.11.0 — configurable Templates (2026-10-18)

- Add Text, Colour and single-choice inputs to reusable Templates, with required answers, defaults and optional prompt phrases.
- Declare Subject image requirements and choose Generate or Discuss. Fill compact input pills in chat; missing answers and Subjects are explained before sending.
- Keep authoring simple with Name/Prompt, Insert input, focused input editing and supporting settings under More details. Dialogs fit desktop and mobile layouts.
- Preserve template answers and reference roles in conversation history, with explicit reuse/latest behaviour and faithful request composition.
- Show transparent canvas areas clearly and preserve real alpha in PNG exports for ordinary designs as well as Assets. JPEG/PDF remain opaque.
- Project previews show the current image from each of the three latest modified designs; previous image revisions no longer occupy separate slots.
- Include documented server retention, verified archival cleanup and deployment disk preflight checks.

## New in 0.10.3 — canvas controls and library organisation (2026-10-17)

- Resize overlays from all four corners; hold Shift to resize from the centre. Rotate directly with the circular canvas handle.
- Left-click Assets/Uploads drawer images to Place; right-click opens options. Touch keeps tap-to-menu.
- Recover the first clipboard Paste after allowing browser permission, without a second click.
- Record precise modification times for edits and use newest-first ordering throughout libraries, folders, drawers and pickers.
- Copy or move designs between projects within the same organisation, defaulting to the current organisation and excluding the current location. Templates follow the same folder-selection flow.
- Drag designs onto Projects and templates onto Template Folders. Reject cross-type and invalid drops; preserve source history and library references.
- Windows Setup, Portable and Companion downloads and the immutable Linux image are published; the existing server is upgraded with data and sign-in preserved.

## New in 0.10.2 — file drops and portrait proportions (2026-10-17)

- Drop image files directly onto the canvas to save them as Uploads and place them at the drop point.
- Preserve displayed proportions for Place, library drags, external drops and pasted files, including phone photos with EXIF rotation and existing Uploads.
- Full Uploads-library drops have clearer guidance and recognise file items as well as the standard Files drag type.
- Keep successful files after individual batch failures and apply their placements as one undo step. Original image bytes and Uploads remain available after Undo.
- Assets and Uploads sort newest first. Projects and Template folders sort by the latest modification inside them, with creation dates breaking ties. Empty folders use their own dates; legacy unknown dates remain unknown.
- Windows installer, portable app, companion and immutable Linux server image are published. The local server is upgraded with its workspace, images and sign-in preserved.

## New in 0.10.1 — inline canvas editing (2026-10-17)

- Right-click or long-press an item and choose Edit, then draw regions directly on the canvas with a small inline instruction input.
- Saved instructions appear as removable/editable pills in the existing chat composer. Submit with optional general instructions and reference attachments through the existing Generate / Edit button.
- Pending region edits target exactly one background or placed image. Other items' Edit actions are disabled; server checks reject mixed targets and target changes until the existing pills are cleared.
- Compare Original/Edited on the canvas using an inline chat review card, then retry, discard or apply. The separate editing modal, Annotate button and multi-target queue are removed.
- Preserve original sources, independent replacement Assets, source transparency, saved drafts and undo. Exact region metadata is retained in the revision while chat messages show the user's instructions rather than provider instructions.
- Windows installer/portable/companion downloads and the immutable Linux server image are published on GitHub. Existing private server deployment is retained.

## New in 0.10.0 — private server version (2026-10-17)

- Annotate backgrounds and individual placed images with saved numbered rectangles and instructions, then generate all enabled edits when ready.
- Send full original target images and semantic location guidance; compare complete results and retry before applying them together as one undoable change.
- Layer edits create new organisation-owned Assets and replace only the selected placements. Original Assets/Uploads, their other uses and untargeted layers are preserved.
- Persist failed-batch candidates and drafts; require source review after image changes; protect locked layers and pages under generation/review. Preserve transparent sources and flag changed output aspect ratios.
- Private build/deployment only; no GitHub push or public release. Includes the current local canvas touch/actions, drawer-placement and canvas-selection layout work; see VALIDATION.md for scope and qualification.

## New in 0.9.4

- Back/Forward, reload and direct links restore template folders/details, library scopes, workspace search and search categories, projects, designs/pages, assets and uploads. Invalid/deleted destinations recover to their parent without history loops.
- The compact editor sidebar navigates to full library pages. The top editor tools continue to open drawers.
- Templates drawers start with alphabetically sorted folder cards and offer a Folders back button. Rename/Delete live in the full library's three-dot Edit folder dialog.

## New in 0.9.3

- Bound tall template example images inside their preview so Safari cannot overlap the form fields.
- Browse Templates folders as preview cards, matching Projects, with template counts and folder navigation.
- Create/Rename folder dialogs use consistent padding and Cancel/Save controls.
- Project designs share the same checkerboard background as Assets, Uploads and Templates in both themes.

## New in 0.9.2

- Template cards match the compact library style, with details and Duplicate/Copy/Move/Trash inside the three-dot edit dialog.
- Templates in All organisations includes every active template, with a separate Shared tab and library-labelled folders.
- Selected templates and reference pills take less space in the composer. Asset/upload menus offer Add as… with Style, Subject, Logo and Other choices.
- Long user messages in Discuss and Generate/Edit show five lines with More… and Show less controls. Full saved prompts are preserved.

## New in 0.9.1

- Templates matches Assets and Uploads with consistent header actions, tabs, information banner, image cards and empty states.
- Assets, Uploads and Templates drawers show two image-and-title cards per row. Templates offers **Use Template** or **Use and Attach as Style** from the same popup style as other library images.
- New/Edit Template uses padded fields, grouped help text, a styled image chooser, responsive Library/Folder controls and a separated Cancel/Save footer.

## New in 0.9.0

- Save reusable image-generation Templates with example previews, editable recipes, usage notes and tags. Create them from scratch or from current images and earlier revisions.
- Organise templates into user-created folders in organisation or Shared libraries; search, edit, duplicate, copy, move, trash and restore them.
- Type `/templates` in chat to open the selector alongside `/asset` and `/upload`. Use one template per generation, with optional extra instructions and explicit Subject, Style, Logo or Other reference purposes.
- Inspect the assembled generation instructions. Template generations start fresh; normal follow-up edits continue from the result. Saved snapshots preserve historical recipes and exact references after library edits or deletion.
- Assets, uploads and project designs open on Canvas in compact layouts. Explicit library navigation still opens Tools, and resizing no longer replays an earlier library request.

## New in 0.8.5

- Project cards showcase the three most recent images across their designs and pages, with the newest in front. The new-project card matches project-card heights across every row.
- Compact navigation keeps the menu on the left, the imagegen logo centred, and the avatar and create buttons on the right.
- At widths up to 600px, Extract asset, Use in new design and Export appear as icons beside the design name on one row. Export stays purple; accessible names and tooltips identify each action.
- Paste a PNG, JPEG or WebP image into the design chat to save it in that organisation's Uploads and attach its saved version as a reference. Draft text stays intact and sending waits for uploads to finish.
- Safari touch input now toggles dark mode reliably instead of dismissing the avatar menu before the click.

## New in 0.8.4

- Reorder organisations by dragging, or focus one and use Alt+Up/Down. The saved order also appears in organisation selectors.
- Hover an organisation to open its **...** menu. **Rename** edits its name inline; **Trash** moves the organisation and its projects, designs, assets and uploads to Trash. Restoring the organisation restores those contents while leaving previously trashed items in Trash. Shared libraries and other organisations remain available.
- Open the avatar menu to switch between light and dark mode. The choice is remembered on that device across the workspace, editor, dialogs and browser login screen. Artwork, paper and explicit contrast previews retain their original colours.
- Phone screens keep two columns for projects, designs, assets and uploads, with tighter spacing and wrapping titles.
- Distribution packages now include the project's MIT licence and third-party notices. Existing creations, media, sign-in and workspace identity are preserved.

## New in 0.8.3

Desktop generation now has its own ChatGPT OAuth sign-in and private runtime history. Image Gen uses only its bundled generation runtime, ignores inherited Codex credentials and history settings, and no longer falls back to a separately installed Codex. Sign in once inside Image Gen after upgrading. Existing designs, images and saved page conversations remain available; previous entries in Codex recent chats are not automatically removed. The browser worker retains its existing isolated server sign-in and history.

Browser navigation now records workspace views in the URL and browser history. Back/Forward restore internal navigation, and refreshing reopens the selected design.

## New in 0.8.2

Switch organisations from the header or sidebar while staying in the current library or Projects section. Asset and Upload badges count the selected organisation's own items, with shared images available separately.

Imported images now live in Uploads, with an additional editor drawer and `/upload` command. The wider editor panel fits Pages, Assets, Uploads, and History. Click an image to open its Reference/Place menu. Existing assets remain Assets until explicitly moved to Uploads; Save as asset creates an independent copy of an Upload. Editing an Upload keeps it in Uploads.

Copy or move Assets, Uploads, and Designs across organisations. Design transfers choose an existing or new destination project and preserve pages, conversations, revisions, overlays, and exact image versions. Used library images receive independent destination copies; source library items remain available to existing designs.

Original-image placement works over private LAN HTTP. Existing workspace data, authentication, media, and installed-app identity are preserved. See [organisation libraries](ORGANISATION-LIBRARIES.md) for behaviour and validation.

## New in 0.8.1

Public GitHub distribution adds separate native, server and companion setup paths, a published-image server installer with private access-key retrieval and backups before updates, installed-app companion discovery, and a manual release workflow.

Browser navigation adapts to narrow screens with Canvas/Tools/Chat views. Connection dialogs show a correctly aligned remembered-sign-in checkbox and ask before disconnecting or signing out; native login controls remain hidden while connected.

Existing workspace identity, original images, access keys and ChatGPT sign-in are preserved. Windows installers are unsigned. macOS/Linux desktop and ARM builds are not qualified.

## New in 0.8.0

Prove server ownership with your existing access key, then optionally create a personal username/password login. Both methods work in the browser and native app. Browser **Keep me signed in** lasts up to 90 days and survives server restarts. The key-only option remains available. Account records and session hashes are separate from designs/assets; existing keys and creations are retained.

Matching sidebar status cards open their respective connection dialogs directly. Settings and server management show native/browser and server versions with match/difference/offline states.


## New in 0.7.1

Settings shows compact workspace server and ChatGPT connection summaries. Choose **Manage** to open either connection's detailed controls in its own dialog.


## New in 0.7.0

Open your private server address in an ordinary browser to use the shared editor. An optional signed-in Linux worker handles browser generation, which continues after closing the tab. Desktop generation stays local. Browser sessions, downloads, original asset tools and print exports share the same implementation.

The desktop installer includes the managed ChatGPT generation runtime: no separate Codex install is needed. New PCs sign in through Settings. Portable users must extract the entire ZIP with its runtime folder. Source builds use `npm run tauri -- build --bundles nsis`; the wrapper downloads the pinned official runtime into local build cache and bundles its resources/licence/notice.

Existing app identity, workspace format 3 and data locations remain unchanged. First opening an existing workspace saves before-v0.8.0.zip. Installer Upgrade preserves creations. See [server/browser guide](docs/SELF-HOSTED-SERVER.md) for authentication, worker storage, backups and deployment.


## New in 0.5.0

The export panel adds PDF bleed (Extend edges or Crop to fill), optional crop marks, RGB/CMYK colour, and JPEG quality/file-size controls. CMYK uses the bundled Coated FOGRA39 300% profile with real Little CMS conversion and an embedded PDF output profile. A screen simulation and RGB comparison help review colour changes. The export button stays visible as settings scroll. See docs/ADVANCED-EXPORT.md for exact behaviour and limits.

Existing creations stay in the same data folder. First opening creates before-v0.5.0.zip containing the prior metadata and images. Close Image Gen and leave Upgrade selected in Image Gen 0.5.0 Setup.exe. This release uses versioned installer/portable/package filenames; older unversioned files can remain in use by existing companion processes.


## New in 0.4.0

**Extract asset → Keep original pixels** crops a logo without AI regeneration. Optional click-to-erase background, tolerance, undo and contrasting previews help isolate it while keeping retained pixels unchanged. The existing AI extraction and editable-JSON recreation methods remain available.

The Windows installer now defaults to **Upgrade** when it finds an older installation. Close Image Gen, run the new setup and keep Upgrade selected. The data folder stays unchanged, and first opening saves before-v0.4.0.zip with the prior metadata and images. The live installation is left for the user to upgrade; acceptance uses an isolated installation and a copied workspace.


## Version 0.3.1

Extraction and JSON analysis now adapt to the selected object. **Object type** defaults to automatic visual identification, with overrides for logos, glass/transparent containers, food/drink without glass, and other objects. Logo prompts preserve visible lettering and graphic geometry without the glass/garnish instructions. Recreation uses the JSON's object_type or your override; older briefs remain intact and can be re-analysed.

The data format remains 3 and the data folder is unchanged. The first opening of an existing workspace in this version saves `before-v0.3.1.zip`, containing the exact prior metadata and media. Previous-version backups are retained. See `docs/ASSET-EXTRACTION.md` for details.


## Version 0.3.0

Extraction offers **Extract faithfully** and **Recreate as a clean asset**. The latter analyses the selected object into editable JSON, then generates from that description in a fresh conversation. Source-image guidance is optional and off by default. **JSON description** in the asset workspace lets you edit/save a brief or recreate it as a new version while keeping earlier versions.

The asset preview switches between checkerboard, white, black and bright pink to reveal background contamination. Preview colours never change the stored image or export transparency. See `docs/ASSET-EXTRACTION.md` for workflow and quality-review details.

Upgrading keeps the same identity/data folder. The first opening of an older workspace creates `before-v0.3.0.zip` with its exact previous metadata and image files before recording the new format marker. Older assets load with default-empty description/reference fields. Existing designs, chats, images, asset versions and custom sizes remain available.


## Version 0.2.0

Install the new version over the existing installation. Keep the same application identity and data location; no uninstall is needed. On the first opening of an older workspace, the application saves `before-v0.2.0.zip` beside the database, including its original metadata, chats, revisions, and image files. This archive can be restored through Settings. The new saved-size field defaults to empty when reading older workspaces. The user's running installation is not changed by development tests.

The canvas defaults to **Fit to window**, following the available width and height. Zoom buttons switch to manual scale; click the Fit/percentage control to fit automatically again. This never changes document dimensions.

Starting sizes include A2, A3, A4, A5, A6 and social formats. Custom dimensions accept millimetres, pixels, or fractional inches. Creating a custom-sized design saves its dimensions under **Custom sizes**, shared across organisations. Identical entries are avoided; removing a saved size preserves existing documents. Inch-based PNG/JPEG and PDF exports use the requested physical dimensions and DPI.

Choose **Extract asset** on a document with artwork. Optionally drag a box around an object, name the asset, and describe what to isolate. The app opens an asset workspace and starts transparent-background generation using a frozen source composition and, when selected, a close-up. The original document stays intact. The new asset can be refined, referenced, or placed like any other asset; AI extraction may change fine details.
