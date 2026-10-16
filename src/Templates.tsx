import { useState } from "react";
import { api } from "./api";
import { ImageView, Modal, type Act } from "./ui";
import { activeOrganisations, matchesSearch, type Message, type Template, type Workspace } from "./types";

export type TemplateSource = { imageId: string; recipe: string; messages?: Message[] };
export const generalFolder = "general";

export function TemplateForm({ w, act, orgId, template, source, onClose, onRefresh }: {
  w: Workspace; act: Act; orgId?: string | null; template?: Template; source?: TemplateSource;
  onClose: () => void; onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState(template?.name || "");
  const [recipe, setRecipe] = useState(template?.recipe || source?.recipe || "");
  const [example, setExample] = useState(template?.exampleImageId || source?.imageId || "");
  const [owner, setOwner] = useState(template ? template.organisationId || "" : orgId || "");
  const [folder, setFolder] = useState(template?.folderId || generalFolder);
  const [tags, setTags] = useState(template?.tags.join(", ") || "");
  const [notes, setNotes] = useState(template?.usageNotes || "");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <Modal title={template ? "Edit template" : "New template"} onClose={() => { if (!busy) onClose(); }} wide>
    <form className="template-form" onSubmit={async e => {
      e.preventDefault(); setError(""); setBusy(true);
      try {
        if (!example) throw Error("Choose an example image");
        await act({ op: "template_save", ...(template ? { id: template.id, version: template.version } : {}),
          name, recipe, exampleImageId: example, organisationId: owner || null, folderId: folder,
          tags: tags.split(",").map(s => s.trim()).filter(Boolean), usageNotes: notes });
        onClose();
      } catch (e) { setError(String(e)); } finally { setBusy(false); }
    }}>
      <label>Name<input required value={name} onChange={e => setName(e.target.value)} /></label>
      {example && <div className="template-example"><ImageView id={example} alt="Template example" /></div>}
      <label>Example image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => {
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
      <p className="muted">The example is a preview. It is sent to generation only when explicitly attached as Style.</p>
      <label>Recipe<textarea required rows={7} value={recipe} onChange={e => setRecipe(e.target.value)} /></label>
      <p className="muted">Make this recipe self-contained. For results refined over several edits, include the earlier instructions too. Source photographs, logos and conversations are not carried forward.</p>
      {!!source?.messages?.length && <details><summary>Review source conversation and references</summary>
        <div className="template-source">{source.messages.map(m => <div key={m.id}>
          <strong>{m.role}</strong><p>{m.templateRequest?.instructions || m.text}</p>
          <div className="message-references">{m.references.map(r => <ImageView key={r} id={r.startsWith("image:") ? r.slice(6) : w.assets.flatMap(a => a.versions).find(v => v.id === r)?.imageId} />)}</div>
        </div>)}</div>
      </details>}
      <label>Library<select value={owner} onChange={e => { setOwner(e.target.value); setFolder(generalFolder); }}>
        <option value="">Shared</option>{activeOrganisations(w).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select></label>
      <FolderSelect w={w} owner={owner} value={folder} onChange={setFolder} />
      <label>Tags (comma separated)<input value={tags} onChange={e => setTags(e.target.value)} /></label>
      <label>Usage notes<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      {error && <p role="alert" className="error">{error} {template && <button type="button" onClick={async () => { try { await onRefresh(); onClose(); } catch (e) { setError(String(e)); } }}>Close and reload template</button>}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy || !name.trim() || !recipe.trim() || !example}>{busy ? "Saving…" : "Save template"}</button></div>
    </form>
  </Modal>;
}

function FolderSelect({ w, owner, value, onChange }: { w: Workspace; owner: string; value: string; onChange: (id: string) => void }) {
  return <label>Folder<select value={value} onChange={e => onChange(e.target.value)}>
    <option value={generalFolder}>General</option>{(w.templateFolders || []).filter(f => (f.organisationId || "") === owner).sort((a,b) => a.name.localeCompare(b.name)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
  </select></label>;
}

export function Templates({ w, orgId, act, run, onRefresh, onSelect }: {
  w: Workspace; orgId?: string | null; act: Act;
  run: (work: () => Promise<unknown>) => Promise<void>; onRefresh: () => Promise<void>;
  onSelect?: (t: Template) => void;
}) {
  const [scope, setScope] = useState("owned"), [query, setQuery] = useState("");
  const owner = scope === "shared" ? null : orgId || null;
  const [folder, setFolder] = useState("all");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ id?: string; name: string } | null>(null);
  const [transfer, setTransfer] = useState<{ template: Template; copy: boolean } | null>(null);
  const [destination, setDestination] = useState(""), [destinationFolder, setDestinationFolder] = useState(generalFolder);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const folders = (w.templateFolders || []).filter(f => f.organisationId === owner).sort((a,b) => a.name.localeCompare(b.name));
  const items = (w.templates || []).filter(t => !t.deletedAt && t.organisationId === owner && (folder === "all" || t.folderId === folder)
    && matchesSearch(`${t.name} ${t.recipe}`, t.tags, query)).sort((a,b) => a.name.localeCompare(b.name));
  return <section className="templates-library" aria-label="Templates library">
    {orgId && <div className="filter-tabs"><button className={scope === "owned" ? "active" : ""} onClick={() => { setScope("owned"); setFolder("all"); }}>Organisation</button><button className={scope === "shared" ? "active" : ""} onClick={() => { setScope("shared"); setFolder("all"); }}>Shared</button></div>}
    {!orgId && <p className="muted">Shared templates</p>}
    <div className="template-toolbar">
      <input aria-label="Search templates" placeholder="Search names, tags and recipes…" value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Filter templates by folder" value={folder} onChange={e => setFolder(e.target.value)}><option value="all">All templates</option><option value={generalFolder}>General</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <button className="button primary small" onClick={() => setEditing("new")}>New template</button>
      <button className="button secondary small" onClick={() => { setError(""); setFolderDialog({ name: "" }); }}>Create folder</button>
      {folder !== "all" && folder !== generalFolder && <><button className="text-button" onClick={() => { setError(""); setFolderDialog({ id: folder, name: folders.find(f => f.id === folder)?.name || "" }); }}>Rename folder</button><button className="text-button" onClick={() => setDeletingFolder(true)}>Delete folder</button></>}
    </div>
    <div className="template-grid">{items.map(t => <article className="template-card" key={t.id}>
      <div className="template-example"><ImageView id={t.exampleImageId} alt={t.name} /></div><strong>{t.name}</strong>
      <small>{folders.find(f => f.id === t.folderId)?.name || "General"}{t.tags.length ? ` · ${t.tags.join(", ")}` : ""}</small>
      <p>{t.usageNotes}</p><div className="template-actions">
        {onSelect && <button className="button primary small" onClick={() => onSelect(structuredClone(t))}>Use template</button>}
        <button className="text-button" onClick={() => setEditing(t)}>Edit</button>
        <button className="text-button" onClick={() => run(() => act({ op: "template_duplicate", id: t.id }))}>Duplicate</button>
        <button className="text-button" onClick={() => { setDestination(""); setDestinationFolder(generalFolder); setError(""); setTransfer({ template: t, copy: true }); }}>Copy to…</button>
        <button className="text-button" onClick={() => { setDestination(""); setDestinationFolder(generalFolder); setError(""); setTransfer({ template: t, copy: false }); }}>Move to…</button>
        <button className="text-button" onClick={() => run(() => act({ op: "delete", kind: "template", id: t.id }))}>Trash</button>
      </div>
    </article>)}</div>
    {!items.length && <p className="muted">No templates here. Create a template or adjust your search.</p>}
    {editing && <TemplateForm w={w} act={act} orgId={owner} template={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onRefresh={onRefresh} />}
    {folderDialog && <Modal title={folderDialog.id ? "Rename folder" : "Create folder"} onClose={() => { if (!busy) setFolderDialog(null); }}>
      <form className="template-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await act({ op: "template_folder", ...folderDialog, organisationId: owner }); setFolderDialog(null); } catch(e) { setError(String(e)); } finally { setBusy(false); } }}>
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
