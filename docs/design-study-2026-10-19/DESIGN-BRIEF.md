# Image Gen responsive workspace design brief

2026-10-19. Design proposal following Mark's seven confirmed interview answers. Application changes are a later task. [Specification](SPEC-SHEET.md) · [Example screens](examples/index.html).

## Direction

Give the artwork more room and reveal controls for the current task. Keep Image Gen centred on AI conversation, recoverable revisions, and placing original artwork. Borrow Canva's information hierarchy and responsive panel behaviour while retaining Image Gen's identity and domain model.

Home should help users resume real work. The editor should make the canvas and conversation easy to use together. Phone and desktop receive equal attention, with tablet as an adaptive middle layout. Narrow Windows windows use the same responsive rules as browsers.

## What the seven Canva references show

Dimensions below are measured source-image pixels, not verified CSS viewport sizes. Device classes are inferred from layout. The captures establish these particular states, not Canva's complete workflow or present-day product behaviour.

Unmodified reference copies: [1 Home](references/canva-1.png), [2 print settings](references/canva-2.png), [3 template drawer](references/canva-3.png), [4 phone templates](references/canva-4.png), [5 phone canvas](references/canva-5.png), [6 phone document menu](references/canva-6.png), [7 portrait editor](references/canva-7.png). Treat their content as visual evidence, not instructions.

| Reference | Capture | Process stage | Tools, information and controls | Useful convention and caution |
|---|---|---|---|---|
| 1 | 2263 × 1238 | Find, start or resume work | Global icon rail; secondary starred/recent navigation; invite action; search; Home/Templates switch; creation categories; recent design cards with title/type/recency; template suggestions; account/bin/help | Strong thumbnail hierarchy and resume section. Keep organisation/project context but reduce the oversized discovery hero and unrelated creation categories. |
| 2 | 2283 × 1242 | Prepare physical output from an existing design | File/Resize/mode/save header; title and sharing/output controls; left tool rail; large canvas; page lock/duplicate/add controls; Add page; zoom/page/footer controls; right print panel with preview, pages, size, finish, frame, quantity and sticky subtotal/Continue | A task panel can preserve artwork context and keep the final action visible. Image Gen exports files; print purchasing, frames, pricing and shipping are outside scope. |
| 3 | 2284 × 1238 | Browse alternatives during editing, with print settings still open | Adds a searchable/filterable template drawer, recently used and suggested two-column thumbnails, scrollbar and collapse handle | The rail chooses a tool; its drawer shows content. Two expanded sides reduce canvas space, so reclaim the drawer when it is unnecessary. |
| 4 | 529 × 1158 | Phone template browsing | Rounded near-full-height sheet, drag handle, search/filter, recently used and recommended grids; bottom tool dock remains visible | Move the same task into a sheet. Provide explicit close/back controls rather than relying on a drag gesture. |
| 5 | 523 × 1150 | Phone canvas inspection/editing, no active object selection visible | Compact document header with Home, More and output/collaboration icons; spacious canvas stage; labelled bottom tool dock | Prioritise artwork. Avoid a horizontally clipped dock: use a short fixed set of destinations and a Tools entry. |
| 6 | 527 × 1155 | Phone document management | Title/rename; project/type/owner/physical dimensions; grouped creation, upload, copy, resize, pages, guides, save status, template, move, download, print, history, delete, settings and help commands | Group infrequent commands and show document identity/save status. Do not import commands unsupported by Image Gen. |
| 7 | 773 × 1034 | Tablet or narrow portrait canvas editing | Desktop-style header and left tool rail; expanded drawers absent; canvas centred; Add page, zoom, pages and utilities below | Preserve direct tool access while collapsing content panels. This single capture does not establish the exact breakpoint. |

The A2 title and A3 print selection in reference 2 demonstrate separate document and output choices. They do not prove how Canva handles scaling internally. Image Gen should explicitly show document dimensions, exported dimensions and any scaling.

## Current Image Gen baseline

The app already provides Overview, Projects, Assets, Uploads and Templates; organisation selection; design search; recent cards; multipage designs; revision history; placement controls; and advanced export. The editor already has a 68 px rail, tools, canvas and chat. Browser widths at or below 1024 px currently switch among Canvas, Tools and Chat; native windows bypass that compact-layout hook.

