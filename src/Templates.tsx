import { useLibraryMove } from "./useLibraryMove";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileImage, Folder, FolderPlus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { api } from "./api";
import { LibraryImageTile } from "./LibraryImages";
import { Empty, ImageView, Modal, PageHeading, SectionHeading, type Act } from "./ui";
import { activeOrganisations, matchesSearch, type Message, type Template, type TemplateInput, type Workspace } from "./types";
import { TemplateInputDialog } from "./TemplateControls";
import { folderDates, newestFirst } from "./folderOrdering";

export type TemplateSource = { imageId: string; recipe: string; messages?: Message[]; template?: Template; answers?: Record<string, string> };
export const generalFolder = "general";

export function TemplateForm({ w, act, orgId, initialFolderId, template, source, onClose, onRefresh, management }: {
  w: Workspace; act: Act; orgId?: string | null; initialFolderId?: string; template?: Template; source?: TemplateSource;
  onClose: () => void; onRefresh: () => Promise<void>;
  management?: { duplicate: () => Promise<void>; transfer: (copy: boolean) => void; trash: () => Promise<void> };
}) {
  const [name, setName] = useState(template?.name || "");
  const [recipe, setRecipe] = useState(template?.recipe || source?.recipe || "");
  const [example, setExample] = useState(template?.exampleImageId || source?.imageId || "");
  const [owner, setOwner] = useState(template ? template.organisationId || "" : orgId || "");
  const [folder, setFolder] = useState(template?.folderId || initialFolderId || generalFolder);
  const [tags, setTags] = useState(template?.tags.join(", ") || "");
  const config = template || source?.template;
  const [templateMode, setTemplateMode] = useState(config?.mode || "generate");
  const [subjectRequirement, setSubjectRequirement] = useState(config?.subjectRequirement || "none");
  const [inputs, setInputs] = useState<TemplateInput[]>((config?.inputs || []).map(i => ({ ...i, defaultValue: source?.answers?.[i.id] ?? i.defaultValue })));
  const recipeInput = useRef<HTMLTextAreaElement>(null);
  const recipeSelection = useRef({ start: 0, end: 0 });
  const [editingInput, setEditingInput] = useState<TemplateInput | "new" | null>(null);
  const openInput = (input: TemplateInput | "new") => {
    const el = recipeInput.current;
    if (el) recipeSelection.current = { start: el.selectionStart, end: el.selectionEnd };
    setEditingInput(input);
  };
  const insertInput = (input: TemplateInput) => {
    const { start, end } = recipeSelection.current;
    const token = `{{${input.id}}}`;
    setRecipe(recipe.slice(0, start) + token + recipe.slice(end));
    if (!inputs.some(i => i.id === input.id)) setInputs([...inputs, input]);
    requestAnimationFrame(() => { const el = recipeInput.current; el?.focus(); el?.setSelectionRange(start + token.length, start + token.length); });
  };
  const markOptional = (input: TemplateInput) => {
    const { start, end } = recipeSelection.current;
    const phrase = recipe.slice(start, end);
    if (!phrase.includes(`{{${input.id}}}`) || phrase.includes("{{#") || phrase.includes("{{/")) { setError("Select the complete phrase containing this input; optional phrases cannot nest."); return; }
    setRecipe(recipe.slice(0, start) + `{{#${input.id}}}${phrase}{{/${input.id}}}` + recipe.slice(end)); setError("");
  };
  const [notes, setNotes] = useState(template?.usageNotes || "");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const manage = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  if (editingInput) return <TemplateInputDialog input={editingInput === "new" ? undefined : editingInput} selection={recipe.slice(recipeSelection.current.start, recipeSelection.current.end)} hasOptionalPhrase={editingInput !== "new" && recipe.includes(`{{#${editingInput.id}}}`)} onClose={() => setEditingInput(null)}
    onRemove={editingInput === "new" ? undefined : () => { const i = editingInput; setInputs(inputs.filter(x => x.id !== i.id)); setRecipe(r => r.split(`{{${i.id}}}`).join("").split(`{{#${i.id}}}`).join("").split(`{{/${i.id}}}`).join("")); setEditingInput(null); }}
    onSave={(input, mark) => {
      if (editingInput === "new") {
        let base = input.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0,52);
        if (!/^[a-z]/.test(base)) base = `input_${base}`;
        let id = base, n = 2; while (inputs.some(i => i.id === id)) id = `${base}_${n++}`;
        insertInput({ ...input, id });
      } else {
        setInputs(inputs.map(i => i.id === input.id ? input : i));
        if (input.required) setRecipe(r => r.split(`{{#${input.id}}}`).join("").split(`{{/${input.id}}}`).join(""));
        else if (mark) markOptional(input);
      }
      setEditingInput(null);
    }} />;
  return <Modal title={template ? "Edit template" : "New template"} onClose={() => { if (!busy) onClose(); }} wide>
    <form className="template-editor-form" onSubmit={async e => {
      e.preventDefault(); setError(""); setBusy(true);
      try {
        await act({ op: "template_save", ...(template ? { id: template.id, version: template.version } : {}),
          name, recipe, inputVersion: 1, mode: templateMode, subjectRequirement, inputs, exampleImageId: example, organisationId: owner || null, folderId: folder,
          tags: tags.split(",").map(s => s.trim()).filter(Boolean), usageNotes: notes });
        onClose();
      } catch (e) { setError(String(e)); } finally { setBusy(false); }
    }}>
      <div className="form-body">
      <label>Name<input required placeholder="Give your template a name" value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="template-field">
      <label>Prompt<textarea aria-label="Prompt" ref={recipeInput} onSelect={e => { recipeSelection.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd }; }} required rows={5} placeholder="Describe the style, composition and instructions to reuse…" value={recipe} onChange={e => setRecipe(e.target.value)} /></label>
      <p className="muted">Write the instructions to reuse. Place the cursor where an answer belongs, then choose Insert input.</p>
      </div>
      <div className="template-author-inputs"><button type="button" className="button secondary small" onClick={() => openInput("new")}>Insert input</button>{inputs.map(i => <button type="button" className="template-author-chip" key={i.id} onClick={() => openInput(i)}>{i.label}</button>)}</div>
      <div className="form-grid"><label>Action<select aria-label="Action" value={templateMode} onChange={e => setTemplateMode(e.target.value as "generate" | "discuss")}><option value="generate">Generate image</option><option value="discuss">Discuss (text only)</option></select></label>
        <label>Subject images<select aria-label="Subject images" value={subjectRequirement} onChange={e => setSubjectRequirement(e.target.value as "none" | "optional" | "required")}><option value="none">Not required</option><option value="optional">Optional</option><option value="required">Required</option></select></label></div>
      <details className="template-more-details"><summary>More details</summary><div className="template-extra-fields">
      <div className="template-field">
      <label>Example image<input className="template-image-input" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        setBusy(true); setError("");
        try {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 50_000_000) throw Error("Choose a PNG, JPEG or WebP smaller than 50 MB");
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
          canvas.getContext("2d")!.drawImage(bitmap, 0, 0); bitmap.close();
          const id = await api<string>("capture_composition", { data: canvas.toDataURL("image/png").split(",")[1] });
          await onRefresh(); setExample(id);
        } catch (e) { setError(String(e)); } finally { setBusy(false); }
      }} /></label>
      {example && <div className="template-example checker"><ImageView id={example} alt="Template example" /></div>}
      <p className="muted">Optional — add an example now or later. It is sent to generation only when explicitly attached as Style.</p>
      </div>
      {!!source?.messages?.length && <details><summary>Review source conversation and references</summary>
        <div className="template-source">{source.messages.map(m => <div key={m.id}>
          <strong>{m.role}</strong><p>{m.templateRequest?.instructions || m.text}</p>
          <div className="message-references">{m.references.map(r => <ImageView key={r} id={r.startsWith("image:") ? r.slice(6) : w.assets.flatMap(a => a.versions).find(v => v.id === r)?.imageId} />)}</div>
        </div>)}</div>
      </details>}
      <div className="form-grid">
      <label>Library<select value={owner} onChange={e => { setOwner(e.target.value); setFolder(generalFolder); }}>
        <option value="">Shared</option>{activeOrganisations(w).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select></label>
      <FolderSelect w={w} owner={owner} value={folder} onChange={setFolder} />
      </div>
      <label>Tags (comma separated)<input placeholder="e.g. portrait, illustration, product" value={tags} onChange={e => setTags(e.target.value)} /></label>
      <label>Usage notes<textarea aria-label="Usage notes" rows={2} placeholder="Optional tips for using this template" value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {management && <div className="button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={() => manage(management.duplicate)}>Duplicate</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => management.transfer(true)}>Copy to…</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => management.transfer(false)}>Move to…</button>
      </div>}
      </div></details>
      {error && <p role="alert" className="error">{error} {template && <button type="button" onClick={async () => { try { await onRefresh(); onClose(); } catch (e) { setError(String(e)); } }}>Close and reload template</button>}</p>}
      </div>
      <div className="modal-footer template-form-footer">{management && <button type="button" className="button danger-text template-trash" disabled={busy} onClick={() => manage(management.trash)}><Trash2 size={14} />Move to Trash</button>}<button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy || !name.trim() || !recipe.trim()}>{busy ? "Saving…" : "Save template"}</button></div>
    </form>
  </Modal>;
}

