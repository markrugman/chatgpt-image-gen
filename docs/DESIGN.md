# Image Generation App — Product Brief

Updated: 2026-10-15. Mark confirmed all 28 interview decisions and authorised implementation. The first Windows application is working; native generation/editing, conversation recovery/branching, local handoff, asset placement, and exports have passed the checks recorded in `VALIDATION.md`. Cross-platform release qualification and several recovery scenarios remain open.

## Confirmed requirements

- Personal desktop application for Mark; work stored locally, without collaboration in the first version.
- Windows, macOS, and Linux desktop targets.
- Rust application core; interface technology remains undecided.
- Canva-like workspace arrangement, with chat as the primary editing mechanism in the first version.
- Organisation → Project → Document → Page hierarchy.
- Each page has its own conversation and one current image, with earlier generated revisions preserved.
- Imported and generated reusable assets, with organisation-owned assets and a shared library for generic artwork.
- Searchable asset picker for prompt references such as `/asset dcg-logo`.
- Search by tags returns matching projects, documents, and assets.
- A use-image-in-new-document action creates another document with the selected image as a reference.
- Generated asset creation should support transparent backgrounds.
- ChatGPT OAuth/device access is required for generation. Separately billed API access is not an accepted substitute.
- Original logos can be placed unchanged over generated artwork using a simple placement tool.
- Creating a document from an image starts a fresh chat with that image and the new prompt, and preserves a link to the source.
- Editing an older revision preserves later revisions; the new result becomes current.
- A page receives only its own conversation and explicitly selected references, including deliberately referenced other pages.
- Unified name/tag search spans projects, documents, and assets, with organisation/type filters and visible result locations.
- Exports: PNG, JPEG with adjustable compression, and multipage RGB/CMYK PDF, with explicit page dimensions and a print-resolution check. Version 0.5.0 adds configurable bleed (crop to fill or extend edges), crop marks, profile-managed CMYK conversion and export previews. See ADVANCED-EXPORT.md.
- The hierarchy is logical; the application manages physical storage and stable references independently of display names.
- Document creation offers paper presets (including A3/A4), social-image presets, and custom dimensions. All pages share the document size. Different output formats are separate documents within a project; export dimensions and native image resolution are distinguished.
- Create asset opens a dedicated workspace with its own conversation, preview, and revision history, defaulting to a transparent background.
- Overlays support dragging, proportional resizing, rotation, ordering, and removal. They remain placed when the underlying generated artwork changes. Preview and export combine the artwork with overlays; generation receives the underlying artwork and explicitly selected references.
- Existing designs retain the exact asset versions used, even after library replacement or deletion. Applying a replacement is explicit.
- Autosave, Trash, and complete backup/restore include designs, conversations, revisions, and assets. Backups exclude login credentials.
- Generation runs without blocking browsing or editing other documents, with one active generation per page, visible progress, cancellation, and retry after failure.
- Explicit Discuss and Generate/Edit modes distinguish conversational advice from requests to create an image revision. Both remain part of the page conversation.
- Editing from an older revision uses the conversation up to that revision. Later conversation and revisions remain on the original branch.
- History also preserves overlay/layout edits. Restoring a design restores the corresponding image and overlay arrangement; moving a logo is undoable without generating an image.
- Changing an existing design's aspect ratio creates a new document and preserves the source. Fit, crop, and regenerate-for-size choices show framing before applying the change.
- Asset actions explicitly distinguish Use as generation reference from Place unchanged on page. Prompt references appear as visible selected-asset chips; unchanged placement creates an overlay.

## First-version scope

The deliverable is a personal desktop image-generation workspace with organisation/project navigation, multipage documents, per-page conversations, branching revisions, reusable assets, exact-image overlays, search, exports, and local recovery.

Collaboration and cloud synchronisation are outside this version. A full general-purpose layered design editor is outside scope; the agreed overlay controls are included. Mark approved CMYK conversion, bleed, crop marks and JPEG quality controls for version 0.5.0 on 2026-10-15. ChatGPT subscription/device authentication is required; a separately billed API integration does not satisfy the brief.

## ChatGPT-to-app handoff

Requested capability: invoke an Image Gen App skill from ChatGPT to create work in the desktop app and start the page conversation there. Example: `/imagegenapp create a new A4 poster for the Courtyard for Halloween Cocktail Hour`.

Confirmed flow:

