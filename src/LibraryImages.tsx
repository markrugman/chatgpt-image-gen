import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageView } from "./ui";
import { libraryImageDrag, libraryImageDragType } from "./overlayOperations";
import {
  libraryKind,
  versionImage,
  type Asset,
  type LibraryKind,
  type ReferencePurpose,
  type Workspace,
} from "./types";

export function LibraryImages({
  w,
  orgId,
  kind,
  search = "",
  onReference,
  onPlace,
  uploadCard,
}: {
  w: Workspace;
  orgId?: string | null;
  kind: LibraryKind;
  search?: string;
  onReference: (id: string, purpose?: ReferencePurpose["purpose"]) => void;
  onPlace?: (asset: Asset) => void;
  uploadCard?: React.ReactNode;
}) {
  const [scope, setScope] = useState("owned");
  const items = w.assets.filter(
    (a) =>
      !a.deletedAt &&
      a.currentVersionId &&
      libraryKind(a) === kind &&
      (scope === "shared"
        ? !a.organisationId
        : orgId
          ? a.organisationId === orgId
          : !a.organisationId) &&
      `${a.name} ${a.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      {orgId && (
        <div className="filter-tabs library-scope" aria-label="Library scope">
          <button
            className={scope === "owned" ? "active" : ""}
            onClick={() => setScope("owned")}
          >
            Organisation
          </button>
          <button
            className={scope === "shared" ? "active" : ""}
            onClick={() => setScope("shared")}
          >
            Shared
          </button>
        </div>
      )}
      {!orgId && <div className="panel-heading">SHARED</div>}
      <div className="library-image-grid">{uploadCard}{items.map((a) => (
        <LibraryImage
          key={a.id}
          asset={a}
          w={w}
          onReference={onReference}
          onPlace={onPlace}
        />
      ))}</div>
      {!items.length && (
        <p className="muted">
          No {kind === "upload" ? "uploads" : "assets"} here yet.
        </p>
      )}
    </>
  );
}

function LibraryImage({
  asset,
  w,
  onReference,
  onPlace,
}: {
  asset: Asset;
  w: Workspace;
  onReference: (id: string, purpose?: ReferencePurpose["purpose"]) => void;
  onPlace?: (asset: Asset) => void;
}) {
  return <LibraryImageTile name={asset.name} imageId={versionImage(w, asset.currentVersionId!)} dragVersionId={onPlace ? asset.currentVersionId : undefined} actions={[
    { label: "Add as…", items: (["Style", "Subject", "Logo", "Other"] as const).map(purpose => ({ label: purpose, onSelect: () => onReference(asset.currentVersionId!, purpose) })) },
    ...(onPlace ? [{ label: "Place", onSelect: () => onPlace(asset) }] : []),
  ]} />;
}

type LibraryAction = { label: string; onSelect: () => void } | { label: string; items: { label: string; onSelect: () => void }[] };

export function LibraryImageTile({ name, imageId, actions, dragVersionId }: {
  name: string; imageId?: string | null;
  actions: LibraryAction[];
  dragVersionId?: string | null;
}) {
  const pointerType = useRef("mouse"), dragged = useRef(false);
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Extract<LibraryAction, { items: unknown }> | null>(null);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) { setOpen(false); setSubmenu(null); }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, submenu]);
  const close = () => {
    setOpen(false);
    setSubmenu(null);
    trigger.current?.focus();
  };
  return (
    <div
      className="mini-asset library-image"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          if (submenu) setSubmenu(null); else close();
        }
        if (e.key === "ArrowLeft" && submenu) {
          e.preventDefault(); setSubmenu(null);
        }
        if (e.key === "ArrowRight" && open && !submenu) {
          const index = Array.from(root.current!.querySelectorAll('[role="menuitem"]')).indexOf(document.activeElement!);
          const action = actions[index];
          if (action && "items" in action) { e.preventDefault(); setSubmenu(action); }
        }
        if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const buttons = Array.from(
            root.current!.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]',
            ),
          );
          const current = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (current + (e.key === "ArrowUp" ? -1 : 1) + buttons.length) %
                  buttons.length
          ]?.focus();
        }
      }}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setSubmenu(null); }
      }}
    >
      <button
        ref={trigger}
        className="library-image-trigger"
        aria-label={`Use ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        draggable={!!dragVersionId}
        onPointerDown={e => { pointerType.current = e.pointerType; dragged.current = false; }}
        onDragStart={e => {
          if (!dragVersionId || pointerType.current === "touch") { e.preventDefault(); return; }
          e.dataTransfer.setData(libraryImageDragType, dragVersionId);
          e.dataTransfer.setData("text/plain", name);
          e.dataTransfer.effectAllowed = "copy";
          libraryImageDrag.versionId = dragVersionId;
          dragged.current = true;
          setOpen(false); setSubmenu(null);
        }}
        onDragEnd={() => { libraryImageDrag.versionId = null; setTimeout(() => { dragged.current = false; }, 0); }}
        onClick={e => { if (dragged.current && e.detail !== 0) { dragged.current = false; return; } setSubmenu(null); setOpen(!open); }}
      >
        <span className="mini-asset-preview checker">
          <ImageView id={imageId} alt={name} />
        </span>
        <strong>{name}</strong>
      </button>
      {open && (
        <div
          className="library-image-menu"
          role="menu"
          aria-label={submenu ? `Add ${name} as` : `Use ${name}`}
        >
          {submenu && <button className="library-menu-back" role="menuitem" onClick={() => setSubmenu(null)}><ChevronLeft size={14} />Back</button>}
          {(submenu?.items || actions).map(action => <button
            key={action.label}
            role="menuitem"
            aria-haspopup={"items" in action ? "menu" : undefined}
            onClick={() => {
              if ("items" in action) setSubmenu(action);
              else { close(); action.onSelect(); }
            }}
          >
            {action.label}{"items" in action && <ChevronRight size={14} />}
          </button>)}
        </div>
      )}
    </div>
  );
}
