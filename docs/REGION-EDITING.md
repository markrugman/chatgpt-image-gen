# Canvas region editing

Updated: 2026-10-17. Mark authorised this revised workflow, testing and a private server update without a GitHub push. This replaces the 0.10.0 modal/Annotate-button workflow and its multi-target batches.

## Interaction

1. Right-click the background or a placed Asset/Upload, or long-press it on mobile, to open the existing canvas context menu.
2. Choose **Edit**. The selected item stays in place and is focused; other items are dimmed. Locked layers require unlocking first. There is no Annotate button or editing dialog.
3. Drag a rectangle directly on the canvas. A small inline instruction input appears by the selection. Enter the instruction and press Enter or Add.
4. Each saved instruction becomes a numbered, removable pill in the existing chat composer, beside existing image-reference attachments. Clicking a pill focuses its region for editing; Done exits drawing without removing saved pills.
5. Add more regions on the same item. Add optional general instructions and Subject/Style/Logo/Other reference attachments through the existing composer.
6. Submit using the existing **Generate / Edit** send button or Ctrl/Cmd+Enter. One request edits one full original image, with all its region notes, general instructions and explicit references.
7. Review the result through an inline chat card and Original/Edited canvas comparison. Apply edit, Retry edit or Discard result. No separate review dialog is used.

## One pending item

The first saved region instruction fixes the edit target: the page background or one particular placed layer. Other items' Edit menu entries are disabled until all pending pills are removed or the current request is finished. Choosing a different placement of the same source Asset is still choosing a different item.

The server rejects mixed-target notes, including disabled notes, and rejects replacing an existing pending target without explicitly clearing its notes first. Generation rejects legacy multi-target requests; older saved notes remain recoverable and can be cleared rather than silently sent to several targets.

Done only exits drawing. It does not release a target that still has pills. Removing the last pill releases it. During generation/result review the affected page remains protected; other pages can be used normally.

## Interpretation and source preservation

Rectangles identify intended subjects, not strict clipping masks. Selecting 95% of a phone screen and requesting a red background means change the whole intended phone-screen background.

Always send the clean, full original target image first. Supply source-relative note locations and text, then any explicit reference images. References guide this one edit; they are not additional edit targets. The chat's general instructions and reference roles are captured with the request and retained for retries.

Keep the full returned image. Do not crop to rectangles or bake annotation boxes/numbers into the artwork. Unrelated content drift is handled by comparison/retry. No pixel-exact preservation inside a regenerated target is promised.

- Background result: replace the background while retaining separate overlays unchanged.
- Placed Asset/Upload result: create a separate Asset in the design's organisation and replace only that placement, retaining position, size, rotation and ordering. Preserve its original source and other uses; a shared source yields an organisation-owned replacement.
- Create replacement Assets only on Apply. Keep original images and earlier revisions. Apply is one undoable Design State; Undo/Redo restores the complete composition.

## Persistence and recovery

Saved pills belong to their page and source image version. Reopening a page restores them. If the source changes, highlight the stale pills and require reviewing/updating their regions before sending.

Retry uses the captured original, notes, extra instructions and references. Discard leaves saved notes available and restores the captured extra instructions/references to the composer for revision. Cancellation/failure leaves the design unchanged. The request/result persists across browser refreshes; a server restart marks interrupted jobs failed so they can be retried.

Source transparency is checked; results that lose it are rejected. Aspect-ratio drift over 2% prevents applying a stretched replacement. Other content/alignment differences require visual comparison.

## Geometry and engineering

Canvas selections map through background fit/crop and layer scale/rotation into normalised source-image coordinates. Display boxes map back through those transforms. Pending overlay saves are flushed before entering Edit.

The existing context menu handles mouse, long-press and touch Actions entry. Drawing has its own pointer capture and cancellation, avoiding long-press/drag interference. Inline touch controls activate from pointer release as well as normal keyboard/mouse form submission, without saving twice.

Draft saves use stable field comparisons, independent of JSON property order, with existing stale-write protection. Backend candidate saves, source checks, immutable media, revision snapshots and backup/restore retain the previous preservation guarantees.

Relevant implementation: `src/RegionCanvas.tsx`, `src/RegionReview.tsx`, `src/annotationEditing.ts`, `src/CanvasCommands.tsx`, `src/Editor.tsx`, and `src-tauri/src/annotations.rs`. Verification and private deployment evidence are recorded in [VALIDATION.md](VALIDATION.md).

## Scope

Included: background and placed-image editing; rectangular regions; inline instructions; saved editable/removable chat pills; one-item enforcement; extra chat instructions and reference attachments; existing send action; inline comparison/retry/apply and undo.

Deferred: brush/lasso, native editable text/vector objects, automatic effects across layers, and whole-composition flattening. The old modal, standalone Annotate button and multi-item edit queue are removed.
