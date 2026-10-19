import { useCallback, useEffect, useId, useRef, useState } from "react";
import { UserMenu } from "./UserMenu";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  FileImage,
  ChevronsUpDown,
  Pencil,
  History,
  ImagePlus,
  Images,
  Upload,
  Layers,
  Lock,
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
  type RegionNote,
} from "./types";
import { ImageView, Modal, useCompactLayout, type Act } from "./ui";
import { LibraryImages } from "./LibraryImages";
import { UploadDrawer, useUploadDrop, type UploadControls } from "./Uploads";
import { useCanvasCommands } from "./CanvasCommands";
import type { OverlayClipboard } from "./overlayOperations";
import { libraryImageDrag } from "./overlayOperations";
import { newestFirst } from "./folderOrdering";
import { resizeOverlay, rotateOverlay, type OverlayCorner } from "./overlayTransform";
import { AssetJsonDialog } from "./AssetJsonDialog";
import { ExtractAssetDialog } from "./ExtractAssetDialog";
import { renderPage } from "./export";
import { TemplateComposer } from "./TemplateComposer";
import { templateDefaults, templateErrors } from "./templateInputs";
import { Templates, TemplateForm, type TemplateSource } from "./Templates";
import type { Template, TemplateRequest, ReferencePurpose, Message } from "./types";
import { ExportDialog } from "./ExportDialog";
import { RegionCanvas } from "./RegionCanvas";
import { RegionReview } from "./RegionReview";
import { useEditorSheet, useSheetBack } from "./editorSheets";
import { annotationSource, regionFrame, regionNotesFingerprint } from "./annotationEditing";

function UserMessageText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false), [long, setLong] = useState(false);
  const content = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    const element = content.current!;
    const measure = () => setLong(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * 5 + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);
  return <div className="message-text">
    <span ref={content} id={id} className={`user-message-content${expanded ? "" : " collapsed"}`}>{text}</span>
    {long && <button className="text-button message-expand" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "More…"}</button>}
  </div>;
}

