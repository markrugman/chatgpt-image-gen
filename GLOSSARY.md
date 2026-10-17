# Image Design Workspace

## Language

**Organisation**:
A company or client whose design work is grouped together, such as Courtyard or Derby College.

**Project**:
A collection of documents within an organisation for an event, production, or campaign.

**Document**:
A design within a project containing one or more pages.

**Page**:
An individual image design within a document, with one current image, its own chat log, and recoverable earlier revisions.

**Revision**:
A preserved generated version of a page's image. Creating a revision from an older version does not discard later versions.

**Conversation Branch**:
A continuation from a particular revision and its conversation context. Other continuations remain recoverable and do not automatically contribute context to it.

**Design State**:
A recoverable combination of a page's generated image and overlay arrangement, including the asset versions used.

**Overlay**:
An original asset or upload placed over a page's generated image without regenerating the placed image. Removing an overlay removes that placement without deleting its source Asset or Upload.

**Locked Overlay**:
An overlay protected against placement changes and removal until unlocked. It remains selectable and copyable; copies are independent unlocked placements.

**Region Instruction**:
A marked area and an instruction targeting a page's background image or a particular Overlay, represented as a saved chat pill; the area identifies the intended subject rather than a strict boundary for changes. All pending instructions target the same item; editing an Overlay creates a separate Asset and replaces only that placement.

**Edit Batch**:
A collection of Region Instructions for one item, submitted through the chat composer with optional general instructions and reference attachments against a captured Design State.

**Edit Candidate**:
An unapplied image returned for a target in an Edit Batch, available for comparison and rejection/retry before changing the design.

**Overlay Clipboard**:
A copied placement retaining its exact source image version, size and rotation for reuse across pages and designs in the same workspace. Pasting it creates an independent overlay without transferring source-library ownership.

**Canvas Image Paste**:
An image imported from the user's clipboard into the open design's organisation as an Upload and placed unchanged as an overlay. Undoing its placement leaves the Upload available in its library.

**Asset**:
Reusable artwork created, extracted, or explicitly saved as an asset, available as a generation reference or unchanged overlay. Assets belong to an organisation or a shared library.

**Upload**:
An imported image kept in the Uploads library, available as a generation reference or unchanged overlay. Editing in its library workspace keeps it an upload; Save as asset or an applied Region Instruction on its placement creates a separate Asset.

**Shared Library**:
Assets, uploads or templates available across organisations, separately identified from items owned by a particular organisation.

**Copy**:
An independently editable duplicate in a destination organisation. Copying a document preserves its pages, conversations, and revision history.

**Move**:
A transfer of an item's ownership to a destination organisation that removes it from the source library. Existing designs retain the image versions they already use.

**Asset Version**:
A preserved version of an asset. Designs retain the version they used when the library asset changes or is deleted.

**Asset Workspace**:
A workspace for creating and refining an asset, with its own conversation, preview, and revision history.

**Tag**:
A searchable label attached to a project, document, asset, upload, or template.

**Generation Reference**:
A selected image supplied to guide generation, shown explicitly in the prompt. It is distinct from placing an original image unchanged as an overlay.

**Template**:
A reusable image-generation prompt with an example image, selected to guide a new generation. A generation can use at most one template.

**Template Folder**:
A user-created, single-level grouping of templates, such as Avatars or Posters. Each template belongs to one folder.

**Template Snapshot**:
The preserved name and recipe of a template selected for a draft or used in a generation. Later library edits do not change that captured content.

**Template Usage Notes**:
Guidance for applying a template, such as which subject photographs to attach. Usage notes are shown to the user separately from the generation recipe.

**Fit to Window**:
A display mode that automatically scales a page to the available editor space without changing its document dimensions.

**Asset Extraction**:
Creating an isolated, reusable asset from an object in existing artwork, guided by the source image and optionally a selected region. AI-assisted extraction may change fine details.

**Custom Size**:
A saved set of document dimensions reusable across organisations. Removing a saved size does not change existing documents.

**Asset Description**:
An editable structured specification of an asset's appearance, materials, geometry, markings and transparency, used to guide recreation.

**Asset Recreation**:
Generating a fresh rendering from an asset description, optionally guided by its original image. Earlier asset versions remain recoverable.

**Preview Background**:
A temporary display colour or checkerboard behind an asset for checking its isolation and transparency. It is not part of the asset image.

**Native App**:
The installed desktop Image Gen workspace, usable on its own or connected to a private workspace server.

**Workspace Server**:
A private shared Image Gen workspace that can be opened from connected native apps or a browser.

**Companion**:
The local Codex integration that starts a design in the native app from a conversation.
