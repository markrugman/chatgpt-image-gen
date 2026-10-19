# Image Gen responsive workspace specification

2026-10-19. Proposed implementation defaults under the [agreed design direction](DESIGN-BRIEF.md). Numeric values are design recommendations, not measurements of Canva. [Example screens and PNG files](examples/index.html).

## Layout and visual tokens

| Property | Proposed value |
|---|---|
| Font | Existing Inter / Segoe UI stack; body 14 px desktop, 16 px phone; supporting text at least 12 px |
| Palette | Existing accent #7753cb, hover #6540b7, ink #282534, surface #ffffff, page #f7f7fa, border #eae8ef; retain existing dark-theme equivalents |
| Contrast | Check final text at 4.5:1 and large text/UI boundaries at 3:1; increase muted-text contrast where necessary |
| Spacing | 4, 8, 12, 16, 24, 32 px; 12 px card/control corners; 20 px sheet top corners |
| Targets | At least 44 × 44 CSS px for primary interactive targets; icon buttons have accessible names |
| Header | 64 px desktop/tablet; 56 px phone, plus safe-area inset where needed |
| Wide editor | Width ≥1280 px: 64 px tool rail; optional 288 px drawer; flexible canvas; 360 px Chat; bottom canvas controls/status bar |
| Wide canvas | Preserve at least 480 px stage width. Collapse the drawer if the available width falls below that; artwork uses Fit to Window by default |
| Tablet | 768–1279 px: 64 px tool rail and canvas; at most one 360 px right overlay sheet, capped to available width minus 64 px; Chat collapsed initially |
| Phone | Width <768 px: canvas, 56 px header, 64 px dock plus safe area; one bottom sheet at a time; no horizontal tool-strip scrolling |
| Short windows | Usable editor height <640 px: hide optional descriptive chrome, scroll sheet content, keep close and primary actions reachable |
| Motion | 160–200 ms panel transitions; honour reduced-motion preference |

Breakpoints use available CSS pixels, not device identity, browser user-agent or physical display resolution. Browser and native use the same rules. Resizing the window is never a navigation action and must not reset document state.

## Home and libraries

Home retains the existing Overview route; the visible label may be Home. Desktop uses an organisation/project navigation sidebar; phone uses a labelled navigation button and drawer. Show organisation context next to search/Create. Continue designing comes before project summaries and template suggestions.

Cards contain a stable thumbnail area using contain-fit, title, project and modification information. Current composed first pages are the thumbnails. Preserve shared newest-modification ordering and existing organisation ownership rules. Search is scoped visibly; an empty result offers Clear search. A genuinely empty workspace offers Create a design rather than an empty grid. Loading uses fixed-size placeholders; failed loading offers Retry without showing false empty content.

## Editor controls

| Area | Controls and information |
|---|---|
| Header | Back to workspace; title/rename; compact project context; Saved / Saving / Save failed; More; labelled Export |
| Tools | Pages, Assets, Uploads, Templates, History. The selected tool is visually and programmatically identified |
| Canvas | Composition; existing selection, transform and region-edit affordances; contextual placement controls; undo/redo |
| Status | Fit, zoom, current page/total and relevant source-detail status; phone groups secondary status under Canvas options |
| Chat | Existing page conversation, Generate/Edit versus Discuss, template inputs, explicit attachment roles, pending region instructions and submission state |
| Phone dock | Canvas, Chat, Tools, Pages; selected destination indicated with text and icon; Chat shows a running/completed/failed job indicator |

More groups supported commands: Document (rename, document dimensions, use in new design, existing copy/move where available), Reuse (save as template, extract asset), and navigation to History. Show only actions supported for the current Document, Asset or Upload workspace. Ownership transfer stays in its existing workflow. Destructive actions, if exposed, are separated and retain their existing confirmation. Do not invent sharing, print ordering, offline mode or text-layer editing.

On wide layouts, selecting the active rail tool again collapses its drawer; selecting another tool replaces drawer content. Chat remains visible. Closing a drawer triggers Fit recalculation only while Fit to Window is active; manual zoom/pan should not unexpectedly reset.

## Sheets and state transitions

| Trigger | Result and retained state |
|---|---|
| Open Chat/Tools/Pages in compact layout | Open the corresponding sheet; replace the previous sheet; retain each panel's scroll and draft state |
| Close, Escape or Back from a sheet | Return to canvas and restore focus to the invoking control; do not leave the document |
| Choose Place on phone | Place unchanged using existing placement rules, close sheet, show the selected placement on canvas |
| Add as reference | Add an explicit reference chip and open Chat with the draft intact; no canvas placement |
| Use a Template | Open Chat with the existing Template Snapshot/input workflow; explain that Templates are reusable prompts |
| Choose an older revision | Use existing explicit revision/branch controls; merely opening History never changes the design |
| Submit generation then close Chat | Keep job running; dock/rail shows status; completion makes the result reachable without automatic application of an edit candidate |
| Resize across breakpoints | Preserve selected page, revision, placement, draft, attachments and active job; map open Chat/tool to the equivalent layout |
| Open Export | Close the active tool sheet while remembering it; Export owns focus until closed; do not stack multiple modal sheets |