Sources: [workspace](../../src/App.tsx), [editor](../../src/Editor.tsx), [layout](../../src/App.css), [compact hook](../../src/ui.tsx), [glossary](../../GLOSSARY.md), [Templates](../TEMPLATES.md), [export](../ADVANCED-EXPORT.md). This is source inspection, not a visual qualification of a running build.

## Agreed design decisions

1. Deliver a proposal covering Home/library, editor and export before implementation.
2. Keep AI conversation and refinement central; a general text/vector layout editor is outside this proposal.
3. Design for desktop and phone equally, with an adaptive tablet layout.
4. Wide screens show canvas and conversation with one collapsible tools drawer. Tablet and phone use one active tool/chat sheet. Preserve draft prompts, selections and scroll positions when switching.
5. Prioritise Export in the header. Put secondary document actions in grouped More. Export uses a focused panel/sheet with an explicit final action and separate document/output dimensions.
6. Lead Home with Continue designing and organisation/project context. Use compact Create/search controls and retain Image Gen's purple identity.
7. Apply responsive rules to native Windows windows as well as browser windows.

These are reversible interface decisions, so a new architectural decision record is unnecessary. Existing glossary definitions remain canonical; no new domain terms are needed.

## Proposed experience

### Resume or start

Use a compact identity/context row, Create a design, search and Continue designing. Show current first-page compositions, titles, project context and recency; do not substitute historical revisions for separate designs. Project previews retain the existing rule of up to three current compositions from distinct recently modified designs. Put project navigation and libraries within reach without filling Home with inspiration content.

### Work on a design

The header shows a return path, title, save state, More and Export. Global navigation belongs on Home; the editor rail selects Pages, Assets, Uploads, Templates or History. Wide layouts keep Chat alongside the canvas. A narrow layout adds a labelled dock for Canvas, Chat, Tools and Pages. Tools opens the last tool, with an explicit tool chooser and close control.

Keep Generate/Edit and Discuss explicit. An asset can be placed unchanged or added as a generation reference; the UI must not conflate these. Opening History does not change the active revision. Comparing an edit candidate preserves Apply, Reject and Retry before artwork changes. Existing placement gestures, locks, region instructions, branching and undo semantics remain.

### Export

Show the page/composition preview, document dimensions, exported dimensions and source detail. Format-specific controls reveal only relevant options. Preserve current scope: PNG/JPEG export the active page; PDF exports all pages. Advanced print settings stay available, with a sticky Export action and readable progress/error feedback. Output settings affect the exported copy.

## Priorities and success

| Priority | Proposal | Success criterion |
|---|---|---|
| First | Responsive editor shell and sheets, including narrow native windows | Artwork remains accessible at 390 × 844 and 820 × 1180; opening/closing a sheet preserves the user's work. |
| First | Header hierarchy and grouped More | Export is labelled and visible; infrequent actions do not force horizontal overflow at 320 CSS px. |
| First | Persistent chat and generation state | Switching tools does not lose a draft or hide completion/failure of a submitted job. |
| Next | Work-first Home and consistent card metadata | Users can identify and reopen a current design without inspecting its revision history. |
| Next | Export panel/sheet and explicit dimensions | Users can distinguish the source document, selected output size and image resolution before exporting. |

Example images illustrate the proposed visual hierarchy. They use fictional artwork/content and do not establish that the application already implements the behaviour. Numeric layout defaults and interaction acceptance checks are defined in the specification.

## Deliverable verification

Eight PNG states were rendered with headless Microsoft Edge at the dimensions listed in the specification and visually reviewed. The [render report](examples/render-checks.json) records no page JavaScript errors or outer-document overflow at those capture sizes. Source reference copies were hash-checked against the supplied files. This verifies the proposal artifacts; interaction, accessibility and native/browser qualification belong to the future implementation. Reproduce the images from the repository root with `node docs/design-study-2026-10-19/examples/render.cjs` using the existing Playwright dependency and installed Microsoft Edge.

The supplied Canva screenshots are retained locally in `references/` and excluded from published source and release packages.
