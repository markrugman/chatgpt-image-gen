import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileImage,
  History,
  ImagePlus,
  Images,
  Upload,
  Layers,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Redo2,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { api, importImageFile } from "./api";
import {
  activeJob,
  currentComposition,
  libraryKind,
  printDpi,
  referenceImage,
  versionImage,
  type Asset,
  type DesignDocument,
  type Job,
  type Overlay,
  type Page,
  type Target,
  type Workspace,
} from "./types";
import { ImageView, Modal, useCompactLayout, type Act } from "./ui";
import { LibraryImages } from "./LibraryImages";
import { AssetJsonDialog } from "./AssetJsonDialog";
import { ExtractAssetDialog } from "./ExtractAssetDialog";
import { renderPage } from "./export";
import { ExportDialog } from "./ExportDialog";

export function Editor({
  w,
  doc,
  asset,
  pageId,
  libraryRequest,
  jobs,
  act,
  run,
  notify,
  onPage,
  onBack,
  onEdit,
  onNew,
  onRefresh,
  onOpenAsset,
}: {
  w: Workspace;
  doc?: DesignDocument;
  asset?: Asset;
  pageId: string | null;
  libraryRequest?: {kind: "assets" | "uploads"} | null;
  jobs: Job[];
  act: Act;
  run: (work: () => Promise<unknown>) => Promise<void>;
  notify: (s: string) => void;
  onPage: (id: string) => void;
  onBack: () => void;
  onEdit: () => void;
  onNew: (imageId: string) => void;
  onRefresh: () => Promise<void>;
  onOpenAsset: (id: string) => void;
}) {
  const compact = useCompactLayout();
  const [mobilePanel, setMobilePanel] = useState("canvas");
  const page = doc
    ? doc.pages.find((p) => p.id === pageId) || doc.pages[0]
    : asset!.page;
  const target: Target = {
    kind: doc ? "document" : "asset",
    id: doc?.id || asset!.id,
    pageId: page.id,
  };
  const comp = currentComposition(page),
    image = w.images.find((i) => i.id === comp.imageId),
    orgId = doc
      ? w.projects.find((p) => p.id === doc.projectId)?.organisationId
      : asset?.organisationId;
  const project = w.projects.find((p) => p.id === doc?.projectId);
  const [panel, setPanel] = useState("pages"),
    [mode, setMode] = useState(
      () => page.messages[page.messages.length - 1]?.mode || "generate",
    ),
    [prompt, setPrompt] = useState(
      () => localStorage.getItem(`draft:${page.id}`) || "",
    );
  useEffect(() => { if (libraryRequest) { setPanel(libraryRequest.kind); if (compact) setMobilePanel("tools"); } }, [libraryRequest, compact]);
  const [references, setReferences] = useState<string[]>([]),
    [picker, setPicker] = useState<"asset" | "upload" | null>(null),
    [zoom, setZoom] = useState(100),
    [selected, setSelected] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>(comp.overlays),
    [showExport, setShowExport] = useState(false);
  const [autoFit, setAutoFit] = useState(true);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [extracting, setExtracting] = useState(false);
  const [showAssetJson, setShowAssetJson] = useState(false);
  const previewBackgrounds = [
    { name: "Checkerboard", color: "checker" },
    { name: "White", color: "#ffffff" },
    { name: "Black", color: "#111111" },
    { name: "Bright pink", color: "#ff00b8" },
  ];
  const [previewBackground, setPreviewBackground] = useState(
    () => localStorage.getItem("asset-preview-background") || "checker",
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transparent, setTransparent] = useState(!!asset);
  const canvas = useRef<HTMLDivElement>(null),
    end = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    replacement = useRef<HTMLInputElement>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
    resize: boolean;
    width: number;
    height: number;
  } | null>(null);
  const busyJob = jobs.find(
    (j) =>
      j.target.id === target.id && j.target.pageId === page.id && activeJob(j),
  );
  const latestJob = jobs
    .filter((j) => j.target.id === target.id && j.target.pageId === page.id)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const failedJob = latestJob?.status === "failed" ? latestJob : undefined;
  const currentOverlay = overlays.find((o) => o.id === selected),
    ratio = doc
      ? doc.width / doc.height
      : image
        ? image.width / image.height
        : 1;
  const resolution = doc ? printDpi(doc, image) : null;
  const useInNew = () =>
    run(async () => {
      if (!comp.imageId) return;
      if (!comp.overlays.length) {
        onNew(comp.imageId);
        return;
      }
      const width = Math.max(image?.width || 1024, 1024),
        height = Math.round(width / ratio);
      const canvas = await renderPage(w, comp, width, height, !!asset);
      const id = await api<string>("capture_composition", {
        data: canvas.toDataURL("image/png").split(",")[1],
      });
      await onRefresh();
      onNew(id);
    });
  useEffect(() => {
    localStorage.setItem(`draft:${page.id}`, prompt);
  }, [prompt, page.id]);
  useEffect(() => {
    setOverlays(comp.overlays);
  }, [page.historyIndex, comp.imageId]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [page.messages.length, busyJob?.status]);
  const saveOverlays = (next: Overlay[]) =>
    run(() => act({ op: "overlays", target, overlays: next }));
  const updateOverlay = (patch: Partial<Overlay>) => {
    const next = overlays.map((o) =>
      o.id === selected ? { ...o, ...patch } : o,
    );
    setOverlays(next);
    saveOverlays(next);
  };
  const addReference = (version: string) => {
    setReferences((current) =>
      current.includes(version) ? current : [...current, version],
    );
    setPicker(null);
    setPrompt((p) => p.replace(/\/(asset|upload)\s*$/, ""));
    textarea.current?.focus();
  };
  const addPageReference = (sourceDoc: DesignDocument, sourcePage: Page) =>
    run(async () => {
      const composition = currentComposition(sourcePage);
      if (!composition.imageId) return;
      if (!composition.overlays.length) {
        addReference(`image:${composition.imageId}`);
        return;
      }
      const sourceImage = w.images.find((i) => i.id === composition.imageId)!;
      const width = Math.max(sourceImage.width, 1024);
      const rendered = await renderPage(
        w,
        composition,
        width,
        Math.round((width * sourceDoc.height) / sourceDoc.width),
      );
      const imageId = await api<string>("capture_composition", {
        data: rendered.toDataURL("image/png").split(",")[1],
      });
      await onRefresh();
      addReference(`image:${imageId}`);
    });
  const placeAsset = (asset: Asset) => {
    const version = asset.currentVersionId;
    if (!version) return;
    const img = w.images.find((i) => i.id === versionImage(w, version));
    if (!img) return;
    const width = 25,
      height = Math.min(80, (width * ratio * img.height) / img.width);
    const overlay: Overlay = {
      // getRandomValues is also available on a private server using LAN HTTP.
      id: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""),
      assetVersionId: version,
      x: 8,
      y: 8,
      width,
      height,
      rotation: 0,
    };
    const next = [...overlays, overlay];
    setOverlays(next);
    setSelected(overlay.id);
    saveOverlays(next);
    setPicker(null);
  };
  async function submit() {
    if (!prompt.trim() || busyJob) return;
    const value = prompt;
    try {
      await api("submit_prompt", {
        request: { target, prompt: value, mode, references, transparent },
      });
      setPrompt("");
      setReferences([]);
      await onRefresh();
    } catch (error) {
      notify(String(error));
    }
  }
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(element);
      setViewport({
        width:
          element.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        height:
          element.clientHeight -
          parseFloat(style.paddingTop) -
          parseFloat(style.paddingBottom) -
          55,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const pageWidth = ratio > 1.2 ? 660 : ratio < 0.8 ? 395 : 510;
  const displayWidth = autoFit
    ? Math.max(1, Math.min(viewport.width, viewport.height * ratio))
    : (pageWidth * zoom) / 100;
  return (
    <div className={`editor mobile-view-${mobilePanel}`}>
      {showAssetJson && asset && (
        <AssetJsonDialog
          asset={asset}
          act={act}
          onClose={() => setShowAssetJson(false)}
          onRefresh={onRefresh}
          notify={notify}
          generationBusy={!!busyJob}
        />
      )}
      {extracting && (
        <ExtractAssetDialog
          w={w}
          composition={comp}
          ratio={ratio}
          organisationId={orgId || null}
          act={act}
          onClose={() => setExtracting(false)}
          onCreated={async (id) => {
            await onRefresh();
            onOpenAsset(id);
          }}
          notify={notify}
        />
      )}
      {asset && (
        <input
          type="file"
          hidden
          ref={replacement}
          aria-label="Replace asset file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              run(async () => {
                await importImageFile(file, asset.organisationId, asset.id);
                await onRefresh();
                notify(
                  "New asset version saved. Existing designs keep their originals.",
                );
              });
            e.target.value = "";
          }}
        />
      )}
      <header className="editor-topbar">
        <div className="editor-title">
          <button
            className="icon-button back-button"
            title="Back to workspace"
            onClick={onBack}
          >
            <ArrowLeft size={19} />
          </button>
          <span className="editor-title-divider" />
          <div>
            <small>
              {asset ? libraryKind(asset) === "upload" ? "Uploads" : "Asset library" : project?.name}
              <ChevronRight size={11} />
              {asset ? libraryKind(asset) === "upload" ? "Upload workspace" : "Asset workspace" : "Design"}
            </small>
            <button onClick={onEdit}>
              {doc?.name || asset?.name}
              <MoreHorizontal size={16} />
            </button>
          </div>
          <span className="saved-indicator">
            <Check size={13} />
            Saved
          </span>
        </div>
        <div className="button-row">
          {doc && comp.imageId && (
            <button
              className="button secondary small"
              onClick={() => setExtracting(true)}
            >
              <Sparkles size={15} />
              Extract asset
            </button>
          )}
          {asset && (
            <button
              className="button secondary small"
              onClick={() => replacement.current?.click()}
            >
              Replace image
            </button>
          )}
          {comp.imageId && (
            <button className="button secondary small" onClick={useInNew}>
              <ImagePlus size={15} />
              Use in new design
            </button>
          )}
          <button
            className="button primary small"
            disabled={!comp.imageId && !overlays.length}
            onClick={() => setShowExport(true)}
          >
            <ArrowDownToLine size={16} />
            Export
          </button>
        </div>
      </header>
      {compact && <div className="mobile-editor-views" role="group" aria-label="Editor view">
        {([ ["canvas", "Canvas", Square], ["tools", "Tools", Layers], ["chat", "Chat", MessageCircle] ] as const).map(([id, label, Icon]) => (
          <button key={id} aria-pressed={mobilePanel === id} onClick={() => setMobilePanel(id)}><Icon size={17} />{label}</button>
        ))}
      </div>}
      <div className="editor-body">
        <aside className="editor-tools">
          <div className="tool-tabs">
            <button
              className={panel === "pages" ? "active" : ""}
              title={asset ? libraryKind(asset) === "upload" ? "Upload" : "Asset" : "Pages"}
              onClick={() => setPanel("pages")}
            >
              <FileImage size={18} />
              <span>{asset ? libraryKind(asset) === "upload" ? "Upload" : "Asset" : "Pages"}</span>
            </button>
            <button
              className={panel === "assets" ? "active" : ""}
              title="Assets"
              onClick={() => setPanel("assets")}
            >
              <Images size={18} />
              <span>Assets</span>
            </button>
            <button className={panel === "uploads" ? "active" : ""} title="Uploads" onClick={() => setPanel("uploads")}><Upload size={18} /><span>Uploads</span></button>
            <button
              className={panel === "history" ? "active" : ""}
              title="History"
              onClick={() => setPanel("history")}
            >
              <History size={18} />
              <span>History</span>
            </button>
          </div>
          {panel === "pages" && (
            <div className="pages-panel">
              <div className="panel-heading">
                {asset ? libraryKind(asset) === "upload" ? "UPLOAD WORKSPACE" : "ASSET WORKSPACE" : `PAGES · ${doc!.pages.length}`}
              </div>
              {doc ? (
                doc.pages.map((p, i) => (
                  <button
                    key={p.id}
                    className={`page-tile ${page.id === p.id ? "active" : ""}`}
                    onClick={() => onPage(p.id)}
                  >
                    <div
                      className="page-thumbnail"
                      style={{ aspectRatio: doc.width / doc.height }}
                    >
                      <ImageView id={currentComposition(p).imageId} />
                    </div>
                    <span>
                      {i + 1}
                      <strong>{p.name}</strong>
                    </span>
                  </button>
                ))
              ) : (
                <div className="asset-workspace-note">
                  <span className="empty-icon">
                    <Sparkles size={21} />
                  </span>
                  <h4>Make it reusable.</h4>
                  <p>
                    Refine this asset here. Each generated result is preserved
                    as a library version.
                  </p>
                  <span className="tag-pill">Transparent by default</span>
                  <button
                    className="button secondary small asset-json-button"
                    onClick={() => setShowAssetJson(true)}
                  >
                    JSON description
                  </button>
                </div>
              )}
              {doc && (
                <button
                  className="add-page"
                  onClick={() =>
                    run(async () => {
                      const id = await act<string>({ op: "page", id: doc.id });
                      onPage(id);
                    })
                  }
                >
                  <Plus size={17} />
                  Add page
                </button>
              )}
            </div>
          )}
          {(panel === "assets" || panel === "uploads") && (
            <div className="editor-library">
              <div className="panel-heading">{panel === "uploads" ? "YOUR UPLOADS" : "YOUR ASSETS"}</div>
              <LibraryImages key={panel} w={w} orgId={orgId} kind={panel === "uploads" ? "upload" : "asset"} onReference={addReference} onPlace={doc ? placeAsset : undefined} />
            </div>
          )}
          {panel === "history" && (
            <div className="history-panel">
              <div className="panel-heading">
                IMAGE REVISIONS · {page.revisions.length}
              </div>
              <p>Return to any version. Later work is always preserved.</p>
              {[...page.revisions].reverse().map((r, reverseIndex) => (
                <button
                  className={`history-tile ${r.id === comp.revisionId ? "active" : ""}`}
                  key={r.id}
                  disabled={!!busyJob}
                  onClick={() =>
                    run(() => act({ op: "revision", target, revisionId: r.id }))
                  }
                >
                  <ImageView id={r.imageId} />
                  <span>
                    <strong>
                      Revision {page.revisions.length - reverseIndex}
                    </strong>
                    <small>{r.prompt}</small>
                  </span>
                  {r.id === comp.revisionId && <Check size={13} />}
                </button>
              ))}
              {!page.revisions.length && (
                <p className="muted">Your first image will appear here.</p>
              )}
            </div>
          )}
        </aside>
        <section className="canvas-workspace">
          <div className="canvas-toolbar">
            <div className="button-row">
              <button
                className="icon-button"
                title="Undo layout or image change"
                disabled={page.historyIndex === 0 || !!busyJob}
                onClick={() =>
                  run(() => act({ op: "history", target, direction: "undo" }))
                }
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                title="Redo"
                disabled={
                  page.historyIndex >= page.history.length - 1 || !!busyJob
                }
                onClick={() =>
                  run(() => act({ op: "history", target, direction: "redo" }))
                }
              >
                <Redo2 size={17} />
              </button>
              <span className="toolbar-divider" />
              {currentOverlay ? (
                <span className="toolbar-caption">
                  <Layers size={14} />
                  Original asset selected
                </span>
              ) : (
                <span className="toolbar-caption">
                  {doc
                    ? `${doc.width} × ${doc.height} ${doc.unit}`
                    : "Transparent asset"}
                </span>
              )}
            </div>
            <div className="button-row">
              {image && (
                <button
                  className="text-button"
                  onClick={() =>
                    run(() =>
                      act({
                        op: "framing",
                        target,
                        framing: comp.framing === "crop" ? "fit" : "crop",
                      }),
                    )
                  }
                >
                  <Maximize2 size={14} />
                  {comp.framing === "crop" ? "Fill" : "Fit"}
                </button>
              )}
              <button
                className="icon-button"
                title="Zoom out"
                onClick={() => {
                  setZoom(
                    Math.max(
                      10,
                      Math.round((displayWidth / pageWidth) * 100) - 10,
                    ),
                  );
                  setAutoFit(false);
                }}
              >
                <ZoomOut size={16} />
              </button>
              <button
                className="zoom-label"
                onClick={() => setAutoFit(true)}
                title="Fit to window"
              >
                {autoFit ? "Fit" : `${zoom}%`}
              </button>
              <button
                className="icon-button"
                title="Zoom in"
                onClick={() => {
                  setZoom(
                    Math.min(
                      400,
                      Math.round((displayWidth / pageWidth) * 100) + 10,
                    ),
                  );
                  setAutoFit(false);
                }}
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>
          <div
            ref={viewportRef}
            className="canvas-scroll"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <div className="canvas-wrapper" style={{ width: displayWidth }}>
              <div className="canvas-page-label">
                {asset ? asset.name : page.name}
                <span>
                  {doc
                    ? `${doc.width} × ${doc.height} ${doc.unit}`
                    : image
                      ? `${image.width} × ${image.height} px`
                      : "Asset"}
                </span>
              </div>
              <div
                ref={canvas}
                className={`design-canvas ${asset && previewBackground === "checker" ? "checker" : ""}`}
                style={{
                  aspectRatio: ratio,
                  ...(asset && previewBackground !== "checker"
                    ? { background: previewBackground }
                    : {}),
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelected(null);
                }}
              >
                {comp.imageId ? (
                  <ImageView
                    id={comp.imageId}
                    className="canvas-image"
                    style={{
                      objectFit: comp.framing === "crop" ? "cover" : "contain",
                    }}
                  />
                ) : (
                  <div className="blank-canvas">
                    <span>
                      <Sparkles size={27} strokeWidth={1.25} />
                    </span>
                    <h3>
                      A blank page.
                      <br />A world of possibilities.
                    </h3>
                    <p>Tell the assistant what you’d like to create.</p>
                  </div>
                )}
                {overlays.map((o) => (
                  <div
                    key={o.id}
                    className={`canvas-overlay ${selected === o.id ? "selected" : ""}`}
                    style={{
                      left: `${o.x}%`,
                      top: `${o.y}%`,
                      width: `${o.width}%`,
                      height: `${o.height}%`,
                      transform: `rotate(${o.rotation}deg)`,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setSelected(o.id);
                      drag.current = {
                        id: o.id,
                        x: e.clientX,
                        y: e.clientY,
                        left: o.x,
                        top: o.y,
                        moved: false,
                        resize: (e.target as HTMLElement).classList.contains(
                          "resize-handle",
                        ),
                        width: o.width,
                        height: o.height,
                      };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current,
                        rect = canvas.current?.getBoundingClientRect();
                      if (!d || d.id !== o.id || !rect) return;
                      const dx = ((e.clientX - d.x) / rect.width) * 100,
                        dy = ((e.clientY - d.y) / rect.height) * 100;
                      if (Math.abs(dx) + Math.abs(dy) < 0.1) return;
                      d.moved = true;
                      setOverlays((current) =>
                        current.map((item) =>
                          item.id !== d.id
                            ? item
                            : d.resize
                              ? {
                                  ...item,
                                  width: Math.max(2, d.width + dx),
                                  height: Math.max(
                                    2,
                                    ((d.width + dx) / d.width) * d.height,
                                  ),
                                }
                              : {
                                  ...item,
                                  x: Math.max(
                                    -item.width + 2,
                                    Math.min(98, d.left + dx),
                                  ),
                                  y: Math.max(
                                    -item.height + 2,
                                    Math.min(98, d.top + dy),
                                  ),
                                },
                        ),
                      );
                    }}
                    onPointerUp={() => {
                      if (drag.current?.moved) saveOverlays(overlays);
                      drag.current = null;
                    }}
                  >
                    <ImageView id={versionImage(w, o.assetVersionId)} />
                    {selected === o.id && (
                      <>
                        <span className="overlay-corner top-left" />
                        <span className="overlay-corner top-right" />
                        <span className="overlay-corner bottom-left" />
                        <span className="overlay-corner bottom-right resize-handle" />
                      </>
                    )}
                  </div>
                ))}
                {busyJob && mode === "generate" && (
                  <div className="generation-indicator">
                    <LoaderCircle size={17} className="spin" />
                    Creating your image…
                  </div>
                )}
              </div>
              <div className="canvas-bottom-note">
                <ShieldCheck size={12} />
                {asset
                  ? "Original versions are always kept"
                  : "Every change is saved automatically"}
              </div>
            </div>
          </div>
          {currentOverlay && (
            <div className="overlay-inspector">
              <span>
                <Layers size={15} />
                Asset placement
              </span>
              <label>
                Size
                <input
                  type="range"
                  min="3"
                  max="100"
                  value={currentOverlay.width}
                  onChange={(e) => {
                    const width = Number(e.target.value);
                    setOverlays((current) =>
                      current.map((o) =>
                        o.id === selected
                          ? {
                              ...o,
                              width,
                              height: (o.height / o.width) * width,
                            }
                          : o,
                      ),
                    );
                  }}
                  onPointerUp={() => saveOverlays(overlays)}
                  onKeyUp={() => saveOverlays(overlays)}
                />
              </label>
              <label>
                <RotateCw size={14} />
                <input
                  type="number"
                  aria-label="Overlay rotation"
                  value={currentOverlay.rotation}
                  min="-180"
                  max="180"
                  onChange={(e) =>
                    updateOverlay({ rotation: Number(e.target.value) })
                  }
                />
                °
              </label>
              <button
                className="icon-button"
                title="Bring forward"
                onClick={() => {
                  const index = overlays.findIndex((o) => o.id === selected),
                    next = [...overlays];
                  if (index < next.length - 1) {
                    [next[index], next[index + 1]] = [
                      next[index + 1],
                      next[index],
                    ];
                    setOverlays(next);
                    saveOverlays(next);
                  }
                }}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-button"
                title="Remove overlay"
                onClick={() => {
                  const next = overlays.filter((o) => o.id !== selected);
                  setOverlays(next);
                  setSelected(null);
                  saveOverlays(next);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
          <div className="canvas-status">
            {asset ? (
              <div
                className="preview-backgrounds"
                role="group"
                aria-label="Asset preview background"
              >
                <span>Preview</span>
                {previewBackgrounds.map((bg) => (
                  <button
                    key={bg.color}
                    className={`preview-swatch ${bg.color === "checker" ? "checker" : ""}`}
                    style={
                      bg.color === "checker" ? {} : { background: bg.color }
                    }
                    title={`${bg.name} preview background`}
                    aria-label={`${bg.name} preview background`}
                    aria-pressed={previewBackground === bg.color}
                    onClick={() => {
                      setPreviewBackground(bg.color);
                      localStorage.setItem(
                        "asset-preview-background",
                        bg.color,
                      );
                    }}
                  />
                ))}
              </div>
            ) : (
              <span>
                {asset
                  ? "Asset workspace"
                  : `${doc!.pages.findIndex((p) => p.id === page.id) + 1} of ${doc!.pages.length} pages`}
              </span>
            )}
            <span>
              {image
                ? `${image.width} × ${image.height} px${resolution ? ` · ${resolution} DPI at print size` : ""}`
                : "Ready for your first idea"}
            </span>
          </div>
        </section>
        <aside className="chat-panel">
          <div className="chat-heading">
            <span className="assistant-symbol">
              <Sparkles size={19} />
            </span>
            <div>
              <h3>Your design assistant</h3>
              <small>
                A conversation for{" "}
                {asset ? "this asset" : page.name.toLowerCase()}
              </small>
            </div>
            <span className="tiny-dot green" />
          </div>
          <div className="chat-messages">
            {!page.messages.length && (
              <div className="chat-welcome">
                <span className="welcome-spark">
                  <Sparkles size={29} strokeWidth={1.4} />
                </span>
                <h3>
                  Let’s bring your
                  <br />
                  idea to life.
                </h3>
                <p>
                  Describe the mood, the details, or just a starting point.
                  We’ll take it from there.
                </p>
                <div className="prompt-suggestions">
                  {(asset
                    ? [
                        "An illustrated pumpkin with a transparent background",
                        "A delicate botanical border, isolated on transparency",
                      ]
                    : [
                        "Create a striking poster with a warm, cinematic atmosphere",
                        "Help me explore a few creative directions first",
                      ]
                  ).map((s, i) => (
                    <button
                      key={s}
                      onClick={() => {
                        setPrompt(s);
                        if (i === 1 && !asset) setMode("discuss");
                        textarea.current?.focus();
                      }}
                    >
                      {i === 0 ? (
                        <Sparkles size={14} />
                      ) : (
                        <MessageCircle size={14} />
                      )}
                      <span>{s}</span>
                      <ArrowUpRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {page.messages.map((message) => (
              <div key={message.id} className={`chat-message ${message.role}`}>
                <div className="message-author">
                  {message.role === "user" ? (
                    "You"
                  ) : (
                    <>
                      <Sparkles size={12} />
                      Image Gen
                    </>
                  )}
                  <span>
                    {message.mode === "discuss"
                      ? "Discussion"
                      : "Image generation"}
                  </span>
                </div>
                <div className="message-text">{message.text}</div>
                {message.references.length > 0 && (
                  <div className="message-references">
                    {message.references.map((v) => (
                      <ImageView key={v} id={referenceImage(w, v)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busyJob && (
              <div className="job-progress">
                <LoaderCircle size={17} className="spin" />
                <span>{busyJob.message}</span>
              </div>
            )}
            {failedJob && !busyJob && (
              <div className="job-error">
                <strong>That request didn’t finish.</strong>
                <p>{failedJob.message}</p>
                <button
                  className="text-button"
                  onClick={() => {
                    const last = [...page.messages]
                      .reverse()
                      .find((m) => m.role === "user");
                    if (last) {
                      setPrompt(last.text);
                      setReferences(last.references);
                      setMode(last.mode);
                    }
                  }}
                >
                  Edit prompt & retry
                </button>
              </div>
            )}
            <div ref={end} />
          </div>
          <div className="composer">
            <div className="mode-switch">
              <button
                className={mode === "generate" ? "active" : ""}
                onClick={() => setMode("generate")}
              >
                <Sparkles size={14} />
                Generate / Edit
              </button>
              <button
                className={mode === "discuss" ? "active" : ""}
                onClick={() => setMode("discuss")}
              >
                <MessageCircle size={14} />
                Discuss
              </button>
            </div>
            <div className="prompt-box">
              {references.length > 0 && (
                <div className="reference-chips">
                  {references.map((v) => {
                    const a = w.assets.find((a) =>
                      a.versions.some((version) => version.id === v),
                    );
                    const name = a?.name || "Page image";
                    return (
                      <span key={v}>
                        <ImageView id={referenceImage(w, v)} />
                        {name}
                        <button
                          aria-label={`Remove ${name} reference`}
                          onClick={() =>
                            setReferences((refs) =>
                              refs.filter((id) => id !== v),
                            )
                          }
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <textarea
                ref={textarea}
                aria-label="Design prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  const command = e.target.value.match(/\/(asset|upload)\s*$/);
                  if (command) setPicker(command[1] as "asset" | "upload");
                }}
                placeholder={
                  mode === "discuss"
                    ? "Ask a question or explore an idea…"
                    : "Describe your image or what to change…"
                }
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <div className="prompt-controls">
                <button
                  className="icon-button"
                  title="Add an asset reference"
                  onClick={() => setPicker("asset")}
                >
                  <ImagePlus size={17} />
                </button>
                <small>
                  Type <b>/asset</b> or <b>/upload</b>
                </small>
                {busyJob ? (
                  <button
                    className="send-button stop"
                    title="Stop request"
                    onClick={() =>
                      run(() => api("cancel_job", { jobId: busyJob.id }))
                    }
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    className="send-button"
                    aria-label={
                      mode === "discuss" ? "Send discussion" : "Generate image"
                    }
                    disabled={!prompt.trim()}
                    onClick={submit}
                  >
                    <ArrowUp size={18} />
                  </button>
                )}
              </div>
            </div>
            <div className="composer-footnote">
              {mode === "generate" ? (
                <label>
                  <input
                    type="checkbox"
                    checked={transparent}
                    disabled={!!asset}
                    onChange={(e) => setTransparent(e.target.checked)}
                  />
                  Transparent background
                </label>
              ) : (
                <span>Discussion won’t generate an image.</span>
              )}
              <kbd>Ctrl ↵</kbd>
            </div>
          </div>
        </aside>
      </div>
      {picker && (
        <AssetPicker
          w={w}
          orgId={orgId}
          kind={picker}
          onReference={addReference}
          onPageReference={addPageReference}
          onPlace={doc ? placeAsset : undefined}
          onClose={() => setPicker(null)}
        />
      )}
      {showExport && (
        <ExportDialog
          w={w}
          doc={
            doc || {
              id: asset!.id,
              name: asset!.name,
              projectId: "",
              width: image?.width || 1024,
              height: image?.height || 1024,
              unit: "px",
              pages: [page],
              tags: [],
              updatedAt: 0,
              deletedAt: null,
              sourceDocumentId: null,
            }
          }
          pageIndex={doc ? doc.pages.findIndex((p) => p.id === page.id) : 0}
          asset={!!asset}
          onClose={() => setShowExport(false)}
          notify={notify}
        />
      )}
    </div>
  );
}

function AssetPicker({
  w,
  kind,
  orgId,
  onReference,
  onPageReference,
  onPlace,
  onClose,
}: {
  w: Workspace;
  orgId?: string | null;
  kind: "asset" | "upload";
  onReference: (id: string) => void;
  onPageReference: (doc: DesignDocument, page: Page) => void;
  onPlace?: (asset: Asset) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const designPages = (kind === "asset" ? w.documents : [])
    .filter(
      (d) =>
        !d.deletedAt &&
        w.projects.some(
          (p) =>
            !p.deletedAt &&
            p.id === d.projectId &&
            (!orgId || p.organisationId === orgId),
        ),
    )
    .flatMap((d) =>
      d.pages
        .filter(
          (p) =>
            currentComposition(p).imageId &&
            `${d.name} ${p.name}`.toLowerCase().includes(search.toLowerCase()),
        )
        .map((p) => ({ doc: d, page: p })),
    );
  return (
    <Modal
      title={kind === "upload" ? "Choose an upload" : "Choose an asset or design page"}
      subtitle="Choose an image to reference or place unchanged."
      onClose={onClose}
    >
      <div className="form-body">
        <div className="search-box asset-search">
          <Search size={16} />
          <input
            aria-label={kind === "upload" ? "Search uploads" : "Search assets"}
            autoFocus
            placeholder={kind === "upload" ? "Search uploads…" : "Search assets and design pages…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="asset-picker-list">
          <LibraryImages key={kind} w={w} orgId={orgId} kind={kind} search={search} onReference={onReference} onPlace={onPlace} />
          {designPages.length > 0 && (
            <div className="panel-heading">
              DESIGN PAGES · IMAGE ONLY, CONVERSATIONS STAY SEPARATE
            </div>
          )}
          {designPages.map(({ doc, page }) => (
            <div className="asset-picker-row" key={page.id}>
              <div className="checker">
                <ImageView id={currentComposition(page).imageId} />
              </div>
              <span>
                <strong>{doc.name}</strong>
                <small>{page.name} · Snapshot of this design</small>
              </span>
              <button
                className="button secondary small"
                onClick={() => onPageReference(doc, page)}
              >
                Reference page
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
