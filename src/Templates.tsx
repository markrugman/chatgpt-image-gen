import { useState } from "react";
import { FileImage, FolderPlus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { api } from "./api";
import { LibraryImageTile } from "./LibraryImages";
import { Empty, ImageView, Modal, PageHeading, type Act } from "./ui";
import { activeOrganisations, matchesSearch, type Message, type Template, type Workspace } from "./types";

export type TemplateSource = { imageId: string; recipe: string; messages?: Message[] };
export const generalFolder = "general";

export function TemplateForm({ w, act, orgId, template, source, onClose, onRefresh, management }: {
  w: Workspace; act: Act; orgId?: string | null; template?: Template; source?: TemplateSource;
  onClose: () => void; onRefresh: () => Promise<void>;
  management?: { duplicate: () => Promise<void>; transfer: (copy: boolean) => void; trash: () => Promise<void> };
}) {
  const [name, setName] = useState(template?.name || "");
  const [recipe, setRecipe] = useState(template?.recipe || source?.recipe || "");
  const [example, setExample] = useState(template?.exampleImageId || source?.imageId || "");
  const [owner, setOwner] = useState(template ? template.organisationId || "" : orgId || "");
  const [folder, setFolder] = useState(template?.folderId || generalFolder);
  const [tags, setTags] = useState(template?.tags.join(", ") || "");
  const [notes, setNotes] = useState(template?.usageNotes || "");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const manage = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  return <Modal title={template ? "Edit template" : "New template"} onClose={() => { if (!busy) onClose(); }} wide>
    <form className="template-editor-form" onSubmit={async e => {
      e.preventDefault(); setError(""); setBusy(true);
      try {
        if (!example) throw Error("Choose an example image");
        await act({ op: "template_save", ...(template ? { id: template.id, version: template.version } : {}),
          name, recipe, exampleImageId: example, organisationId: owner || null, folderId: folder,
          tags: tags.split(",").map(s => s.trim()).filter(Boolean), usageNotes: notes });
        onClose();
      } catch (e) { setError(String(e)); } finally { setBusy(false); }
    }}>
      <div className="form-body">
      <label>Name<input required placeholder="Give your template a name" value={name} onChange={e => setName(e.target.value)} /></label>
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
      <p className="muted">The example is a preview. It is sent to generation only when explicitly attached as Style.</p>
      </div>
      <div className="template-field">
      <label>Recipe<textarea required rows={7} placeholder="Describe the style, composition and instructions to reuse…" value={recipe} onChange={e => setRecipe(e.target.value)} /></label>
      <p className="muted">Make this recipe self-contained. For results refined over several edits, include the earlier instructions too. Source photographs, logos and conversations are not carried forward.</p>
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
      <label>Usage notes<textarea rows={2} placeholder="Optional tips for using this template" value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {management && <div className="button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={() => manage(management.duplicate)}>Duplicate</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => management.transfer(true)}>Copy to…</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => management.transfer(false)}>Move to…</button>
      </div>}
      {error && <p role="alert" className="error">{error} {template && <button type="button" onClick={async () => { try { await onRefresh(); onClose(); } catch (e) { setError(String(e)); } }}>Close and reload template</button>}</p>}
      </div>
      <div className="modal-footer template-form-footer">{management && <button type="button" className="button danger-text template-trash" disabled={busy} onClick={() => manage(management.trash)}><Trash2 size={14} />Move to Trash</button>}<button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy || !name.trim() || !recipe.trim() || !example}>{busy ? "Saving…" : "Save template"}</button></div>
    </form>
  </Modal>;
}