1. Resolve the existing Courtyard organisation; create or select the intended Halloween Cocktail Hour project without guessing between ambiguous matches.
2. Create an A4 poster document with one page.
3. Save the user's brief as the opening page message, along with explicitly selected supporting context/references.
4. Launch/focus the app and navigate to that page. Further conversation takes place in the app.
5. Return the created identifiers and an open-document link to the originating ChatGPT interaction. Retry the same handoff without creating duplicate projects/documents.

Integration direction: an installed skill describes the workflow and an app-owned tool/command bridge performs local creation and opening. A skill alone does not establish a live connection to the application. Official plugin documentation supports skills plus MCP tools, and desktop slash-command documentation includes enabled skills:

- https://developers.openai.com/plugins/concepts/mcp-server
- https://developers.openai.com/plugins/build/plugins
- https://learn.chatgpt.com/docs/reference/slash-commands

Initial integration target: ChatGPT/Codex running locally on the same computer as the app. Web/mobile-to-desktop handoff is outside the first version. Exact installation, invocation name, transport, and app-launch behaviour require testing on the intended client.

Confirmed handoff behaviour:

- "Create a poster" starts its first generation automatically. "Start a poster project" opens the brief ready for discussion.
- Reuse an exactly matching organisation/project; create the project when missing and always create a new document. Ask when the intended destination is ambiguous.
- Same-computer desktop integration is sufficient initially.

The handoff creates a new app-owned conversation. Transfer of an entire existing ChatGPT thread or automatic continuous mirroring has not been requested or established.

## Authentication investigation

The public Sign in with ChatGPT plan-usage preview excludes the hosted image-generation tool on its documented public Responses API route, including its documented app-server configuration:
https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

This finding does not establish the capabilities of every device-authenticated Codex/ChatGPT route. Investigate those routes separately before selecting an integration. OAuth/device login and working image generation must be demonstrated together before claiming feasibility.

Further official documentation establishes a distinct native Codex route: interactive CLI image generation counts toward included Codex usage, and app-server supports product integration and `chatgptDeviceCode` login.

- https://learn.chatgpt.com/docs/image-generation
- https://learn.chatgpt.com/docs/app-server

Candidate architecture: Rust desktop application → official Codex app-server → managed ChatGPT login → native image generation. This remains a proposal pending an account/build integration proof covering generation, edits, references, output retrieval, and transparency.

### Initial local proof — passed 2026-10-15

Using installed `codex-cli 0.162.0-alpha.17.2`, a Node stdio protocol client initialised app-server, confirmed `account/read` returned `chatgpt`, and read `imageGeneration: true` from provider capabilities. An ephemeral thread received one explicit pumpkin-generation prompt. The native `imageGeneration` item completed successfully and returned a readable `savedPath` with `transparentBackground: true` and no failure.

The PNG is 1374 × 1145, 945153 bytes, RGBA. A System.Drawing sample every eight pixels found 12948 fully transparent pixels and 12 fully opaque pixels; visual inspection confirmed the isolated pumpkin. The output was copied into the proof workspace independently of Codex's generated-image storage.

Reproducible inspection artifacts are under `work/integration-proof/`: `evidence.json`, `alpha-check.json`, and `pumpkin.png`. The scratch client is `work/prove-imagegen.cjs`. The client inherits the existing managed login; it does not read or print credentials. No API key was supplied by the proof.

This initial proof established native generation, result events, file retrieval, and actual transparent output on this installed build/account. Subsequent integration and application checks are recorded in `VALIDATION.md`. The Node scratch client is protocol exploration, not the Rust application.

## Implementation and remaining qualification

Implemented: Tauri desktop shell, Rust storage and Codex bridge, React canvas/conversation interface, SQLite metadata with immutable media, revision/context branches, original-image overlays, asset versioning, local companion tools, backups, and exports. See `VALIDATION.md` for which behaviours have been exercised.

- Complete fresh device sign-in with the user; start/cancel and existing managed sign-in are tested.
- Qualify native image interruption and crash recovery. Local interruption does not establish that remote work or usage stopped.
- Qualify the first builds on macOS and Linux; only Windows has a native build/test environment here.
- Verify client discovery and natural-language invocation of the installed companion skill in a fresh desktop chat; the tool bridge itself is tested.
- Continue native UI acceptance checks for the remaining edge cases identified in `VALIDATION.md`.

## Acceptance scenarios

