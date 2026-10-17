import { useEffect, useRef, useState, type RefObject, type ClipboardEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { api, copyText, importImageFile } from "./api";
import { versionImage, type Overlay, type Workspace } from "./types";
import { copyPlacement, fitPlacement, overlayId, reorderOverlay, type OverlayClipboard } from "./overlayOperations";

export function useCanvasCommands({ w, overlays, setOverlays, selected, setSelected, canvas, focus, clipboard, width, height, organisationId, save, refresh, history, canUndo, canRedo, generationBusy, notify }: {
  w: Workspace; overlays: Overlay[]; setOverlays: (next: Overlay[]) => void; selected: string | null; setSelected: (id: string | null) => void;
  canvas: RefObject<HTMLDivElement | null>; focus: RefObject<HTMLDivElement | null>; clipboard: RefObject<OverlayClipboard | null>;
  width: number; height: number; organisationId: string | null; save: (next: Overlay[]) => Promise<void>; refresh: () => Promise<void>;
  history: (direction: "undo" | "redo") => Promise<void>; canUndo: boolean; canRedo: boolean; generationBusy: boolean; notify: (text: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; point: { x: number; y: number }; id: string | null } | null>(null);
  const [submenu, setSubmenu] = useState(false), [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null), current = useRef(overlays), nudge = useRef(false), importing = useRef(false);
  current.current = overlays;
  const object = overlays.find(o => o.id === selected);
  const blocked = busy || generationBusy;
  const editable = !blocked && !!object && !object.locked;
  const update = (next: Overlay[]) => { current.current = next; setOverlays(next); };
  const commit = async (next: Overlay[]) => {
    if (next === current.current) return;
    update(next);
    await save(next);
  };
  const fail = (error: unknown) => notify(error instanceof Error ? error.message : String(error));
  const finishNudge = () => {
    if (!nudge.current) return;
    nudge.current = false;
    void save(current.current).catch(fail);
  };
  const close = () => { setMenu(null); setSubmenu(false); focus.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) { setMenu(null); setSubmenu(false); } };
    const dismiss = () => { setMenu(null); setSubmenu(false); };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [menu]);
  useEffect(() => {
    if (submenu) menuRef.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not(:disabled)')?.focus();
  }, [submenu]);

  function capture() {
    if (!object) return null;
    return { token: `imagegen-overlay:${overlayId()}`, overlay: { ...object }, width, height };
  }
  function onCopy(e: ClipboardEvent, cut = false) {
    if (blocked || !object || (cut && object.locked)) return;
    const copy = capture()!;
    e.preventDefault();
    e.clipboardData.setData("text/plain", copy.token);
    clipboard.current = copy;
    if (cut) { setSelected(null); void commit(current.current.filter(o => o.id !== object.id)).catch(fail); }
  }
  async function copy(cut = false) {
    const copy = capture();
    if (!copy || blocked || (cut && object?.locked)) return;
    await copyText(copy.token);
    clipboard.current = copy;
    if (cut) { setSelected(null); await commit(current.current.filter(o => o.id !== copy.overlay.id)); }
  }
  async function paste(files: File[], token: string, point?: { x: number; y: number }) {
    if (importing.current || generationBusy) return;
    finishNudge();
    const copy = clipboard.current;
    if (!files.length) {
      if (!copy || copy.token !== token) return;
      if (!versionImage(w, copy.overlay.assetVersionId)) { notify("The copied image is no longer available in this workspace."); return; }
      const placed = copyPlacement(copy, width, height, point);
      setSelected(placed.id);
      await commit([...current.current, placed]);
      return;
    }
    importing.current = true; setBusy(true);
    const placed: Overlay[] = [], failures: string[] = [];
    try {
      for (const file of files) {
        try {
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw Error("Paste a PNG, JPEG or WebP image.");
          const id = await importImageFile(file, organisationId);
          const next = await api<Workspace>("get_workspace"), asset = next.assets.find(a => a.id === id);
          const version = asset?.currentVersionId, image = next.images.find(i => i.id === (version && versionImage(next, version)));
          if (!version || !image) throw Error("Image saved to Uploads but could not be placed.");
          const pixelWidth = Math.min(width * .25, height * image.width / image.height);
          const ow = 100 * pixelWidth / width, oh = 100 * pixelWidth * image.height / image.width / height;
          placed.push(fitPlacement({ id: overlayId(), assetVersionId: version, x: (point?.x ?? (100 - ow) / 2) + placed.length * 1000 / width, y: (point?.y ?? (100 - oh) / 2) + placed.length * 1000 / height, width: ow, height: oh, rotation: 0 }));
        } catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`); }
      }
      if (placed.length) {
        setSelected(placed[placed.length - 1].id);
        await commit([...current.current, ...placed]);
      }
      await refresh();
      notify(`${placed.length} image${placed.length === 1 ? "" : "s"} pasted${failures.length ? `. ${failures.join("; ")}` : ""}`);
    } finally { importing.current = false; setBusy(false); }
  }
  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData.files).filter(f => f.type.startsWith("image/"));
    const token = e.clipboardData.getData("text/plain");
    if (!files.length && (!clipboard.current || clipboard.current.token !== token)) return;
    e.preventDefault();
    void paste(files, token).catch(fail);
  }
  async function menuPaste() {
    if (!navigator.clipboard?.read) { notify("Press Ctrl+V (⌘V on Mac) to paste"); return; }
    const files: File[] = [];
    let token = "";
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (type) files.push(new File([await item.getType(type)], `Clipboard-${files.length + 1}.${type.split("/")[1]}`, { type }));
        else if (item.types.includes("text/plain")) token = await (await item.getType("text/plain")).text();
      }
    } catch { notify("Press Ctrl+V (⌘V on Mac) to paste"); return; }
    await paste(files, token, menu?.point);
  }
  async function action(id: string) {
    finishNudge();
    try {
      if (id === "paste") await menuPaste();
      else if (id === "undo" || id === "redo") { setSelected(null); await history(id); }
      else if (id === "copy" || id === "cut") await copy(id === "cut");
      else if (object && !blocked) {
        if (id === "duplicate") {
          const placed = copyPlacement({ token: "", overlay: object, width, height }, width, height);
          setSelected(placed.id); await commit([...current.current, placed]);
        } else if (id === "lock") await commit(current.current.map(o => o.id === object.id ? { ...o, locked: !o.locked } : o));
        else if (!object.locked && id === "delete") { setSelected(null); await commit(current.current.filter(o => o.id !== object.id)); }
        else if (!object.locked && ["top", "up", "down", "bottom"].includes(id)) await commit(reorderOverlay(current.current, object.id, id as "top" | "up" | "down" | "bottom"));
      }
    } catch (error) { fail(error); }
    finally { close(); }
  }
  function onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase(), modifier = e.ctrlKey || e.metaKey;
    if (key === "escape") { e.preventDefault(); if (menu) close(); else setSelected(null); return; }
    if (modifier && key === "v") return; // The paste event supplies the current OS clipboard, including images.
    if (modifier && ["c", "x"].includes(key)) return; // Native copy/cut events allow clipboard access on LAN HTTP too.
    if (modifier && ["z", "y", "d"].includes(key)) {
      e.preventDefault();
      if (blocked) return;
      if (key === "d" && object) void action("duplicate");
      else if ((key === "y" || e.shiftKey) && canRedo) void action("redo");
      else if (key === "z" && !e.shiftKey && canUndo) void action("undo");
      return;
    }
    if (["delete", "backspace"].includes(key)) { e.preventDefault(); if (editable) void action("delete"); return; }
    if (key.startsWith("arrow") && !modifier && editable) {
      e.preventDefault();
      const distance = e.shiftKey ? 10 : 1;
      nudge.current = true;
      update(current.current.map(o => o.id !== selected ? o : { ...o, x: o.x + (key === "arrowleft" ? -distance : key === "arrowright" ? distance : 0) * 100 / width, y: o.y + (key === "arrowup" ? -distance : key === "arrowdown" ? distance : 0) * 100 / height }));
    }
  }
  const index = overlays.findIndex(o => o.id === selected);
  const mod = /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl+";
  const item = (id: string, label: string, shortcut = "", disabled = false) => <button role="menuitem" aria-label={label} key={id} disabled={disabled} onClick={() => void action(id)}>{label}<span>{shortcut}</span></button>;
  const ui = menu && createPortal(<div ref={menuRef} className="canvas-context-menu" role="menu" aria-label="Canvas actions" style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 238)), top: Math.max(8, Math.min(menu.y, window.innerHeight - (menu.id ? 380 : 140))) }}
    onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (submenu) { setSubmenu(false); menuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus(); } else close(); }
      else if (e.key === "ArrowLeft" && submenu) { e.preventDefault(); setSubmenu(false); menuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus(); }
      else if (e.key === "ArrowRight" && (e.target as HTMLElement).getAttribute("aria-haspopup") === "menu") { e.preventDefault(); setSubmenu(true); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        e.preventDefault(); const parent = (e.target as HTMLElement).closest('[role="menu"]')!;
        const buttons = Array.from(parent.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled), :scope > .canvas-layer-menu > button:not(:disabled)'));
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (at + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      } else if (e.key === "Tab") close();
    }}>
    {item("undo", "Undo", mod + "Z", blocked || !canUndo)}
    {item("redo", "Redo", mod + "Shift+Z", blocked || !canRedo)}
    {menu.id && <>
      <hr />{item("cut", "Cut", mod + "X", !editable)}{item("copy", "Copy", mod + "C", blocked || !object)}
    </>}
    {item("paste", "Paste", mod + "V", blocked)}
    {menu.id && <>
      {item("duplicate", "Duplicate", mod + "D", blocked || !object)}
      {item("delete", "Delete", "Del", !editable)}<hr />
      <div className="canvas-layer-menu" onMouseEnter={() => { if (editable) setSubmenu(true); }} onMouseLeave={() => setSubmenu(false)}>
        <button role="menuitem" aria-haspopup="menu" aria-expanded={submenu} disabled={!editable} onClick={() => setSubmenu(!submenu)}>Layer<ChevronRight size={15} /></button>
        {submenu && <div role="menu" aria-label="Layer" className={menu.x > window.innerWidth - 460 ? "opens-left" : ""}>
          {item("top", "Move to top", "", index === overlays.length - 1)}{item("up", "Move up", "", index === overlays.length - 1)}
          {item("down", "Move down", "", index <= 0)}{item("bottom", "Move to bottom", "", index <= 0)}
        </div>}
      </div>
      {item("lock", object?.locked ? "Unlock" : "Lock", "", blocked || !object)}
    </>}
  </div>, document.body);
  return { busy, ui, isNudging: () => nudge.current, undo: () => action("undo"), redo: () => action("redo"), handlers: {
    onKeyDown,
    onKeyUp: (e: KeyboardEvent) => { if (e.key.startsWith("Arrow")) finishNudge(); },
    onBlur: () => finishNudge(),
    onCopy: (e: ClipboardEvent) => onCopy(e), onCut: (e: ClipboardEvent) => onCopy(e, true), onPaste,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault(); finishNudge();
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-overlay-id]')?.dataset.overlayId || null;
      setSelected(id); setSubmenu(false);
      const rect = canvas.current?.getBoundingClientRect();
      setMenu({ x: e.clientX, y: e.clientY, id, point: { x: rect ? 100 * (e.clientX - rect.left) / rect.width : 0, y: rect ? 100 * (e.clientY - rect.top) / rect.height : 0 } });
    },
  } };
}