Phone tools initially open at roughly 72% of the available stage height, can expand to full available height, and have an explicit expand/collapse button as an alternative to dragging. Chat opens tall enough to expose the composer; More and Export use near-full-height sheets. Tablet uses the right overlay sheet. A visible portion of the canvas maintains context when space allows; short screens and the keyboard may require a full-height sheet.

Sheet headings and close controls remain fixed. Only sheet content scrolls; page background does not. Per Mark's 2026-10-19 follow-up, mobile drawers allow direct switching through the visible dock/tablet rail. These are nonmodal dialogs: the canvas stays inert, while keyboard focus can move between the active drawer and navigation. Switching Pages/Tools/Chat preserves draft/filter/scroll state and reuses one Back entry. Canvas dismisses that entry before exposing the canvas. Export and other modal dialogs still block background navigation. Non-modal wide drawers do not trap focus. Dragging is optional, never the only way to close or resize. Mark authorised LAN deployment of this follow-up on 2026-10-19; public release remains on hold.

Use dynamic viewport height, safe-area insets and keyboard-aware available height. The composer and send button must remain above the software keyboard. Showing or dismissing the keyboard must not submit, clear or duplicate a draft. Per Mark's interaction correction, Asset/Upload drawer cards place on a single click or short tap; right-click or a 500 ms touch hold opens the existing context menu for Add as/Place. Do not show persistent Place/Reference action rows. Release after a hold must not place or select an option; scrolling, cancellation and a second touch cancel pending holds. Preserve keyboard menu controls and desktop dragging. Mark authorised LAN deployment of this correction on 2026-10-19; public release remains on hold.

## Export

Wide layout uses a 400 px output panel over the Chat side; compact layouts use the single active sheet. Restore the previous panel state on cancel/close. Freeze the exported composition consistently with the existing exporter while reporting subsequent edits separately if needed.

| Format | Controls and scope |
|---|---|
| PNG | Active page, output dimensions, existing transparency preserved, lossless; checkerboard is preview-only |
| JPEG | Active page, output dimensions, quality 1–100/default 90; opaque background |
| PDF | All pages in order; output dimensions, RGB/default or supported CMYK, optional bleed/edge method/crop marks; opaque composition |

Show document physical/pixel dimensions in their actual units, selected export dimensions, source-image resolution and effective detail/DPI where meaningful. Any size change belongs to the exported copy. Existing constraints and 80-million-pixel limit remain authoritative. Do not present changing DPI metadata as newly generated detail. PDF preview distinguishes trim, bleed and marks. Do not imply PDF/X compliance or a calibrated physical proof.

The fixed footer shows the explicit format action, for example Export PNG, and applicable page count. While exporting, prevent duplicate submission and show progress/busy text. On failure retain settings and offer Retry. On success announce the completed export using existing browser/native save behaviour. Advanced controls remain reachable by scrolling with the footer clear of content.

## Example screen inventory

| File | CSS viewport | Illustrated state |
|---|---|---|
| home-desktop.png | 1600 × 1000 | Work-first Home with organisation context and recent designs |
| editor-desktop.png | 1600 × 1000 | Tools drawer, canvas and Chat together |
| editor-tablet.png | 820 × 1180 | Rail and canvas with tools collapsed |
| editor-phone.png | 390 × 844 | Canvas with four labelled dock destinations |
| tools-phone.png | 390 × 844 | Initial Assets mockup; visible Place/Reference rows are superseded by Mark's click/long-press instruction |
| more-phone.png | 390 × 844 | Grouped document commands and save information |
| export-desktop.png | 1600 × 1000 | Output panel with preview, size, format and sticky action |
| chat-phone.png | 390 × 844 | Chat sheet with explicit generation/discussion modes |

Mockups are static state illustrations using fictional artwork, not interactive production code. The supplied HTML and render script make their dimensions and layout inspectable. Dark theme, keyboard-open, error and candidate-comparison states require implementation qualification even though they are not all illustrated.

## Acceptance checks for implementation

1. At 320 × 740, 390 × 844, 820 × 1180, 1024 × 760, 1280 × 800 and 1600 × 1000, no unintended horizontal page overflow; Export, More and sheet close remain reachable. Repeat narrow-window checks in native WebView2 and browser.
2. Type a draft, attach a reference, switch Assets → Canvas → Chat, then resize across breakpoints. Draft text, attachments, selected page/revision and placement survive; panel scroll positions restore.
3. From a phone asset sheet, Place produces exactly one unchanged placement and closes the sheet. Reference creates one reference chip in Chat with no placement. Repeat with keyboard/context-menu paths on desktop.
4. Submit a generation, close Chat, switch tools, then reopen. The same job and completion/error remain visible; an edit candidate is not silently applied.
5. Open/close sheets with pointer, keyboard and screen reader. Check names, modal semantics, focus return, Escape/Back, and no focusable obscured controls. Test reduced motion, dark theme and 200% zoom/reflow.
6. With a real software keyboard open, the composer, reference chips and submit control are reachable without horizontal scrolling; close/reopen the keyboard and verify the draft remains unchanged.
7. Export actual PNG/JPEG/PDF files from a multipage composition: verify page scope, dimensions, transparency/opacity, quality and existing print options. Confirm the document and original media remain unchanged and errors retain export settings.
8. Reopen existing work after the shell change: current composed previews, organisation ownership, exact asset versions, revisions/branches, undo and save status remain correct. Run repository-required checks for the eventual implementation.