1. Create Derby College → Oliver → Main Poster, select A3, generate an image through managed ChatGPT authentication, restart, and recover the image and its page conversation.
2. Add a second page. Its conversation has no automatic access to page one's conversation; explicitly referencing page one's image works.
3. Discuss an idea without generating an image. Generate/Edit produces one new current image revision while preserving history.
4. Continue from revision 2 after reaching revision 5. The new request uses revision 2's conversation context; revisions 3–5 and their conversation remain recoverable.
5. Place the original DCG logo, move it, and regenerate the underlying artwork. The original logo remains unchanged and positioned. Undo/restore recovers previous complete compositions.
6. Create a transparent pumpkin asset, refine it in its own workspace, and use the selected version as a prompt reference. Replacing/deleting the library asset does not change existing designs or their stored references.
7. Create a new document from an image. It begins a fresh conversation with the chosen image, new prompt, and source link. An aspect-ratio change preserves the original and offers previewed fit/crop/regenerate choices.
8. Search by name or tag across projects, documents, and assets; organisation/type filters and result paths identify each match.
9. Export PNG, JPEG, and a correctly sized multipage PDF with overlays included. Report native image resolution separately from export dimensions and flag insufficient print resolution.
10. Generate on one page while browsing another document. Progress, cancellation, and failure/retry remain attached to the correct page without replacing a newer design silently.
11. Restore deleted work from Trash, then recover the complete workspace from a backup including conversations, revisions, and exact referenced asset versions, without restoring login credentials.
12. Invoke the installed Image Gen App workflow from the local desktop ChatGPT/Codex client with the Courtyard/A4/Halloween Cocktail Hour brief. Verify the intended organisation/project/document, opening page message, navigation into the app, and duplicate-free retry. "Create a poster" begins generation; "start a poster project" opens discussion. Reuse an exact matching project, create a missing project, and ask about ambiguous destinations.

## Proposed delivery order for review

1. Integration proof → verify login, image creation/editing, references, transparency, and output recovery using the intended subscription route.
2. Local workspace foundation → verify hierarchy, persistence, branching page history, and asset ownership/versioning.
3. Editor and assets → verify prompt references, asset creation, unchanged overlays, and nonblocking generation.
4. Search, export, and recovery → verify the acceptance scenarios and desktop packaging on each target platform.

The first working Tauri/Rust application is implemented. Its integration, native workflow evidence, and remaining qualifications are tracked in `VALIDATION.md`. The agreed brief is the product target; it is not a declaration that every platform or recovery scenario has been qualified.


## Optional private server — 0.6.0 (2026-10-15)

Approved: a separately deployable Rust Docker service, optional desktop connection in Settings, one private owner/workspace, LAN first and HTTPS reverse proxy for internet access. Generation stays on the client that starts it; the server stores shared workspace metadata and immutable media, never ChatGPT credentials or generation jobs.

Implementation uses SQLite and media on a persistent Docker volume; the existing local SQLite workspace stays separate and unchanged. Connecting never uploads implicitly. Explicit copy to an empty server verifies SHA-256 image uploads and the committed metadata. Access keys use the desktop system credential vault. Record-based optimistic merging accepts independent document changes and rejects stale edits to the same document/asset. Offline mode shows cached work; failed writes keep local recovery snapshots and new image files, exportable as workspace backups. There is no automatic offline replay or force overwrite. Shared-server restore is blocked; restore in local mode.

Canonical setup, workflow, limits and operations: [SELF-HOSTED-SERVER.md](SELF-HOSTED-SERVER.md). Workspace format remains 3 and app identity remains `com.mark.imagegenapp`; first existing-workspace opening saves `before-v0.6.0.zip`. Installer Upgrade behaviour is retained.


## Browser access and self-contained desktop install — 0.7.0

Mark approved shared browser access and an optional Linux generation worker. Desktop generation remains on the starting PC; browser generation uses the explicitly enabled server worker and survives closing the tab. The existing React editor and Rust operations are shared, rather than rewriting the application into WebAssembly. A private access-key login establishes an HttpOnly session; browser exports/backups download normally. Server worker credentials and provider sessions use a separate private Docker volume. The workspace identity/format stay unchanged.

Mark also clarified that destination PCs may not have Codex installed. The Windows installer now bundles the qualified official managed runtime and companion helper; Settings offers ChatGPT OAuth/device-code sign-in. Portable distributions include the runtime folder. Runtime versions are pinned and qualified with actual image generation, not capability detection alone. Setup and limits are canonical in SELF-HOSTED-SERVER.md; checks are in VALIDATION.md.
