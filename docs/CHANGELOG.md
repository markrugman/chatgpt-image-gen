# Release history

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

