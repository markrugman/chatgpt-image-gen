# Organisation libraries and transfers

Updated: 2026-10-15. Mark approved implementation and local/private-server testing, then authorised GitHub publication and live-server deployment as version 0.8.2. Release and deployment verification are recorded in VALIDATION.md.

## Accepted behaviour

- The header and sidebar organisation selectors update the current organisation, displayed content, and library counts together while preserving the current section (including Assets, Uploads, and Projects). Switching organisations clears any selected project; switching from an editor returns to the corresponding library or Projects section in the destination organisation.
- Uploads are imported images. Assets are reusable artwork created, extracted, or explicitly saved as an asset. An uploaded image can also be explicitly saved as an asset.
- Assets and Uploads have separate library sections and generation-reference commands: `/asset` and `/upload`.
- Organisation counts include only items owned by that organisation. Shared items remain available through a separately labelled Shared section. All organisations counts each item once.
- Assets, Uploads, and Designs offer Copy to… and Move to… actions. Copies are independently editable destination items; moves transfer ownership and remove the item from the source library. Existing designs retain the image versions they already use.
- Copying or moving a Design preserves its pages, conversations, and revision history.
- Keep the existing Assets tab/drawer in the editor and add an Uploads tab/drawer alongside it. Remove the visible Reference and Place links from item cards. Clicking an item opens a popup menu offering those actions; selecting the item alone does not attach or place it.
- Widen the editor's left panel to accommodate Pages, Assets, Uploads, and History with similarly sized navigation buttons and existing comfortable spacing. Do not squeeze the fourth button into the current narrow width.
- Reference adds the selected image to the composer as a visible generation reference. Place adds the original image unchanged as an overlay.
- Existing items remain Assets during migration because their origin is not reliably recorded. Individual items can be reclassified as Uploads explicitly.
- Editing an Upload keeps it in Uploads. Save as asset creates a separate reusable Asset.
- Copying or moving a Design asks for the destination organisation and project, with an option to create a destination project.
- Design transfers create independent destination library copies of the Assets and Uploads used by the Design, including image versions needed by its preserved history. Source library items remain intact because other designs may use them.

## Verified current constraints

- The header name/chevron currently has no interaction handler. Sidebar selection returns to Overview and closes the editor.
- The asset badge currently counts all active assets; the selected organisation's library shows its own and shared assets together.
- Imported images currently become ordinary Assets without a reliable persisted imported/generated classification.
- Designs belong to projects, and projects belong to organisations. Transferring a Design therefore requires a destination project.
- Existing design references and overlays preserve image versions. Transfers must preserve this behaviour.

## Acceptance checks

- Select an organisation through the header and sidebar; verify matching context, owned-item counts, and a separately labelled Shared section. All organisations counts each item once; trashed items do not contribute to active library counts.
- Import an image, edit it, and reopen the workspace; verify it stays in Uploads. Save as asset creates a separate Asset. Existing library items remain Assets until explicitly reclassified, without losing references or history.
- Open both editor drawers; click an item and verify its popup offers Reference and Place. Verify references appear in the composer and unchanged placement adds an overlay. Exercise `/asset` and `/upload` against their respective libraries.
- Verify the widened editor panel fits all four navigation buttons without reducing their size or crowding labels; check the browser's responsive Tools view as well as the desktop layout.
- Copy and move an Asset and an Upload across organisations; verify independent copies, source removal for moves, and unchanged existing designs.
- Copy and move a multipage Design to an existing and a newly created destination project. Verify pages, conversations, revisions, overlays, and referenced image versions survive; destination library copies are independent and source library items remain available.
- Reopen transferred work and restore earlier revisions to verify history remains usable. Check native and browser workflows and preservation of an older workspace using a copy of its data.

## Preview and verification

- Private Linux preview: [Libraries preview](http://192.168.178.96:8788). It uses a separate server identity, copied workspace/media, and separate worker storage. Sign in with the existing server access key. Preview edits stay in the test copy. The production service on port 8787 remains running with its existing data/configuration.
- Local native preview: `outputs/libraries-preview/Launch Libraries Preview.cmd`. This launches a separate app identity and copied data under `%LOCALAPPDATA%/ImageGenBuild/libraries-preview-native-20261015`; it does not upgrade the installed application. The debug executable and bundled runtime are in `src-tauri/target/debug`.
- TypeScript/Vite builds and Windows native debug build pass. Automated suites pass: 26 frontend, 22 native Rust, and 28 server Rust/HTTP tests. Transfer tests cover identities, tags, history, version pinning, migration defaults, destination validation, project creation, and independent Upload/Asset copies.
- `scripts/test-libraries.mjs` exercises real browser/API writes against isolated previews, including organisation switching without leaving Assets, counts, separate Shared libraries, Shared uploads, keyboard-accessible popup actions, references/overlays, both commands, UI copy/move/reclassification, and 390/768/1024/1440px layouts. Local Windows and private Linux preview checks pass with original records unchanged and no browser runtime errors.
- Real native ChatGPT checks pass for copied Upload conversation recovery and image generation using an Upload reference. The generated Upload retains its classification and original version. Native restart preserves the generated versions, copied conversation, original records, and original media hashes.
- The separate Linux worker is signed in and a real ChatGPT continuation recovers a transferred Design's conversation. Preview restart preserves the copied workspace and all 28 original media hashes; production metadata/media and existing service IDs/start times remain unchanged.
- LAN HTTP testing exposed that `crypto.randomUUID()` is unavailable outside secure contexts. Overlay placement now uses `crypto.getRandomValues`, verified against the LAN preview.
- Existing Assets omit the default library classification when serialised, preserving the legacy representation. Uploads explicitly persist their classification. Workspace format and installed application identity remain unchanged.
- The preview qualification above preceded publication and did not modify production. Mark subsequently authorised release 0.8.2 and live deployment. Preview evidence is retained under ignored `work/libraries-*` files and `/home/debian/imagegen-server/work/libraries-preview-20261015` on the test server; release/deployment evidence is recorded in VALIDATION.md.

See [the glossary](../GLOSSARY.md) for agreed terminology and [the library boundary decision](adr/0002-separate-uploads-and-assets.md) for context.
