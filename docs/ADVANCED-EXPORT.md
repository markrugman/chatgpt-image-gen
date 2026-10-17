# Advanced exports — 0.5.0

Approved by Mark on 2026-10-15: both bleed methods, crop marks, RGB/CMYK PDF, and adjustable JPEG compression. Existing creations must be preserved.

## User flow

Choose Export in a document. The panel shows a current-page preview, output dimensions and original image resolution. PDF still exports every page in order; PNG/JPEG export the active page. The dialog scrolls its settings while keeping Export visible, including a 1024×760 window. All controls affect the exported copy only.

### PDF

RGB is the default. CMYK uses the bundled unchanged Coated_Fogra39L_VIGC_300.icc profile, shown as Coated FOGRA39 / 300% ink limit (VIGC). This is a generic coated-paper offset target, not a match for every printer or paper. The profile's provider and conditions are recorded at https://registry.color.org/profile-registry/Coated_Fogra39L_VIGC_300 and in src-tauri/profiles/README.md.

The browser renders the complete image and overlays in its default sRGB canvas. Rust/Little CMS converts the flattened sRGB image to CMYK with relative colorimetric intent and black-point compensation. Each PDF image is four-channel ICCBased, losslessly Flate-compressed, with the exact unchanged ICC profile embedded. The document also has an OutputIntent identifying FOGRA39. Crop marks in a CMYK PDF use black-only DeviceCMYK. No PDF/X conformance is claimed. No ChatGPT request is involved in export.

CMYK preview converts a small image to the target CMYK profile and back to sRGB. RGB original toggles the comparison. This is a screen simulation, not a calibrated physical print proof or paper-white simulation.

Bleed is off by default. Enabling starts at 3 mm per side, editable from 0.5 to 20 mm. Extend edges stretches the outermost pixels into the new area while keeping the finished-page layout. Crop to fill uniformly enlarges the composite to cover the bleed rectangle, potentially cropping content near the trim. Both use the saved composition, including placed assets; neither generates or rewrites artwork.

Optional crop marks are eight 0.25-point vector strokes outside the bleed, with a 3-point gap and 9-point length. An 18-point outer margin accommodates them. TrimBox retains the exact finished document dimensions. BleedBox includes the requested bleed. MediaBox includes the full sheet and crop-mark margin; no outer margin is added when marks are off. Crop marks can also be used without bleed. Coloured trim/bleed guides appear in the preview only, never in exported artwork.

### JPEG and PNG

JPEG quality ranges from 1 to 100, default 90. The preview and estimated size are encoded at the actual output dimensions with the selected quality; compression changes bytes, not dimensions. Export uses the same quality. PNG remains lossless; PNG preserves existing transparency for both documents and assets. Transparent areas appear on a checkerboard in the design canvas; the checkerboard is a viewing aid and is not exported. JPEG and print/PDF composition use a white background. PDF bleed/marks/colour settings do not affect PNG or JPEG.

## Preservation and limits

Storage identity com.mark.imagegenapp, workspace format 3, media files, documents, assets, histories, chats and custom sizes remain unchanged. Existing workspaces receive a once-per-version before-v0.5.0.zip snapshot before any new-version write. Existing backups are not replaced. The same NSIS Upgrade/default repair routing introduced in 0.4.0 remains.

The 80-million-pixel export limit also applies after adding bleed. Export cannot add detail absent from the source; print-resolution warnings remain. Multi-page PDFs contain raster page composites with vector crop marks, rather than editable text or vector artwork. The generic profile does not replace printer-specific requirements.
