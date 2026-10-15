import { useEffect, useRef, useState } from "react";
import { ImageView } from "./ui";
import {
  libraryKind,
  versionImage,
  type Asset,
  type LibraryKind,
  type Workspace,
} from "./types";

export function LibraryImages({
  w,
  orgId,
  kind,
  search = "",
  onReference,
  onPlace,
}: {
  w: Workspace;
  orgId?: string | null;
  kind: LibraryKind;
  search?: string;
  onReference: (id: string) => void;
  onPlace?: (asset: Asset) => void;
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
      {items.map((a) => (
        <LibraryImage
          key={a.id}
          asset={a}
          w={w}
          onReference={onReference}
          onPlace={onPlace}
        />
      ))}
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
  onReference: (id: string) => void;
  onPlace?: (asset: Asset) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="mini-asset library-image"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
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
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="library-image-trigger"
        aria-label={`Use ${asset.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="mini-asset-preview checker">
          <ImageView id={versionImage(w, asset.currentVersionId!)} />
        </span>
        <strong>{asset.name}</strong>
      </button>
      {open && (
        <div
          className="library-image-menu"
          role="menu"
          aria-label={`Use ${asset.name}`}
        >
          <button
            role="menuitem"
            onClick={() => {
              close();
              onReference(asset.currentVersionId!);
            }}
          >
            Reference
          </button>
          {onPlace && (
            <button
              role="menuitem"
              onClick={() => {
                close();
                onPlace(asset);
              }}
            >
              Place
            </button>
          )}
        </div>
      )}
    </div>
  );
}