function FolderSelect({ w, owner, value, onChange, excludeFolderId }: { w: Workspace; owner: string; value: string; onChange: (id: string) => void; excludeFolderId?: string }) {
  return <label>Folder<select aria-label="Folder" required value={value} onChange={e => onChange(e.target.value)}>
    {!value && <option value="" disabled>Choose another folder</option>}
    {excludeFolderId !== generalFolder && <option value={generalFolder}>General</option>}{(w.templateFolders || []).filter(f => (f.organisationId || "") === owner && f.id !== excludeFolderId).sort((a,b) => a.name.localeCompare(b.name)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
  </select></label>;
}

type TemplateNavigation = { scope: string; folder: string; query: string; templateId: string | null };

export function Templates({ w, orgId, act, onRefresh, onSelect, fullPage = false, navigation, onNavigate }: {
  w: Workspace; orgId?: string | null; act: Act;
  onRefresh: () => Promise<void>;
  onSelect?: (t: Template, attachStyle?: boolean) => void;
  fullPage?: boolean;
  navigation?: TemplateNavigation;
  onNavigate?: (next: Partial<TemplateNavigation>) => void;
}) {
  const [localScope, setLocalScope] = useState("owned"), [localQuery, setLocalQuery] = useState("");
  const scope = navigation?.scope ?? localScope, query = navigation?.query ?? localQuery;
  const setScope = (scope: string) => onNavigate ? onNavigate({ scope, folder: "all", templateId: null }) : setLocalScope(scope);
  const setQuery = (query: string) => onNavigate ? onNavigate({ query }) : setLocalQuery(query);
  const owner = scope === "shared" ? null : orgId || null;
  const allLibraries = fullPage && !orgId && scope === "owned";
  const [localFolder, setLocalFolder] = useState("all");
  const folder = navigation?.folder ?? localFolder;
  const setFolder = (folder: string) => onNavigate ? onNavigate({ folder }) : setLocalFolder(folder);
  const [localEditing, setLocalEditing] = useState<Template | "new" | null>(null);
  const editing = navigation ? navigation.templateId ? w.templates?.find(t => t.id === navigation.templateId && !t.deletedAt) || null : localEditing === "new" ? "new" : null : localEditing;
  const setEditing = (template: Template | "new" | null) => {
    if (onNavigate && template !== "new") { setLocalEditing(null); onNavigate({ templateId: template?.id || null }); }
    else setLocalEditing(template);
  };
  const [folderDialog, setFolderDialog] = useState<{ id?: string; name: string } | null>(null);
  const [transfer, setTransfer] = useState<{ template: Template; copy: boolean } | null>(null);
  const [destination, setDestination] = useState(""), [destinationFolder, setDestinationFolder] = useState(generalFolder);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  useEffect(() => {
    if (!navigation) return;
    setLocalEditing(null); setFolderDialog(null); setTransfer(null); setDeletingFolder(null);
  }, [navigation?.scope, navigation?.folder, navigation?.query, navigation?.templateId]);
  const folders = (w.templateFolders || []).filter(f => allLibraries || f.organisationId === owner).sort((a,b) => a.name.localeCompare(b.name));
  const selectedFolder = folders.find(f => f.id === folder);
  const libraryItems = (w.templates || []).filter(t => !t.deletedAt && (allLibraries || t.organisationId === owner));
  const items = libraryItems.filter(t => (folder === "all" || t.folderId === folder)
    && matchesSearch(`${t.name} ${t.recipe}`, t.tags, query)).sort(newestFirst);
  const displayFolders = [{ id: generalFolder, name: "General", organisationId: owner, createdAt: 0, updatedAt: 0 }, ...folders]
    .sort((a,b) => newestFirst(
      folderDates(a, libraryItems.filter(t => t.folderId === a.id)),
      folderDates(b, libraryItems.filter(t => t.folderId === b.id)),
    )).filter(f => fullPage || matchesSearch(f.name, [], query));
  const firstTransferFolder = (ownerId: string, template: Template) => [generalFolder, ...(w.templateFolders || []).filter(f => (f.organisationId || "") === ownerId).map(f => f.id)]
    .find(id => ownerId !== (template.organisationId || "") || id !== template.folderId) || "";
  const folderOwner = (folderId: string, template: Template) => folderId === generalFolder && allLibraries
    ? template.organisationId : displayFolders.find(f => f.id === folderId)?.organisationId ?? null;
  const templateMoves = useLibraryMove("template", (id, folderId) => {
    const template = libraryItems.find(t => t.id === id);
    return fullPage && !busy && !!template && displayFolders.some(f => f.id === folderId)
      && (template.folderId !== folderId || template.organisationId !== folderOwner(folderId, template));
  }, async (id, folderId) => {
    const template = libraryItems.find(t => t.id === id)!;
    setError("");
    await act({ op: "template_transfer", id, copy: false, organisationId: folderOwner(folderId, template), folderId });
  }, setError);
  const actions = <div className="button-row template-library-actions">
    <button className="button secondary" onClick={() => { setError(""); setFolderDialog({ name: "" }); }}><FolderPlus size={16} />Create folder</button>
    <button className="button primary" onClick={() => setEditing("new")}><Plus size={16} />New template</button>
  </div>;
  return <section className="templates-library" aria-label="Templates library">
    {fullPage ? <><PageHeading eyebrow="REUSABLE RECIPES" title="Templates" subtitle="Save a visual recipe. Make it your own." action={actions} />
      <div className="info-strip"><FileImage size={18} /><span><strong>Your recipes, ready to reuse.</strong> Save a name and recipe. Add an example image, tags and usage notes whenever you like.</span></div>
    </> : null}
    <div className="filter-tabs" aria-label="Template library scope">
      {(orgId || fullPage) && <button className={scope === "owned" ? "active" : ""} onClick={() => { setScope("owned"); setFolder("all"); }}>{fullPage ? orgId ? w.organisations.find(o => o.id === orgId)?.name || "Organisation" : "All organisations" : "Organisation"}</button>}
      <button className={scope === "shared" || (!orgId && !fullPage) ? "active" : ""} onClick={() => { setScope("shared"); setFolder("all"); }}>Shared</button>
    </div>
    {fullPage && error && !editing && !transfer && !folderDialog && <p className="form-error" role="alert">{error}</p>}
    <div className="template-toolbar">
      <input aria-label="Search templates" placeholder={!fullPage && folder === "all" ? "Search folders…" : "Search names, tags and recipes…"} value={query} onChange={e => setQuery(e.target.value)} />
      {fullPage && <select aria-label="Filter templates by folder" value={folder} onChange={e => setFolder(e.target.value)}><option value="all">All templates</option><option value={generalFolder}>General</option>{folders.map(f => <option key={f.id} value={f.id}>{allLibraries ? `${w.organisations.find(o => o.id === f.organisationId)?.name || "Shared library"} · ${f.name}` : f.name}</option>)}</select>}
    </div>
    {folder === "all" && <>
      <SectionHeading title="Folders" count={displayFolders.length} />
      <div className={fullPage ? "project-grid" : "library-image-grid"} aria-label="Template folders">
        {displayFolders.map(f => {
          const templates = libraryItems.filter(t => t.folderId === f.id);
          const previews = [...new Set(templates.map(t => t.exampleImageId).filter(Boolean))].slice(0, 3);
          const org = w.organisations.find(o => o.id === f.organisationId);
          return <article {...(fullPage ? templateMoves.target(f.id) : {})} className={`project-card ${fullPage ? templateMoves.target(f.id).className : ""}`} data-template-folder-id={f.id} key={f.id}>
            <button className="project-preview" aria-label={`Open folder ${f.name}`} onClick={() => { if (!fullPage) setQuery(""); setFolder(f.id); }} style={{ background: `${org?.color || "#7654cf"}0e` }}>
              <Folder size={38} style={{ color: org?.color || "#7654cf" }} strokeWidth={1.2} />
              {previews.map((id, i) => <div className="project-paper" key={id} style={{ transform: `rotate(${[0, -9, 9][i]}deg) translateX(${[0, -34, 34][i]}px)`, zIndex: 3 - i }}><ImageView id={id} alt="Template preview" /></div>)}
            </button>
            <div className="card-caption">
              <button className="card-name" onClick={() => { if (!fullPage) setQuery(""); setFolder(f.id); }}><strong>{f.name}</strong><small>{allLibraries && f.id !== generalFolder && <>{org?.name || "Shared library"}<span>·</span></>}{templates.length} {templates.length === 1 ? "template" : "templates"}</small></button>
              {fullPage && f.id !== generalFolder && <button className="icon-button" aria-label={`Edit folder ${f.name}`} onClick={() => { setError(""); setFolderDialog({ id: f.id, name: f.name }); }}><MoreHorizontal size={18} /></button>}
            </div>
          </article>;
        })}
      </div>
      {!displayFolders.length && <Empty icon={<Folder />} title="No matching folders" text="Try another folder name." />}
    </>}
    {(fullPage || folder !== "all") && <SectionHeading title={folder === "all" ? "All templates" : folder === generalFolder ? "General" : folders.find(f => f.id === folder)?.name || "Templates"} count={items.length} action={folder !== "all" && <div className="button-row"><button className="text-button" onClick={() => { if (!fullPage) setQuery(""); setFolder("all"); }}><ArrowLeft size={15} />{fullPage ? "All templates" : "Folders"}</button>{fullPage && folder !== generalFolder && <button className="icon-button" aria-label={`Edit folder ${folders.find(f => f.id === folder)?.name || ""}`} onClick={() => { setError(""); setFolderDialog({ id: folder, name: folders.find(f => f.id === folder)?.name || "" }); }}><MoreHorizontal size={18} /></button>}</div>} />}
    {(fullPage || folder !== "all") && <div className={onSelect ? "library-image-grid" : "asset-grid template-grid"}>{items.map(t => onSelect ? <LibraryImageTile key={t.id} name={t.name} imageId={t.exampleImageId} actions={[
      { label: "Use Template", onSelect: () => onSelect(structuredClone(t)) },
      ...(t.exampleImageId ? [{ label: "Use and Attach as Style", onSelect: () => onSelect(structuredClone(t), true) }] : []),
    ]} /> : <article {...(fullPage ? templateMoves.source(t.id, busy) : {})} className={`asset-card template-card ${fullPage ? templateMoves.source(t.id).className : ""}`} data-template-id={t.id} key={t.id}>
      <button className="asset-preview checker" draggable={fullPage && !busy} aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><ImageView id={t.exampleImageId} alt={t.name} /></button>
      <div className="card-caption">
        <button className="card-name" draggable={fullPage && !busy} onClick={() => setEditing(t)}><strong>{t.name}</strong><small>{allLibraries && `${w.organisations.find(o => o.id === t.organisationId)?.name || "Shared library"} · `}{folders.find(f => f.id === t.folderId)?.name || "General"}</small></button>
        <button className="icon-button" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><MoreHorizontal size={18} /></button>
      </div>
    </article>)}</div>}
    {(fullPage || folder !== "all") && !items.length && <Empty icon={<FileImage />} title={query || folder !== "all" ? "No matching templates" : "A home for your reusable recipes"} text={query || folder !== "all" ? "Try another search or folder to find your template." : "Save a visual recipe to give your next design a head start."} action={fullPage ? <button className="button primary" onClick={() => setEditing("new")}><Plus size={16} />New template</button> : undefined} />}
    {editing && !transfer && <TemplateForm w={w} act={act} orgId={selectedFolder ? selectedFolder.organisationId : owner} initialFolderId={selectedFolder?.id} template={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onRefresh={onRefresh} management={editing === "new" ? undefined : {
      duplicate: async () => { await act({ op: "template_duplicate", id: editing.id }); setEditing(null); },
      transfer: copy => { setDestination(editing.organisationId || ""); setDestinationFolder(firstTransferFolder(editing.organisationId || "", editing)); setError(""); setTransfer({ template: editing, copy }); },
      trash: async () => { await act({ op: "delete", kind: "template", id: editing.id }); setEditing(null); },
    }} />}
    {folderDialog && <Modal title={folderDialog.id ? "Edit folder" : "Create folder"} onClose={() => { if (!busy) setFolderDialog(null); }}>
      <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await act({ op: "template_folder", ...folderDialog, organisationId: folderDialog.id ? folders.find(f => f.id === folderDialog.id)?.organisationId ?? null : owner }); setFolderDialog(null); } catch(e) { setError(String(e)); } finally { setBusy(false); } }}>
        <div className="form-body">
        <label>Folder name<input required value={folderDialog.name} onChange={e => setFolderDialog({ ...folderDialog, name: e.target.value })} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        </div>
        <div className="modal-footer template-form-footer">
          {folderDialog.id && <button type="button" className="button danger-text template-trash" disabled={busy} onClick={() => { setError(""); setDeletingFolder(folderDialog.id!); setFolderDialog(null); }}><Trash2 size={15} />Delete folder</button>}
          <button type="button" className="button secondary" disabled={busy} onClick={() => setFolderDialog(null)}>Cancel</button>
          <button className="button primary" disabled={busy || !folderDialog.name.trim()}>{busy ? "Saving…" : "Save folder"}</button>
        </div>
      </form>
    </Modal>}
    {deletingFolder && <Modal title="Delete folder?" onClose={() => { if (!busy) setDeletingFolder(null); }}>
      <div className="form-body"><p>Templates in this folder will move to General, including items in Trash.</p>{error && <div className="form-error" role="alert">{error}</div>}</div>
      <div className="modal-footer template-form-footer"><button className="button secondary" disabled={busy} onClick={() => setDeletingFolder(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { await act({ op: "template_folder_delete", id: deletingFolder }); if (folder === deletingFolder) setFolder("all"); setDeletingFolder(null); }
        catch(e) { setError(String(e)); } finally { setBusy(false); }
      }}>Delete folder</button></div>
    </Modal>}
    {transfer && <Modal title={transfer.copy ? "Copy template" : "Move template"} onClose={() => { if (!busy) setTransfer(null); }}>
      <form className="template-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await act({ op: "template_transfer", id: transfer.template.id, copy: transfer.copy, organisationId: destination || null, folderId: destinationFolder }); setTransfer(null); setEditing(null); } catch(e) { setError(String(e)); } finally { setBusy(false); } }}>
        <label>Destination library<select value={destination} onChange={e => { setDestination(e.target.value); setDestinationFolder(firstTransferFolder(e.target.value, transfer.template)); }}><option value="">Shared</option>{activeOrganisations(w).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <FolderSelect w={w} owner={destination} value={destinationFolder} onChange={setDestinationFolder} excludeFolderId={destination === (transfer.template.organisationId || "") ? transfer.template.folderId : undefined} />
        {error && <p role="alert">{error}</p>}<button className="button primary" disabled={busy || !destinationFolder}>{transfer.copy ? "Copy template" : "Move template"}</button>
      </form>
    </Modal>}
  </section>;
}
