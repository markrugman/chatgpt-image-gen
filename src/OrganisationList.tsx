import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Organisation } from "./types";
import type { Act } from "./ui";

export function OrganisationList({ organisations, selected, onSelect, act, onTrash, notify }: {
  organisations: Organisation[];
  selected: string;
  onSelect: (id: string) => void;
  act: Act;
  onTrash: (id: string) => void;
  notify: (message: string) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
  }, [editing]);
  useEffect(() => {
    if (!menu) return;
    list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".organisation-menu, .organisation-more")) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);
  async function reorder(id: string, target: string) {
    if (id === target || saving) return;
    const ids = organisations.map(o => o.id);
    const from = ids.indexOf(id), to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1); ids.splice(to, 0, id);
    setSaving(true);
    try { await act({ op: "reorder_organisations", ids }); }
    catch (error) { notify(String(error)); }
    finally { setSaving(false); }
  }
  async function rename(org: Organisation) {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) { notify("Enter an organisation name"); input.current?.focus(); return; }
    if (trimmed === org.name) { setEditing(null); return; }
    setSaving(true);
    try { await act({ op: "rename", kind: "organisation", id: org.id, name: trimmed }); setEditing(null); }
    catch (error) { notify(String(error)); input.current?.focus(); }
    finally { setSaving(false); }
  }
  return <div ref={list} className="organisation-list" onClick={e => e.stopPropagation()}>
    {organisations.map((org, index) => <div key={org.id}
      className={`organisation-row ${over === org.id ? "drag-over" : ""}`}
      onDragOver={e => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(org.id); } }}
      onDrop={e => { e.preventDefault(); if (dragging) void reorder(dragging, org.id); setDragging(null); setOver(null); }}>
      {editing === org.id ? <form className="organisation-rename" onSubmit={e => { e.preventDefault(); void rename(org); }}>
        <input ref={input} aria-label="Organisation name" value={name} disabled={saving}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setEditing(null); } }} />
        <button type="submit" className="button secondary small" disabled={saving}>Save</button>
        <button type="button" className="icon-button" aria-label="Cancel rename" disabled={saving} onClick={() => setEditing(null)}>×</button>
      </form> : <>
        <button className={`org-item ${selected === org.id ? "selected" : ""}`} title={`${org.name} · Drag to reorder, or use Alt+↑/↓`}
          draggable={!saving} onDragStart={e => { e.dataTransfer.setData("text/plain", org.id); e.dataTransfer.effectAllowed = "move"; setDragging(org.id); setMenu(null); }}
          onDragEnd={() => { setDragging(null); setOver(null); }}
          onKeyDown={e => {
            if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault(); const target = organisations[index + (e.key === "ArrowUp" ? -1 : 1)];
              if (target) void reorder(org.id, target.id);
            }
          }} onClick={() => onSelect(org.id)}>
          <span className="org-avatar" style={{ color: org.color, background: `${org.color}16` }}>{org.name.slice(0, 2).toUpperCase()}</span>
          <span>{org.name}</span>
        </button>
        <button className="icon-button organisation-more" aria-label={`Organisation menu for ${org.name}`} aria-haspopup="menu" aria-expanded={menu === org.id}
          onClick={() => setMenu(menu === org.id ? null : org.id)}><MoreHorizontal size={16} /></button>
      </>}
      {menu === org.id && <div className="organisation-menu" role="menu" aria-label={`${org.name} actions`}
        onKeyDown={e => {
          if (e.key === "Escape") { setMenu(null); e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".organisation-more")?.focus(); }
          if (e.key === "Tab") setMenu(null);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[(current + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          }
        }}>
        <button role="menuitem" onClick={() => { setMenu(null); setName(org.name); setEditing(org.id); }}><Pencil size={14} />Rename</button>
        <button role="menuitem" disabled={saving} onClick={async () => {
          setMenu(null); setSaving(true);
          try { await act({ op: "delete", kind: "organisation", id: org.id }); onTrash(org.id); }
          catch (error) { notify(String(error)); }
          finally { setSaving(false); }
        }}><Trash2 size={14} />Trash</button>
      </div>}
    </div>)}
  </div>;
}