function SheetHandle({ expanded, onExpand, onDismiss }: { expanded: boolean; onExpand: (expanded: boolean) => void; onDismiss: () => void }) {
  const gesture = useRef<{ y: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  return <button type="button" className="sheet-handle" aria-label={expanded ? "Collapse drawer" : "Expand drawer"} aria-expanded={expanded}
    onPointerDown={event => {
      if (event.button !== 0) return;
      gesture.current = { y: event.clientY, dragged: false };
      suppressClick.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (gesture.current && Math.abs(event.clientY - gesture.current.y) > 8) gesture.current.dragged = true;
    }}
    onPointerUp={event => {
      const start = gesture.current;
      gesture.current = null;
      if (!start) return;
      suppressClick.current = start.dragged;
      const delta = event.clientY - start.y;
      if (delta < -32) onExpand(true);
      else if (delta > 32) { if (expanded) onExpand(false); else onDismiss(); }
    }}
    onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
    onClick={() => {
      if (suppressClick.current) { suppressClick.current = false; return; }
      onExpand(!expanded);
    }}
  />;
}

export function Editor({
  w,
  doc,
  asset,
  pageId,
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
  uploads,
  selectedOrganisation,
  overlayClipboard,
}: {
  w: Workspace;
  uploads: UploadControls;
  selectedOrganisation: string;
  overlayClipboard: React.RefObject<OverlayClipboard | null>;
  doc?: DesignDocument;
  asset?: Asset;
  pageId: string | null;
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
  const compact = useCompactLayout(1279);
  const [mobilePanel, setMobilePanel] = useState("canvas");
  const [drawerOpen, setDrawerOpen] = useState(true), [sheetExpanded, setSheetExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [layoutSaving, setLayoutSaving] = useState(false), [saveError, setSaveError] = useState("");
  const toolsRef = useRef<HTMLElement>(null), chatRef = useRef<HTMLElement>(null), editorRef = useRef<HTMLDivElement>(null);
  useEditorSheet(toolsRef, compact && (mobilePanel === "tools" || mobilePanel === "pages"), () => dismissSheet(() => setMobilePanel("canvas")));
  useEditorSheet(chatRef, compact && mobilePanel === "chat", () => dismissSheet(() => setMobilePanel("canvas")));
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
      () => page.regionNotes?.length || page.editBatch ? "generate" : page.messages[page.messages.length - 1]?.mode || "generate",
    ),
    [prompt, setPrompt] = useState(
      () => localStorage.getItem(`draft:${page.id}`) || "",
    );
  const [references, setReferences] = useState<string[]>([]),
    [picker, setPicker] = useState<"asset" | "upload" | null>(null),
    [zoom, setZoom] = useState(100),
    [selected, setSelected] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [templateAnswers, setTemplateAnswers] = useState<Record<string, string>>({});
  const submissionLock = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [showTemplateErrors, setShowTemplateErrors] = useState(false);
  const [pendingPurpose, setPendingPurpose] = useState<ReferencePurpose["purpose"] | undefined>();
  const [referencePurposes, setReferencePurposes] = useState<Record<string, ReferencePurpose>>({});
  const [templateSource, setTemplateSource] = useState<TemplateSource | null>(null);
  const [requestPreview, setRequestPreview] = useState<TemplateRequest | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [historicalSettings, setHistoricalSettings] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const hasSubject = references.some(r => referencePurposes[r]?.purpose === "Subject");
  const answerErrors = template ? templateErrors(template, templateAnswers, hasSubject) : {};
  const currentTemplate = w.templates?.find(t => t.id === template?.id);
  useEffect(() => {
    if (!template) return;
    // The normal workspace poll pauses while typing; selected recipes still need update notices.
    let pending = false;
    const timer = setInterval(async () => {
      if (pending || document.hidden) return;
      pending = true;
      try { await onRefresh(); } catch { /* Keep the captured draft available offline. */ }
      finally { pending = false; }
    }, 5000);
    return () => clearInterval(timer);
  }, [template?.id, onRefresh]);
  const selectTemplate = (t: Template, attachStyle = false) => {
    if (page.regionNotes?.length || page.editBatch) { notify("Remove or finish the pending region edits before using a template"); return; }
    setTemplate(structuredClone(t)); setTemplateAnswers(templateDefaults(t)); setShowTemplateErrors(false); setMode(t.mode || "generate"); setShowTemplatePicker(false); setHistoricalSettings("");
    setPrompt(p => p.replace(/\/templates\s*$/, ""));
    if (attachStyle && t.exampleImageId) {
      const reference = `image:${t.exampleImageId}`;
      addReference(reference);
      setReferencePurposes(p => ({ ...p, [reference]: { reference, purpose: "Style", explanation: "Template example; guide style, not subject identity." } }));
    }
    if (compact) setMobilePanel("chat");
    textarea.current?.focus();
  };
  const reuseRequest = (m: Message) => {
    const snapshot = m.templateRequest;
    if (snapshot) {
      setTemplate(structuredClone(snapshot.template)); setTemplateAnswers(snapshot.answers || templateDefaults(snapshot.template)); setShowTemplateErrors(false); setTransparent(snapshot.transparent);
      setReferencePurposes(Object.fromEntries(snapshot.referencePurposes.map(p => [p.reference, p])));
      if (snapshot.template.mode !== "discuss" && doc && (doc.width !== snapshot.width || doc.height !== snapshot.height || doc.unit !== snapshot.unit)) {
        setHistoricalSettings(`Historical output was ${snapshot.width} × ${snapshot.height} ${snapshot.unit}. This document is ${doc.width} × ${doc.height} ${doc.unit}.`);
      } else {
        setHistoricalSettings("");
      }
    } else { setTemplate(null); setReferencePurposes(Object.fromEntries((m.referencePurposes || []).map(p => [p.reference, p]))); }
    setPrompt(m.text); setReferences(m.references); setMode(m.mode);
    if (compact) setMobilePanel("chat");
  };
  const sourceFor = (imageId: string, messages: Message[], fallback: string): TemplateSource => {
    const last = [...messages].reverse().find(m => m.role === "user" && m.mode === "generate");
    const snapshot = last?.templateRequest;
    return { imageId, template: snapshot?.template, answers: snapshot?.answers, recipe: snapshot ? `${snapshot.template.recipe}\n\n${snapshot.additionalInstructions}`.trim() : last?.text || fallback, messages };
  };
  const [uploadsPending, setUploadsPending] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null), [editingNote, setEditingNote] = useState<RegionNote | null>(null);
  const annotating = editingKey !== null;
  const [regionNotes, setRegionNotes] = useState<RegionNote[]>(page.regionNotes || []), [regionSaving, setRegionSaving] = useState(false);
  const savedRegionNotes = useRef(regionNotesFingerprint(page.regionNotes || [])), savingRegionNotes = useRef(false);
  const [regionPreview, setRegionPreview] = useState<string | null>(null);
  const annotationLocked = !!page.editBatch;
  useEffect(() => {
    if (!savingRegionNotes.current) { setRegionNotes(page.regionNotes || []); savedRegionNotes.current = regionNotesFingerprint(page.regionNotes || []); }
  }, [JSON.stringify(page.regionNotes || [])]);
  const saveRegionNotes = async (next: RegionNote[]) => {
    if (savingRegionNotes.current || annotationLocked) throw Error("Wait for the current edit to finish saving");
    savingRegionNotes.current = true; setRegionSaving(true); setSaveError("");
    try {
      const base = await api<Workspace>("get_workspace");
      const stored = base.documents.find(d => d.id === target.id)?.pages.find(p => p.id === target.pageId);
      if (regionNotesFingerprint(stored?.regionNotes || []) !== savedRegionNotes.current) { await onRefresh(); throw Error("Region edits changed elsewhere. Refresh before changing them."); }
      await api("mutate", { action: { op: "annotation_notes", target, notes: next, _base: base } });
      savedRegionNotes.current = regionNotesFingerprint(next); setRegionNotes(next); await onRefresh();
    } catch (error) { setSaveError(String(error)); throw error; }
    finally { savingRegionNotes.current = false; setRegionSaving(false); }
  };
  const [overlays, setOverlays] = useState<Overlay[]>(comp.overlays),
    [showExport, setShowExport] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportReturnPanel, setExportReturnPanel] = useState("canvas");
  const openExport = () => { setMoreOpen(false); setExportReturnPanel(mobilePanel); setMobilePanel("canvas"); setShowExport(true); };
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => editorRef.current?.style.setProperty("--keyboard-inset", `${Math.max(0, window.innerHeight - (viewport?.height || window.innerHeight) - (viewport?.offsetTop || 0))}px`);
    update(); viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, []);
  const overlaySaves = useRef(Promise.resolve()), pendingSaves = useRef(0);
  const savedOverlays = useRef(comp.overlays);
  const [autoFit, setAutoFit] = useState(true);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [extracting, setExtracting] = useState(false);
  const [showAssetJson, setShowAssetJson] = useState(false);
  const dismissSheet = useSheetBack(compact && (mobilePanel !== "canvas" || moreOpen || showExport || !!picker || showTemplatePicker || !!templateSource || extracting || showAssetJson), () => {
    if (exportBusy) return false;
    setMobilePanel("canvas"); setMoreOpen(false); setShowExport(false); setPicker(null); setShowTemplatePicker(false); setTemplateSource(null); setExtracting(false); setShowAssetJson(false);
  });
  const closeFloating = (action: () => void) => compact && mobilePanel === "canvas" ? dismissSheet(action) : action();
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
  useEffect(() => {
    if (!template) { setRequestPreview(null); setPreviewError(""); return; }
    let active = true;
    setRequestPreview(null); setPreviewError("");
    const timer = setTimeout(() => {
      api<TemplateRequest>("preview_template", { request: { target, template, prompt, mode: template.mode || "generate", templateAnswers, references,
        referencePurposes: references.map(reference => referencePurposes[reference] || { reference, purpose: "Other", explanation: "" }), transparent } })
        .then(p => { if (active) setRequestPreview(p); }).catch(e => { if (active) setPreviewError(String(e)); });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [template, templateAnswers, prompt, references, referencePurposes, transparent, doc?.width, doc?.height, doc?.unit, page.id]);
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
    corner?: OverlayCorner;
    rotate: boolean;
    start: Overlay;
    latest: Overlay;
    pointerId: number;
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
    if (!pendingSaves.current && !canvasCommands.isNudging()) { setOverlays(comp.overlays); savedOverlays.current = comp.overlays; }
  }, [page.historyIndex, comp.imageId]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [page.messages.length, busyJob?.status]);
  const persistOverlays = (next: Overlay[]) => {
    if (annotationLocked) return Promise.reject(Error("Apply or discard the annotated edit before changing layers"));
    pendingSaves.current++;
    setLayoutSaving(true); setSaveError("");
    const work = overlaySaves.current.catch(() => {}).then(async () => {
      const base = await api<Workspace>("get_workspace");
      const storedPage = target.kind === "document" ? base.documents.find(d => d.id === target.id)?.pages.find(p => p.id === target.pageId) : base.assets.find(a => a.id === target.id)?.page;
      const stored = storedPage && currentComposition(storedPage).overlays;
      const normalise = (items: Overlay[]) => JSON.stringify(items.map(o => [o.id, o.assetVersionId, o.x, o.y, o.width, o.height, o.rotation, !!o.locked]));
      if (!stored || normalise(stored) !== normalise(savedOverlays.current)) {
        if (stored) { setOverlays(stored); savedOverlays.current = stored; }
        await onRefresh();
        throw Error("This layout changed elsewhere. The latest layout has been loaded; try your change again.");
      }
      await api("mutate", { action: { op: "overlays", target, overlays: next, _base: base } });
      savedOverlays.current = next;
      await onRefresh();
    }).catch(async error => { setSaveError(String(error)); setOverlays(savedOverlays.current); await onRefresh().catch(() => {}); throw error; }).finally(() => { pendingSaves.current--; setLayoutSaving(pendingSaves.current > 0); });
    overlaySaves.current = work;
    return work;
  };
  const saveOverlays = (next: Overlay[]) => run(() => persistOverlays(next));
  const updateOverlay = (patch: Partial<Overlay>) => {
    if (currentOverlay?.locked || annotationLocked) return;
    const next = overlays.map((o) =>
      o.id === selected ? { ...o, ...patch } : o,
    );
    setOverlays(next);
    saveOverlays(next);
  };
  const addReference = (version: string, purpose?: ReferencePurpose["purpose"]) => {
    setReferences((current) =>
      current.includes(version) ? current : [...current, version],
    );
    purpose = pendingPurpose || purpose; setPendingPurpose(undefined);
    if (purpose) setReferencePurposes(current => ({ ...current, [version]: { reference: version, purpose, explanation: "" } }));
    setPicker(null);
    setPrompt((p) => p.replace(/\/(asset|upload)\s*$/, ""));
    if (compact) setMobilePanel("chat");
    requestAnimationFrame(() => textarea.current?.focus());
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
  const placeVersion = (version: string | null | undefined, point?: { x: number; y: number }) => {
    void canvasCommands.placeVersion(version, point).then(() => { if (compact) dismissSheet(() => { setPicker(null); setMobilePanel("canvas"); }); else setPicker(null); }).catch(error => notify(String(error)));
  };
  const placeAsset = (asset: Asset) => placeVersion(asset.currentVersionId);
  async function submit() {
    if ((!prompt.trim() && !template && !regionNotes.length) || busyJob || annotationLocked || regionSaving || uploadsPending || canvasCommands.busy || historicalSettings || submissionLock.current) return;
    if (template && Object.keys(answerErrors).length) { setShowTemplateErrors(true); return; }
    const value = prompt;
    submissionLock.current = true; setSubmitting(true);
    try {
      const validatedInstructions = template ? (await api<TemplateRequest>("preview_template", { request: { target, template, templateAnswers, prompt: value, mode, references, transparent,
        referencePurposes: references.map(reference => referencePurposes[reference] || { reference, purpose: "Other", explanation: "" }) } })).instructions : undefined;
      await overlaySaves.current;
      if (regionNotes.length) {
        if (mode !== "generate") throw Error("Choose Generate / Edit to submit these region edits");
        await api("generate_annotations", { target, request: { instructions: value, references, referencePurposes: references.map(reference => referencePurposes[reference] || { reference, purpose: "Other", explanation: "" }) } });
        setEditingKey(null); setEditingNote(null);
      } else await api("submit_prompt", {
        request: { target, prompt: value, mode, references, transparent, template, templateAnswers, expectedInstructions: validatedInstructions,
          referencePurposes: references.map(reference => referencePurposes[reference] || { reference, purpose: "Other", explanation: "" }) },
      });
      setPrompt("");
      setReferences([]); setTemplate(null); setTemplateAnswers({}); setShowTemplateErrors(false); setReferencePurposes({});
      await onRefresh();
    } catch (error) {
      if (template) { setPreviewError(String(error)); setShowTemplateErrors(true); }
      notify(String(error));
    } finally { submissionLock.current = false; setSubmitting(false); }
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
  const pixelWidth = doc?.unit === "px" ? doc.width : image?.width || (doc ? doc.width * 300 / (doc.unit === "in" ? 1 : 25.4) : 1024);
  const cancelCanvasDrag = useCallback(() => {
    const pending = drag.current;
    drag.current = null;
    if (pending?.moved) setOverlays(current => current.map(o => o.id === pending.id
      ? { ...pending.start } : o));
  }, []);
  const regionName = (key: string) => key === "background" ? "Background" : w.assets.find(a => a.versions.some(v => v.id === overlays.find(o => o.id === key)?.assetVersionId))?.name || "Image layer";
  const canEditRegion = (key: string) => !!doc && !busyJob && !annotationLocked && !regionSaving && !!annotationSource(w,{...comp,overlays},key)
    && !overlays.find(o => o.id === key)?.locked && (!regionNotes.length || regionNotes.every(n => n.targetKey === key));
  const beginRegionEdit = async (key: string, note: RegionNote | null = null) => {
    if (!canEditRegion(key)) { notify("Finish or remove the current item's edits before editing another unlocked item"); return; }
    await overlaySaves.current;
    setSelected(key === "background" ? null : key); setEditingKey(key); setEditingNote(note); setMode("generate"); setTemplate(null);
    if (compact) setMobilePanel("canvas");
  };
  const currentRegionFrame = editingKey && regionFrame(w,{...comp,overlays},editingKey,ratio);
  const canvasCommands = useCanvasCommands({ w, overlays, setOverlays, selected, setSelected, canvas, focus: viewportRef, clipboard: overlayClipboard,
    cancelDrag: cancelCanvasDrag,
    width: pixelWidth, height: pixelWidth / ratio, organisationId: orgId || null, save: persistOverlays, refresh: onRefresh,
    history: async direction => { await overlaySaves.current.catch(() => {}); const base = await api<Workspace>("get_workspace"); await api("mutate", { action: { op: "history", target, direction, _base: base } }); await onRefresh(); },
    canUndo: page.historyIndex > 0, canRedo: page.historyIndex < page.history.length - 1, generationBusy: !!busyJob || annotationLocked || annotating, notify,
    onEdit: doc ? key => beginRegionEdit(key) : undefined, canEdit: canEditRegion });
  const canvasUploadDrop = useUploadDrop(doc ? (files, e) => {
    if (annotationLocked || annotating || busyJob || canvasCommands.busy) return;
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    void canvasCommands.dropFiles(files, { x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 }).catch(error => notify(String(error)));
  } : undefined);
  const displayWidth = autoFit
    ? Math.max(1, Math.min(viewport.width, viewport.height * ratio))
    : (pageWidth * zoom) / 100;
  const toolItems = [
    { id: "pages", label: asset ? libraryKind(asset) === "upload" ? "Upload" : "Asset" : "Pages", Icon: FileImage },
    { id: "assets", label: "Assets", Icon: Images },
    { id: "uploads", label: "Uploads", Icon: Upload },
    { id: "templates", label: "Templates", Icon: FileImage },
    { id: "history", label: "History", Icon: History },
  ];
  const activePanel = compact && mobilePanel === "pages" ? "pages" : compact && panel === "pages" ? "assets" : panel;
  const chooseTool = (id: string) => {
    if (compact) { if (id !== "pages") setPanel(id); setMobilePanel(id === "pages" ? "pages" : "tools"); }
    else { setDrawerOpen(id === panel ? !drawerOpen : true); setPanel(id); }
  };
  const jobStatus = busyJob ? "Working" : failedJob ? "Request failed" : latestJob?.status === "completed" ? "Ready" : "";
  const saveTemplate = () => {
    const revision = page.revisions.find(r => r.id === comp.revisionId);
    setTemplateSource(sourceFor(comp.imageId!, revision?.messages || page.messages, revision?.prompt || ""));
  };
  return (
    <div ref={editorRef} className={`editor responsive-editor mobile-view-${mobilePanel} ${drawerOpen ? "drawer-open" : "drawer-closed"} ${sheetExpanded ? "sheet-expanded" : ""}`}>
      {canvasCommands.ui}
      {showAssetJson && asset && (
        <AssetJsonDialog
          asset={asset}
          act={act}
          onClose={() => closeFloating(() => setShowAssetJson(false))}
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
          onClose={() => closeFloating(() => setExtracting(false))}
          onCreated={async (id) => {
            await onRefresh();
            dismissSheet(() => onOpenAsset(id));
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
          <button className="icon-button back-button" title="Back to workspace" aria-label="Back to workspace" onClick={onBack}><ArrowLeft size={20} /></button>
          <div>
            <button className="editor-name" title="Rename or manage design" onClick={onEdit}>{doc?.name || asset?.name}</button>
            <small className="editor-context">{project?.name || (asset && libraryKind(asset) === "upload" ? "Uploads" : "Asset workspace")}</small>
            <span className={`saved-indicator ${saveError ? "save-failed" : ""}`} role="status" title={saveError || undefined}>
              {layoutSaving || regionSaving ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}
              {layoutSaving || regionSaving ? "Saving…" : saveError ? "Save failed · try your change again" : "All changes saved"}
            </span>
          </div>
        </div>
        <div className="button-row editor-actions">
          <button className="icon-button" aria-label="More document actions" title="More document actions" onClick={event => { event.currentTarget.focus(); setMoreOpen(true); }}><MoreHorizontal size={21} /></button>
          <button className="button primary small editor-export" aria-label="Export" disabled={!comp.imageId && !overlays.length} onClick={event => { event.currentTarget.focus(); openExport(); }}><ArrowDownToLine size={17} /><span>Export</span></button>
          {!compact && <UserMenu />}
        </div>
      </header>
      <div className="editor-body">
        <nav className="editor-rail tool-tabs" aria-label="Design tools">
          {toolItems.map(({ id, label, Icon }) => <button key={id} title={label} aria-pressed={activePanel === id && (compact ? mobilePanel === (id === "pages" ? "pages" : "tools") : drawerOpen)} className={activePanel === id && (compact ? mobilePanel === (id === "pages" ? "pages" : "tools") : drawerOpen) ? "active" : ""} onClick={event => { event.currentTarget.focus(); chooseTool(id); }}><Icon size={20} /><span>{label}</span></button>)}
          {compact && <button className={`rail-chat ${mobilePanel === "chat" ? "active" : ""}`} aria-label={`Chat${jobStatus ? ` · ${jobStatus}` : ""}`} onClick={event => { event.currentTarget.focus(); setMobilePanel("chat"); }}><MessageCircle size={20}/><span>Chat</span>{jobStatus && <span className="job-badge">{jobStatus}</span>}</button>}
        </nav>
        <aside ref={toolsRef} className="editor-tools" role={compact && (mobilePanel === "tools" || mobilePanel === "pages") ? "dialog" : undefined} aria-label={activePanel === "pages" ? "Pages panel" : "Design tools panel"} tabIndex={-1}>
          <SheetHandle expanded={sheetExpanded} onExpand={setSheetExpanded} onDismiss={() => dismissSheet(() => setMobilePanel("canvas"))} />
          <div className="tool-panel-heading"><h2>{toolItems.find(t => t.id === activePanel)?.label}</h2><div className="button-row">
            {compact && <button className="icon-button expand-sheet" aria-label={sheetExpanded ? "Collapse sheet" : "Expand sheet"} aria-expanded={sheetExpanded} onClick={() => setSheetExpanded(!sheetExpanded)}><ChevronsUpDown size={19}/></button>}
            <button className="icon-button" data-sheet-close aria-label="Close tools" onClick={() => compact ? dismissSheet(() => setMobilePanel("canvas")) : setDrawerOpen(false)}><X size={20}/></button>
          </div></div>
          {activePanel !== "pages" && <div className="tool-chooser" role="group" aria-label="Choose a tool">{toolItems.filter(t => t.id !== "pages").map(({id,label}) => <button key={id} aria-pressed={activePanel === id} onClick={() => setPanel(id)}>{label}</button>)}</div>}
          <div hidden={activePanel !== "pages"} className="tool-content"><div className="pages-panel">
              <div className="panel-heading">
                {asset ? libraryKind(asset) === "upload" ? "UPLOAD WORKSPACE" : "ASSET WORKSPACE" : `PAGES · ${doc!.pages.length}`}
              </div>
              {doc ? (
                doc.pages.map((p, i) => (
                  <button
                    key={p.id}
                    className={`page-tile ${page.id === p.id ? "active" : ""}`}
                    onClick={() => compact ? dismissSheet(() => onPage(p.id)) : onPage(p.id)}
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
                      if (compact) dismissSheet(() => onPage(id)); else onPage(id);
                    })
                  }
                >
                  <Plus size={17} />
                  Add page
                </button>
              )}
            </div></div>
          <div hidden={activePanel !== "uploads"} className="tool-content"><UploadDrawer key={selectedOrganisation} w={w} orgId={selectedOrganisation === "all" ? orgId : selectedOrganisation} uploads={uploads} onReference={addReference} onPlace={doc ? placeAsset : undefined} /></div>
          <div hidden={activePanel !== "assets"} className="tool-content">
            <div className="editor-library">
              <div className="panel-heading">YOUR ASSETS</div>
              <label className="drawer-search"><Search size={17}/><input aria-label="Search assets" placeholder="Search assets" value={assetSearch} onChange={event => setAssetSearch(event.target.value)}/></label>
              <p className="drawer-guidance">Place keeps the original. Reference guides generation.</p>
              <LibraryImages w={w} orgId={orgId} kind="asset" search={assetSearch} onReference={addReference} onPlace={doc ? placeAsset : undefined} clickToPlace />
            </div></div>
          <div hidden={activePanel !== "templates"} className="tool-content"><div className="editor-library"><div className="panel-heading">YOUR TEMPLATES</div><Templates key={orgId} w={w} orgId={orgId} act={act} onRefresh={onRefresh} onSelect={selectTemplate} /></div></div>
          <div hidden={activePanel !== "history"} className="tool-content">
            <div className="history-panel">
              <div className="panel-heading">
                IMAGE REVISIONS · {page.revisions.length}
              </div>
              <p>Return to any version. Later work is always preserved.</p>
              {[...page.revisions].reverse().map((r, reverseIndex) => (
                <div key={r.id}><button
                  className={`history-tile ${r.id === comp.revisionId ? "active" : ""}`}
                  key={r.id}
                  disabled={!!busyJob || annotationLocked}
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
                </button><button className="text-button" onClick={() => setTemplateSource(sourceFor(r.imageId, r.messages, r.prompt))}>Save revision as template</button></div>
              ))}
              {!page.revisions.length && (
                <p className="muted">Your first image will appear here.</p>
              )}
            </div>
          </div>
        </aside>
        <section className="canvas-workspace">
          <div
            ref={viewportRef}
            className={`canvas-scroll ${canvasUploadDrop.dragging ? "upload-drop-zone upload-dragging" : ""}`}
            tabIndex={0}
            aria-label="Design canvas"
            {...canvasCommands.handlers}
            onDragEnter={canvasUploadDrop.dropProps.onDragEnter}
            onDragLeave={canvasUploadDrop.dropProps.onDragLeave}
            onDragOver={e => {
              if (!libraryImageDrag.versionId) {
                canvasUploadDrop.dropProps.onDragOver(e);
                if (annotationLocked || annotating || busyJob || canvasCommands.busy) e.dataTransfer.dropEffect = "none";
                return;
              }
              e.preventDefault();
              e.dataTransfer.dropEffect = doc && !annotationLocked && !annotating && !busyJob && !canvasCommands.busy ? "copy" : "none";
            }}
            onDrop={e => {
              const version = libraryImageDrag.versionId;
              if (!version) { canvasUploadDrop.dropProps.onDrop(e); return; }
              libraryImageDrag.versionId = null;
              e.preventDefault(); e.stopPropagation();
              if (!doc || annotationLocked || annotating || busyJob || canvasCommands.busy) return;
              const rect = canvas.current?.getBoundingClientRect();
              if (!rect?.width || !rect.height) return;
              placeVersion(version, {
                x: (e.clientX - rect.left) / rect.width * 100,
                y: (e.clientY - rect.top) / rect.height * 100,
              });
              viewportRef.current?.focus({ preventScroll: true });
            }}
            onPointerDownCapture={e => {
              if ((e.target as HTMLElement).closest('.design-canvas') && !(e.target as HTMLElement).closest('.region-inline-instruction, .region-focus-label')) viewportRef.current?.focus({ preventScroll: true });
              canvasCommands.handlers.onPointerDownCapture(e);
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            {canvasUploadDrop.dragging && <div className="upload-drop-hint">{annotationLocked || annotating || busyJob || canvasCommands.busy ? "Finish the current edit before placing images" : "Drop images to save to Uploads and place on the canvas"}</div>}
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
                className={`design-canvas ${!asset || previewBackground === "checker" ? "checker" : ""}`}
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
                      opacity: editingKey && editingKey !== "background" ? .25 : 1,
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
                    data-overlay-id={o.id}
                    className={`canvas-overlay ${selected === o.id ? "selected" : ""} ${o.locked ? "locked" : ""}`}
                    style={{
                      left: `${o.x}%`,
                      top: `${o.y}%`,
                      width: `${o.width}%`,
                      height: `${o.height}%`,
                      transform: `rotate(${o.rotation}deg)`,
                      opacity: editingKey && editingKey !== o.id ? .25 : 1,
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected(o.id);
                      if (e.button !== 0 || o.locked || canvasCommands.busy || busyJob || annotationLocked || annotating) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = {
                        id: o.id,
                        x: e.clientX,
                        y: e.clientY,
                        left: o.x,
                        top: o.y,
                        moved: false,
                        corner: (e.target as HTMLElement).closest<HTMLElement>("[data-resize-corner]")?.dataset.resizeCorner as OverlayCorner | undefined,
                        rotate: !!(e.target as HTMLElement).closest(".rotation-handle"),
                        start: { ...o },
                        latest: { ...o },
                        pointerId: e.pointerId,
                        width: o.width,
                        height: o.height,
                      };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current,
                        rect = canvas.current?.getBoundingClientRect();
                      if (!d || d.id !== o.id || d.pointerId !== e.pointerId || !rect) return;
                      const dx = ((e.clientX - d.x) / rect.width) * 100,
                        dy = ((e.clientY - d.y) / rect.height) * 100;
                      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 0.1) return;
                      d.moved = true;
                      // Pointer-up can arrive before React renders the last movement.
                      d.latest = d.corner
                        ? resizeOverlay(d.start, d.corner, e.clientX - d.x, e.clientY - d.y, rect.width, rect.height, e.shiftKey)
                        : d.rotate
                          ? rotateOverlay(d.start, { x: d.x, y: d.y }, { x: e.clientX, y: e.clientY }, {
                              x: rect.left + (d.left + d.width / 2) * rect.width / 100,
                              y: rect.top + (d.top + d.height / 2) * rect.height / 100,
                            })
                          : { ...d.start,
                              x: Math.max(-d.width + 2, Math.min(98, d.left + dx)),
                              y: Math.max(-d.height + 2, Math.min(98, d.top + dy)),
                            };
                      const next = d.latest;
                      setOverlays(current => current.map(item => item.id === d.id ? next : item));
                    }}
                    onLostPointerCapture={cancelCanvasDrag}
                    onPointerCancel={cancelCanvasDrag}
                    onPointerUp={(e) => {
                      if (drag.current?.pointerId !== e.pointerId) return;
                      const d = drag.current;
                      if (d.moved) saveOverlays(overlays.map(item => item.id === d.id ? d.latest : item));
                      drag.current = null;
                    }}
                  >
                    <ImageView id={versionImage(w, o.assetVersionId)} />
                    {o.locked && <span className="overlay-lock"><Lock size={12} /></span>}
                    {selected === o.id && !o.locked && (
                      <>
                        {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(corner => (
                          <span key={corner} className={`overlay-corner ${corner} resize-handle`} data-resize-corner={corner} title={`Resize from ${corner.replace("-", " ")}; hold Shift to resize from centre`} />
                        ))}
                        <span className="rotation-stem" />
                        <span className="rotation-handle resize-handle" title="Drag to rotate overlay"><RotateCw size={12} /></span>
                      </>
                    )}
                  </div>
                ))}
                {regionPreview && annotationLocked && <img className="region-result-preview" src={regionPreview} alt="Region edit comparison" draggable={false} />}
                {editingKey && currentRegionFrame && !annotationLocked && <RegionCanvas key={editingKey} frame={currentRegionFrame} targetKey={editingKey} sourceImageId={annotationSource(w,comp,editingKey)!} targetName={regionName(editingKey)} notes={regionNotes} editingNote={editingNote} saving={regionSaving}
                  onSave={async note => { await saveRegionNotes(regionNotes.some(n=>n.id===note.id) ? regionNotes.map(n=>n.id===note.id ? note : n) : [...regionNotes,note]); setEditingNote(null); }}
                  onDone={() => { setEditingKey(null); setEditingNote(null); if (compact && regionNotes.length) setMobilePanel("chat"); }} />}
                {canvasCommands.busy && <div className="generation-indicator" role="status"><LoaderCircle size={17} className="spin" />Pasting images…</div>}
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
          {!currentOverlay && !annotating && (image || asset) && <div className="canvas-context-tools" role="toolbar" aria-label="Image tools">
              {image && (
                <button
                  className="text-button"
                  title="Image framing: fit the original or fill the page"
                  disabled={annotationLocked || !!busyJob}
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
                  {comp.framing === "crop" ? "Fill image" : "Fit image"}
                </button>
              )}
            {asset && (
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
            )}
          </div>}
          {currentOverlay && !annotating && (
            <div className="overlay-inspector canvas-context-tools" role="toolbar" aria-label="Selected image tools">
              <span>
                <Layers size={15} />
                Asset placement
              </span>
              <label>
                Size
                <input
                  type="range"
                  aria-label="Placement size"
                  min="3"
                  disabled={currentOverlay.locked || canvasCommands.busy || annotationLocked || !!busyJob}
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
                  disabled={currentOverlay.locked || canvasCommands.busy || annotationLocked || !!busyJob}
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
                disabled={currentOverlay.locked || canvasCommands.busy || annotationLocked || !!busyJob}
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
                disabled={currentOverlay.locked || canvasCommands.busy || annotationLocked || !!busyJob}
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
          <div className="canvas-status" role="group" aria-label="Canvas status and controls">
            <div className="canvas-toolbar">
              <div className="button-row">
                <button
                  className="icon-button"
                  title="Undo layout or image change"
                  disabled={page.historyIndex === 0 || !!busyJob || annotationLocked || canvasCommands.busy}
                  onClick={() =>
                    canvasCommands.undo()
                  }
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="icon-button"
                  title="Redo"
                  disabled={
                    page.historyIndex >= page.history.length - 1 || !!busyJob || annotationLocked || canvasCommands.busy
                  }
                  onClick={() =>
                    canvasCommands.redo()
                  }
                >
                  <Redo2 size={17} />
                </button>
              </div>
              <div className="button-row">
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
            <span className="canvas-page-count" role="status" aria-label={asset ? "Asset workspace" : `${doc!.pages.findIndex(p => p.id === page.id) + 1} of ${doc!.pages.length} pages`}>
              <FileImage size={14} />
              <span className="page-count-full">{asset ? "Asset workspace" : `${doc!.pages.findIndex(p => p.id === page.id) + 1} of ${doc!.pages.length} pages`}</span>
              <span className="page-count-compact" aria-hidden="true">{asset ? "Asset" : `${doc!.pages.findIndex(p => p.id === page.id) + 1} / ${doc!.pages.length}`}</span>
            </span>
            <span className="canvas-image-resolution">
              {image
                ? `${image.width} × ${image.height} px${resolution ? ` · ${resolution} DPI at print size` : ""}`
                : "Ready for your first idea"}
            </span>
          </div>
        </section>
        <aside ref={chatRef} className="chat-panel" role={compact && mobilePanel === "chat" ? "dialog" : undefined} aria-label="Design conversation" tabIndex={-1}>
          <SheetHandle expanded={sheetExpanded} onExpand={setSheetExpanded} onDismiss={() => dismissSheet(() => setMobilePanel("canvas"))} />
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
            {compact && <button className="icon-button" data-sheet-close aria-label="Close Chat" onClick={() => dismissSheet(() => setMobilePanel("canvas"))}><X size={20}/></button>}
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
                {message.role === "user" ? <UserMessageText text={message.text} /> : <div className="message-text">{message.text}</div>}
                {message.templateRequest && <details className="template-record"><summary>Template: {message.templateRequest.template.name}</summary><pre>{message.templateRequest.instructions}</pre><button className="text-button" onClick={() => reuseRequest(message)}>Reuse these instructions</button></details>}
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
            {failedJob && !busyJob && !annotationLocked && (
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
                      reuseRequest(last);
                    }
                  }}
                >
                  Edit prompt & retry
                </button>
              </div>
            )}
            <div ref={end} />
            {page.editBatch && <RegionReview w={w} batch={page.editBatch} target={target} ratio={ratio} job={busyJob} onRefresh={onRefresh} onPreview={setRegionPreview} notify={notify}
              onDiscard={()=>{setPrompt(page.editBatch?.instructions || "");setReferences(page.editBatch?.references || []);setReferencePurposes(Object.fromEntries((page.editBatch?.referencePurposes || []).map(p=>[p.reference,p])));}} />}
          </div>
          <div className="composer">
            <div className="mode-switch">
              <button
                className={mode === "generate" ? "active" : ""}
                disabled={!!template && template.mode === "discuss"}
                onClick={() => setMode("generate")}
              >
                <Sparkles size={14} />
                Generate / Edit
              </button>
              <button
                className={mode === "discuss" ? "active" : ""}
                disabled={!!regionNotes.length || annotationLocked || (!!template && template.mode !== "discuss")}
                onClick={() => setMode("discuss")}
              >
                <MessageCircle size={14} />
                Discuss
              </button>
            </div>
            <div className="prompt-box">
              {!!regionNotes.length && <div className="reference-chips region-edit-pills" aria-label="Region edit instructions">{regionNotes.map((note,index) => <span key={note.id} className={annotationSource(w,comp,note.targetKey) !== note.sourceImageId ? "stale" : ""} title={`${regionName(note.targetKey)}: ${note.text}`}>
                <b>{index+1}</b><button className="region-pill-text" aria-label={`Edit instruction ${index+1}`} disabled={annotationLocked || regionSaving || !!busyJob} onClick={()=>void run(()=>beginRegionEdit(note.targetKey,note))}>{note.text}</button>
                <button aria-label={`Remove instruction ${index+1}`} disabled={annotationLocked || regionSaving || !!busyJob} onClick={()=>void run(async()=>{ await saveRegionNotes(regionNotes.filter(n=>n.id!==note.id)); if(regionNotes.length===1) {setEditingKey(null);setEditingNote(null);} })}><X size={12}/></button>
              </span>)}</div>}
              {regionNotes.some(n=>annotationSource(w,comp,n.targetKey)!==n.sourceImageId) && <p className="region-draft-warning">Source image changed. Open each highlighted instruction to review its area and update it.</p>}
              {regionNotes.some(n=>n.targetKey!==regionNotes[0]?.targetKey) && <p className="region-draft-warning">These older notes target several items. <button onClick={()=>void run(()=>saveRegionNotes([]))} disabled={annotationLocked || regionSaving}>Remove all region edits</button> to choose one item.</p>}
              {template && <TemplateComposer key={template.id + ":" + template.version} template={template} answers={templateAnswers} hasSubject={hasSubject} preview={requestPreview} previewError={previewError} showErrors={showTemplateErrors} current={currentTemplate} historicalSettings={historicalSettings}
                onAnswers={setTemplateAnswers} onRemove={() => { setTemplate(null); setTemplateAnswers({}); setShowTemplateErrors(false); }} onSettings={() => setHistoricalSettings("")}
                onLatest={() => { if (currentTemplate) { selectTemplate(currentTemplate); notify("Latest Template loaded; answers reset to defaults. References and additional instructions retained."); } }}
                onSubject={kind => { setPendingPurpose("Subject"); setPicker(kind); }}
                onImport={files => { setUploadsPending(c => c + 1); void run(async () => { try { for (const file of files) { const id = await importImageFile(file, orgId || null); const next = await api<Workspace>("get_workspace"); const version = next.assets.find(a => a.id === id)?.currentVersionId; if (!version) throw Error("Find the imported Subject in Uploads and attach it again."); setReferences(r => r.includes(version) ? r : [...r, version]); setReferencePurposes(p => ({ ...p, [version]: { reference: version, purpose: "Subject", explanation: "" } })); } await onRefresh(); } finally { setUploadsPending(c => c - 1); } }); }} />}
              {uploadsPending > 0 && <div className="job-progress" role="status"><LoaderCircle size={15} className="spin" />Adding pasted image…</div>}
              {references.length > 0 && (
                <div className="reference-chips">
                  {references.map((v) => {
                    const a = w.assets.find((a) =>
                      a.versions.some((version) => version.id === v),
                    );
                    const name = a?.name || "Page image";
                    return (
                      <span key={v} title={`${name} · ${referencePurposes[v]?.purpose || "Other"}`} data-purpose={referencePurposes[v]?.purpose || "Other"}>
                        <ImageView id={referenceImage(w, v)} />
                        <span className="reference-name">{name}</span>
                        <select className="reference-purpose" aria-label={`Purpose of ${name} reference`} value={referencePurposes[v]?.purpose || "Other"} onChange={e => setReferencePurposes(p => ({ ...p, [v]: { reference: v, purpose: e.target.value as ReferencePurpose["purpose"], explanation: p[v]?.explanation || "" } }))}>{["Subject", "Style", "Logo", "Other"].map(p => <option key={p}>{p}</option>)}</select>
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
                disabled={annotationLocked}
                value={prompt}
                onPaste={(event) => {
                  const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
                  if (!files.length) return;
                  event.preventDefault();
                  if (files.some(file => !["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
                    notify("Paste a PNG, JPEG or WebP image.");
                    return;
                  }
                  setUploadsPending(count => count + 1);
                  void run(async () => {
                    try {
                      for (const file of files) {
                        const id = await importImageFile(file, orgId || null);
                        const next = await api<Workspace>("get_workspace");
                        const version = next.assets.find(item => item.id === id)?.currentVersionId;
                        await onRefresh();
                        if (!version) throw Error("The pasted image was uploaded but could not be attached. Find it in Uploads.");
                        setReferences(current => current.includes(version) ? current : [...current, version]);
                      }
                    } finally {
                      setUploadsPending(count => count - 1);
                    }
                  });
                }}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  const command = e.target.value.match(/\/(asset|upload|templates)\s*$/);
                  if (command?.[1] === "templates") { setShowTemplatePicker(true); setPrompt(e.target.value.replace(/\/templates\s*$/, "")); }
                  else if (command) setPicker(command[1] as "asset" | "upload");
                }}
                placeholder={template ? "Additional instructions (optional; change configured values in Edit details)…" :
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
                  Type <b>/asset</b>, <b>/upload</b> or <b>/templates</b>
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
                    disabled={submitting || annotationLocked || regionSaving || regionNotes.some(n=>n.targetKey!==regionNotes[0]?.targetKey || annotationSource(w,comp,n.targetKey)!==n.sourceImageId) || (!prompt.trim() && !template && !regionNotes.length) || uploadsPending > 0 || canvasCommands.busy || !!historicalSettings}
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
      {compact && <nav className="mobile-editor-views" aria-label="Editor view">
        {([ ["canvas", "Canvas", Square], ["chat", "Chat", MessageCircle], ["tools", "Tools", Layers], ["pages", "Pages", FileImage] ] as const).map(([id, label, Icon]) => (
          <button key={id} aria-label={label} title={id === "chat" && jobStatus ? `Chat · ${jobStatus}` : label} aria-pressed={mobilePanel === id} onClick={event => { event.currentTarget.focus(); if (id === "canvas") dismissSheet(() => setMobilePanel("canvas")); else setMobilePanel(id); }}>
            <Icon size={20}/><span>{label}</span>{id === "chat" && jobStatus && <span className="job-badge" role="status" aria-label={jobStatus}>{jobStatus}</span>}
          </button>
        ))}
      </nav>}
      {compact && mobilePanel !== "canvas" && <div className="editor-sheet-backdrop" aria-hidden="true" onClick={() => dismissSheet(() => setMobilePanel("canvas"))} />}
      {moreOpen && <Modal title="Document" className="document-menu" onClose={() => dismissSheet(() => setMoreOpen(false))}>
        <div className="document-identity"><strong>{doc?.name || asset?.name}</strong><p>{project?.name || (asset && libraryKind(asset) === "upload" ? "Uploads" : "Asset library")}</p><p>{doc ? `${doc.width} × ${doc.height} ${doc.unit} · ${doc.pages.length} pages` : image ? `${image.width} × ${image.height} px` : "No image yet"}</p><span role="status">{layoutSaving || regionSaving ? "Saving…" : saveError ? "Save failed" : "All changes saved"}</span></div>
        <div className="document-command-group">
          <button onClick={() => dismissSheet(() => { setMoreOpen(false); onEdit(); })}><Pencil size={19}/>Rename and manage</button>
          {comp.imageId && <button onClick={() => dismissSheet(() => { setMoreOpen(false); void useInNew(); })}><ImagePlus size={19}/>Use in new design</button>}
          {asset && <button onClick={() => dismissSheet(() => { setMoreOpen(false); replacement.current?.click(); })}><Upload size={19}/>Replace image</button>}
        </div>
        {comp.imageId && <div className="document-command-group">
          <button onClick={() => { setMoreOpen(false); saveTemplate(); }}><FileImage size={19}/>Save as template</button>
          {doc && <button onClick={() => { setMoreOpen(false); setExtracting(true); }}><Sparkles size={19}/>Extract asset</button>}
        </div>}
        <div className="document-command-group">
          <button onClick={() => { setMoreOpen(false); setPanel("history"); setDrawerOpen(true); if (compact) setMobilePanel("tools"); }}><History size={19}/>Revision history</button>
          <button onClick={() => { setMoreOpen(false); if (compact) setMobilePanel("pages"); else setPanel("pages"); setDrawerOpen(true); }}><FileImage size={19}/>{doc ? "View pages" : "View workspace"}</button>
          <button disabled={!comp.imageId && !overlays.length} onClick={openExport}><ArrowDownToLine size={19}/>Export files</button>
        </div>
      </Modal>}
      {templateSource && <TemplateForm w={w} act={act} orgId={orgId} source={templateSource} onClose={() => closeFloating(() => setTemplateSource(null))} onRefresh={onRefresh} />}
      {showTemplatePicker && <Modal title="Templates" onClose={() => closeFloating(() => setShowTemplatePicker(false))} wide><Templates w={w} orgId={orgId} act={act} onRefresh={onRefresh} onSelect={selectTemplate} /></Modal>}
      {picker && (
        <AssetPicker
          w={w}
          orgId={orgId}
          kind={picker}
          onReference={addReference}
          onPageReference={addPageReference}
          onPlace={doc ? placeAsset : undefined}
          onClose={() => closeFloating(() => { setPicker(null); setPendingPurpose(undefined); })}
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
          onClose={() => { const restore = () => { setShowExport(false); setExportBusy(false); setMobilePanel(exportReturnPanel); }; if (exportReturnPanel === "canvas") dismissSheet(restore); else restore(); }}
          onBusyChange={setExportBusy}
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
  onReference: (id: string, purpose?: ReferencePurpose["purpose"]) => void;
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
    .sort(newestFirst)
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
