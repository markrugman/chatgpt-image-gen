# Asset extraction and clean recreation — version 0.4.0

Approved 2026-10-15 after the 0.2.0 glass extraction retained part of the scene inside its rim/stem. Transparent pixels outside a silhouette do not establish clean isolation throughout the subject.

## Keep original pixels (0.4.0)

For logos that must retain exact lettering, colours and shapes, choose **Extract asset → Keep original pixels**. Drag a box or enter integer pixel coordinates. The crop reads the immutable original base image at native resolution, independent of canvas zoom, document framing or placed overlays. Reuse placed library artwork directly from the library. No ChatGPT analysis or generation runs in this method.

The default crop preserves every decoded RGBA pixel. Optional **Erase connected background on click** removes only the connected area matching the clicked colour; tolerance defaults to zero. Increase it carefully for uneven backgrounds. Each seed operates on the unmodified crop. Undo removes the last click; Reset background removes all clicks; changing the crop resets the mask. Only selected pixels’ alpha is cleared; retained pixels are never recoloured or resampled. Enclosed white lettering is not automatically erased with the outer background. Click enclosed unwanted regions separately after checking the preview.

Checkerboard, white, black and bright-pink backgrounds are display-only. Edge fringes can remain because this method deliberately does not reconstruct or recolour pixels. Use the existing AI methods when reconstruction is needed, accepting that details can change. Extraction supports 8-bit PNG/JPEG/WebP; higher-bit-depth inputs are rejected instead of silently reduced. PNG colour-space metadata and embedded ICC profiles are retained. JPEG orientation is applied as an exact pixel permutation; output is lossless PNG.

Saving creates one new asset/version with its own empty conversation, source references, and immutable PNG; the source document and original file remain unchanged. Later JSON analysis uses the saved crop first and the full source for identification. AI recreation remains an explicit subsequent action.

## Object-specific guidance

Version 0.3.1 replaces the universal cocktail-glass template. Object type defaults to Automatic. Faithful extraction first analyses the selected image to identify a logo/graphic mark, glass/transparent container, food/drink without glass, or another object. Choosing an explicit type overrides detection and avoids that preliminary analysis for faithful extraction.

Logo guidance preserves visible lettering, typography, symbols, palette, spacing, proportions, intentional white artwork, badge shapes and negative space. It prohibits redesign, guessed missing branding and physical product effects. Glass-only rim/stem/transmission instructions and food presentation instructions are absent from logo generation prompts. A flat logo depicting a drink is treated as artwork, not a real container.

JSON analysis identifies object_type and includes only relevant appearance fields. Explicit type selection uses a focused analysis prompt. Recreation reads the type in the JSON unless overridden. Older JSON without a recognised type uses neutral preservation guidance; old saved descriptions are never silently rewritten. Re-analyse an older brief to refresh previously inappropriate fields, or choose the appropriate type and edit the brief. Logo recreation treats unrelated legacy appearance fields as inapplicable. AI guidance is not a guarantee of pixel-exact brand reproduction.

## Extract faithfully

Choose Extract asset in a document, optionally select a region, and name/describe the object. The selected close-up and frozen full composition guide one new organisation/shared asset. The prompt explicitly removes the scene visible through glass, reconstructs neutral glass and retains object-specific edges, contents and highlights. The source document remains intact. Fine details may change; this is AI-assisted isolation.

## Recreate as a clean asset

Select this method, then Create JSON description to analyse the reference using the managed ChatGPT connection. Analysis produces text only in its own temporary conversation. Review and edit the JSON before generating. Nested fields and custom keys are accepted; the top-level object must contain a non-empty subject string. Invalid JSON cannot create an asset or start generation.

The default is generation from JSON alone in a fresh provider conversation, with no source image or prior page image attached. Also use the original image as a visual reference explicitly attaches the original references. This may preserve identity more closely but can preserve unwanted scene details. Source references and editable JSON are saved with the asset.

In an asset workspace, JSON description opens the saved brief. Analyse source image can create a brief for older/imported assets. Save description changes the brief without generating. Recreate asset creates a new revision in a fresh conversation; earlier versions remain available. The JSON used for each generation remains in its revision prompt, so later brief edits do not rewrite old revisions.

## Preview and quality review

Asset previews switch between checkerboard, white, black and bright pink. The preview is remembered locally and affects only display; image bytes and export transparency are independent. Review the silhouette, rim, empty bowl, stem and base. Look for old scenery, coloured fringes, white/grey fills and unwanted opaque patches. Alpha counts alone cannot establish visual correctness. A single RGBA asset cannot fully reproduce all background-dependent glass optics.

JSON recreation is a new rendering, not a lossless extraction. Geometry, reflections, decoration and garnish can vary. Use the asset conversation or edit the JSON to refine the result. Exact original branding can use Keep original pixels or an imported original asset.

## Persistence and upgrade

Asset descriptionJson/sourceReferences have compatible defaults for older workspaces. The workspace format stays at 3; version 0.3.1 requires no schema change. The first opening of an existing workspace in each app version creates before-v<VERSION>.zip with its exact saved JSON and immutable media; 0.3.1 therefore creates before-v0.3.1.zip even when upgrading from 0.3.0. Existing backups are retained and the current version's archive is not overwritten on ordinary reopen. Legacy pre-format-3 data is still backed up before recording the format marker. The stable com.mark.imagegenapp storage identity and transactional writes remain unchanged. Credentials and provider runtime sessions are excluded. Acceptance uses an isolated copy and separate app identity, leaving the live installation untouched.

Official guidance consulted: https://learn.chatgpt.com/docs/app-server and https://developers.openai.com/api/docs/guides/image-prompting. No separately billed Image API or API-key fallback was added.