function FolderSelect({ w, owner, value, onChange }: { w: Workspace; owner: string; value: string; onChange: (id: string) => void }) {
  return <label>Folder<select value={value} onChange={e => onChange(e.target.value)}>
    <option value={generalFolder}>General</option>{(w.templateFolders || []).filter(f => (f.organisationId || "") === owner).sort((a,b) => a.name.localeCompare(b.name)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
  </select></label>;
}

export function Templates({ w, orgId, act, run, onRefresh, onSelect, fullPage = false }: {
  w: Workspace; orgId?: string | null; act: Act;
  run: (work: () => Promise<unknown>) => Promise<void>; onRefresh: () => Promise<void>;
  onSelect?: (t: Template, attachStyle?: boolean) => void;
  fullPage?: boolean;
}) {
  const [scope, setScope] = useState("owned"), [query, setQuery] = useState("");
  const owner = scope === "shared" ? null : orgId || null;
  const allLibraries = fullPage && !orgId && scope === "owned";
  const [folder, setFolder] = useState("all");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ id?: string; name: string } | null>(null);
  const [transfer, setTransfer] = useState<{ template: Template; copy: boolean } | null>(null);
  const [destination, setDestination] = useState(""), [destinationFolder, setDestinationFolder] = useState(generalFolder);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const folders = (w.templateFolders || []).filter(f => allLibraries || f.organisationId === owner).sort((a,b) => a.name.localeCompare(b.name));
  const items = (w.templates || []).filter(t => !t.deletedAt && (allLibraries || t.organisationId === owner) && (folder === "all" || t.folderId === folder)
    && matchesSearch(`${t.name} ${t.recipe}`, t.tags, query)).sort((a,b) => a.name.localeCompare(b.name));
  const actions = <div className="button-row template-library-actions">
    <button className="button secondary" onClick={() => { setError(""); setFolderDialog({ name: "" }); }}><FolderPlus size={16} />Create folder</button>
    <button className="button primary" onClick={() => setEditing("new")}><Plus size={16} />New template</button>
  </div>;
  return <section className="templates-library" aria-label="Templates library">
    {fullPage ? <><PageHeading eyebrow="REUSABLE RECIPES" title="Templates" subtitle="Save a visual recipe. Make it your own." action={actions} />
      <div className="info-strip"><FileImage size={18} /><span><strong>Your recipes, ready to reuse.</strong> Save instructions and an example image, then make them your own in a new design.</span></div>
    </> : null}
    <div className="filter-tabs" aria-label="Template library scope">
      {(orgId || fullPage) && <button className={scope === "owned" ? "active" : ""} onClick={() => { setScope("owned"); setFolder("all"); }}>{fullPage ? orgId ? w.organisations.find(o => o.id === orgId)?.name || "Organisation" : "All organisations" : "Organisation"}</button>}
      <button className={scope === "shared" || (!orgId && !fullPage) ? "active" : ""} onClick={() => { setScope("shared"); setFolder("all"); }}>Shared</button>
    </div>
    <div className="template-toolbar">
      <input aria-label="Search templates" placeholder="Search names, tags and recipes…" value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Filter templates by folder" value={folder} onChange={e => setFolder(e.target.value)}><option value="all">All templates</option><option value={generalFolder}>General</option>{folders.map(f => <option key={f.id} value={f.id}>{allLibraries ? `${w.organisations.find(o => o.id === f.organisationId)?.name || "Shared library"} · ${f.name}` : f.name}</option>)}</select>
      {folder !== "all" && folder !== generalFolder && <><button className="text-button" onClick={() => { setError(""); setFolderDialog({ id: folder, name: folders.find(f => f.id === folder)?.name || "" }); }}>Rename folder</button><button className="text-button" onClick={() => setDeletingFolder(true)}>Delete folder</button></>}
    </div>
    <div className={onSelect ? "library-image-grid" : "asset-grid template-grid"}>{items.map(t => onSelect ? <LibraryImageTile key={t.id} name={t.name} imageId={t.exampleImageId} actions={[
      { label: "Use Template", onSelect: () => onSelect(structuredClone(t)) },
      { label: "Use and Attach as Style", onSelect: () => onSelect(structuredClone(t), true) },
    ]} /> : <article className="asset-card template-card" key={t.id}>
      <button className="asset-preview checker" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><ImageView id={t.exampleImageId} alt={t.name} /></button>
      <div className="card-caption">
        <button className="card-name" onClick={() => setEditing(t)}><strong>{t.name}</strong><small>{allLibraries && `${w.organisations.find(o => o.id === t.organisationId)?.name || "Shared library"} · `}{folders.find(f => f.id === t.folderId)?.name || "General"}</small></button>
        <button className="icon-button" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><MoreHorizontal size={18} /></button>
      </div>
    </article>)}</div>
    {!items.length && <Empty icon={<FileImage />} title={query || folder !== "all" ? "No matching templates" : "A home for your reusable recipes"} text={query || folder !== "all" ? "Try another search or folder to find your template." : "Save a visual recipe to give your next design a head start."} action={<button className="button primary" onClick={() => setEditing("new")}><Plus size={16} />New template</button>} />}
    {editing && <TemplateForm w={w} act={act} orgId={owner} template={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onRefresh={onRefresh} management={editing === "new" ? undefined : {
      duplicate: async () => { await act({ op: "template_duplicate", id: editing.id }); setEditing(null); },
      transfer: copy => { setDestination(""); setDestinationFolder(generalFolder); setError(""); setTransfer({ template: editing, copy }); setEditing(null); },
      trash: async () => { await act({ op: "delete", kind: "template", id: editing.id }); setEditing(null); },
    }} />}
    {folderDialog && <Modal title={folderDialog.id ? "Rename folder" : "Create folder"} onClose={() => { if (!busy) setFolderDialog(null); }}>
      <form className="template-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await act({ op: "template_folder", ...folderDialog, organisationId: folderDialog.id ? folders.find(f => f.id === folderDialog.id)?.organisationId ?? null : owner }); setFolderDialog(null); } catch(e) { setError(String(e)); } finally { setBusy(false); } }}>
        <label>Folder name<input required value={folderDialog.name} onChange={e => setFolderDialog({ ...folderDialog, name: e.target.value })} /></label>
        {error && <p role="alert">{error}</p>}<button className="button primary" disabled={busy || !folderDialog.name.trim()}>Save folder</button>
      </form>
    </Modal>}
    {deletingFolder && <Modal title="Delete folder?" onClose={() => setDeletingFolder(false)}><p>Templates in this folder will move to General, including items in Trash.</p><button className="button primary" onClick={() => run(async () => { await act({ op: "template_folder_delete", id: folder }); setFolder("all"); setDeletingFolder(false); })}>Delete folder</button></Modal>}
    {transfer && <Modal title={transfer.copy ? "Copy template" : "Move template"} onClose={() => { if (!busy) setTransfer(null); }}>
      <form className="template-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await act({ op: "template_transfer", id: transfer.template.id, copy: transfer.copy, organisationId: destination || null, folderId: destinationFolder }); setTransfer(null); } catch(e) { setError(String(e)); } finally { setBusy(false); } }}>
        <label>Destination library<select value={destination} onChange={e => { setDestination(e.target.value); setDestinationFolder(generalFolder); }}><option value="">Shared</option>{activeOrganisations(w).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <FolderSelect w={w} owner={destination} value={destinationFolder} onChange={setDestinationFolder} />
        {error && <p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{transfer.copy ? "Copy template" : "Move template"}</button>
      </form>
    </Modal>}
  </section>;
}
