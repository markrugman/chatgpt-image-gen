import type { ServerStatus } from "./ServerSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import { listen, isBrowser } from "./api";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  FileImage,
  Folder,
  FolderOpen,
  Grid2X2,
  Images,
  LayoutGrid,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { api, clearImageCache, importImageFile } from "./api";
import {
  emptyWorkspace,
  libraryKind,
  type Connection,
  type Job,
  type Workspace,
} from "./types";
import {
  Empty,
  Modal,
  useCompactLayout,
  PageHeading,
  SectionHeading,
  type Act,
  type CreateOptions,
} from "./ui";
import { AssetCard, DocumentCard, ProjectCard, SearchResults } from "./cards";
import { CreateDialog, EditDialog, SettingsDialog } from "./dialogs";
import { Editor } from "./Editor";
import "./App.css";

function readNavigation() {
  const params = new URLSearchParams(isBrowser ? window.location.hash.slice(1) : "");
  const view = params.get("view") || "home";
  return {
    route: ["home", "projects", "assets", "uploads", "trash"].includes(view) ? view : "home",
    orgId: params.get("org") || "all",
    projectId: params.get("project"),
    docId: params.get("design"),
    assetId: params.get("asset"),
    pageId: params.get("page"),
    libraryScope: params.get("library") === "shared" ? "shared" : "owned",
  };
}

export default function App() {
  const [initialNavigation] = useState(readNavigation);
  const compact = useCompactLayout();
  const [navigationOpen, setNavigationOpen] = useState(false);
  useEffect(() => { if (!compact) setNavigationOpen(false); }, [compact]);
  const [w, setW] = useState<Workspace>(emptyWorkspace),
    [loaded, setLoaded] = useState(false);
  const [route, setRoute] = useState(initialNavigation.route),
    [orgId, setOrgId] = useState(initialNavigation.orgId),
    [projectId, setProjectId] = useState(initialNavigation.projectId);
  const [docId, setDocId] = useState(initialNavigation.docId),
    [assetId, setAssetId] = useState(initialNavigation.assetId),
    [pageId, setPageId] = useState(initialNavigation.pageId);
  const [query, setQuery] = useState(""),
    [jobs, setJobs] = useState<Job[]>([]),
    [connection, setConnection] = useState<Connection | null>(null),
    [connectionError, setConnectionError] = useState("");
  const [creating, setCreating] = useState<CreateOptions | null>(null),
    [settings, setSettings] = useState<boolean | "chatgpt" | "server">(false),
    [editing, setEditing] = useState<{
      kind: string;
      id: string;
      name: string;
      tags: string[];
    } | null>(null);
  const [storage, setStorage] = useState<ServerStatus|null>(null);
  const [toast, setToast] = useState("");
  const [libraryScope, setLibraryScope] = useState(initialNavigation.libraryScope);
  const [libraryRequest, setLibraryRequest] = useState<{kind: "assets" | "uploads"} | null>(null);
  const historyReady = useRef(false);
  useEffect(() => {
    if (!isBrowser) return;
    const restore = () => {
      const next = readNavigation();
      setRoute(next.route); setOrgId(next.orgId); setProjectId(next.projectId);
      setDocId(next.docId); setAssetId(next.assetId); setPageId(next.pageId);
      setLibraryScope(next.libraryScope); setQuery(""); setNavigationOpen(false);
      setCreating(null); setEditing(null); setSettings(false); setLibraryRequest(null);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!isBrowser) return;
    const params = new URLSearchParams({ view: route });
    for (const [key, value] of [
      ["org", orgId === "all" ? null : orgId], ["project", projectId],
      ["design", docId], ["asset", assetId], ["page", docId || assetId ? pageId : null],
      ["library", libraryScope === "shared" ? "shared" : null],
    ]) if (value) params.set(key!, value);
    const hash = `#${params}`;
    if (!historyReady.current) {
      window.history.replaceState(null, "", hash);
      historyReady.current = true;
    } else if (window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }
  }, [route, orgId, projectId, docId, assetId, pageId, libraryScope]);
  const searchRef = useRef<HTMLInputElement>(null),
    uploadRef = useRef<HTMLInputElement>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  const refresh = useCallback(async () => {
    const next = await api<Workspace>("get_workspace");
    setW(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    setStorage(await api<ServerStatus>("server_status"));
    setLoaded(true);
  }, []);
  const completedJobs = useRef(new Set<string>());
  const refreshJobs = useCallback(async () => {
    const next = await api<Job[]>("get_jobs");setJobs(next);
    const newlyFinished = next.filter(j => ["completed","failed","cancelled"].includes(j.status) && !completedJobs.current.has(j.id));
    for(const job of newlyFinished)completedJobs.current.add(job.id);
    if(isBrowser && newlyFinished.length)await refresh();
  }, [refresh]);
  const checkConnection = useCallback(async () => {
    try {
      setConnection(await api<Connection>("connection"));
      setConnectionError("");
    } catch (e) {
      setConnectionError(String(e));
      setConnection(null);
    }
  }, []);
  const act: Act = useCallback(
    async <T,>(action: Record<string, unknown>) => {
      const result = await api<T>("mutate", { action: { ...action, _base: w } });
      await refresh();
      return result;
    },
    [refresh, w],
  );
  const run = useCallback(
    async (work: () => Promise<unknown>) => {
      try {
        await work();
      } catch (e) {
        notify(String(e));
      }
    },
    [notify],
  );
  const openDocument = useCallback((id: string, page?: string) => {
    setDocId(id);
    setAssetId(null);
    setPageId(page || null);
    setQuery("");
  }, []);
  const openAsset = (id: string) => {
    setAssetId(id);
    setDocId(null);
    setPageId(null);
    setQuery("");
  };
  useEffect(() => {
    run(refresh);
    run(refreshJobs);
    checkConnection();
    const unlisteners = [
      listen("workspace-changed", () => run(refresh)),
      listen("jobs-changed", () => run(refreshJobs)),
      listen("login-completed", () => checkConnection()),
      listen<{ documentId: string; pageId: string }>("open-document", (e) => {
        run(refresh);
        openDocument(e.payload.documentId, e.payload.pageId);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, [refresh, refreshJobs, checkConnection, openDocument, run]);
  useEffect(() => {
    let pointerDown = false, polling = false;
    const down = () => {pointerDown = true;};
    const up = () => {pointerDown = false;};
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    const timer = setInterval(async () => {
      if (polling || pointerDown || window.document.hidden || creating || editing || settings || window.document.querySelector('dialog[open], [role="dialog"], .modal-backdrop') || ["INPUT","TEXTAREA","SELECT"].includes(window.document.activeElement?.tagName || "") || jobs.some(j => ["starting","running","cancelling"].includes(j.status))) return;
      polling = true;
      try {const status = await api<{connected:boolean}>("server_status");if(status.connected) await refresh();} catch {} finally {polling = false;}
    }, 5000);
    return () => {clearInterval(timer);window.removeEventListener("pointerdown",down);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",up);};
  }, [creating, editing, settings, jobs, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setDocId(null);
        setAssetId(null);
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const document = w.documents.find((d) => d.id === docId && !d.deletedAt),
    asset = w.assets.find((a) => a.id === assetId && !a.deletedAt),
    editor = !!document || !!asset;
  const organisation = w.organisations.find((o) => o.id === orgId);
  const visibleProjects = w.projects.filter(
    (p) => !p.deletedAt && (orgId === "all" || p.organisationId === orgId),
  );
  const docs = w.documents.filter(
    (d) =>
      !d.deletedAt &&
      visibleProjects.some((p) => p.id === d.projectId) &&
      (!projectId || d.projectId === projectId),
  );
  const assets = w.assets.filter(
    (a) =>
      !a.deletedAt &&
      (route === "uploads" ? libraryKind(a) === "upload" : libraryKind(a) === "asset") &&
      (libraryScope === "shared" ? !a.organisationId : orgId === "all" || a.organisationId === orgId),
  );
  const navigate = (to: string) => {
    setRoute(to);
    setLibraryScope("owned");
    setDocId(null);
    setAssetId(null);
    setProjectId(null);
    setQuery("");
  };
  const switchOrganisation = (id: string) => {
    setOrgId(id);
    if (editor) setRoute(document ? "projects" : asset && libraryKind(asset) === "upload" ? "uploads" : "assets");
    setDocId(null);
    setAssetId(null);
    setPageId(null);
    setProjectId(null);
    setLibraryRequest(null);
  };
  const create = (options: CreateOptions) => {
    if (
      !w.organisations.length &&
      ["document", "project"].includes(options.kind)
    )
      setCreating({ kind: "organisation" });
    else setCreating(options);
  };
  const edit = (
    kind: string,
    item: { id: string; name: string; tags?: string[] },
  ) =>
    setEditing({ kind, id: item.id, name: item.name, tags: item.tags || [] });
  const sidebar = (
    <aside className="sidebar" onClick={(event) => {
      if (compact && (event.target as HTMLElement).closest("button")) setNavigationOpen(false);
    }}>
        <button
          className="brand"
          onClick={() => navigate("home")}
          title="Image Gen home"
        >
          <span className="brand-symbol">
            <Sparkles size={22} />
          </span>
          <span>
            image<span className="brand-weight">gen</span>
            <small>YOUR CREATIVE WORKSPACE</small>
          </span>
        </button>
        <button
          className="sidebar-create"
          onClick={() =>
            create({ kind: "document", projectId: projectId || undefined })
          }
        >
          <Plus size={18} />
          <span>Create a design</span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            { id: "home", name: "Overview", icon: LayoutGrid },
            { id: "projects", name: "Projects", icon: FolderOpen },
            { id: "assets", name: "Asset library", icon: Images },
            { id: "uploads", name: "Uploads", icon: Upload },
          ].map((item) => (
            <button
              key={item.id}
              className={`nav-item ${!editor && route === item.id ? "selected" : ""}`}
              onClick={() => editor && (item.id === "assets" || item.id === "uploads") ? setLibraryRequest({kind: item.id}) : navigate(item.id)}
              title={item.name}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
              {["assets", "uploads"].includes(item.id) && (
                <b>{w.assets.filter((a) => !a.deletedAt && libraryKind(a) === (item.id === "uploads" ? "upload" : "asset") && (orgId === "all" || a.organisationId === orgId)).length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label org-label">
          ORGANISATIONS
          <button
            className="icon-button"
            aria-label="Add organisation"
            onClick={() => create({ kind: "organisation" })}
          >
            <Plus size={15} />
          </button>
        </div>
        <button
          className={`org-item ${orgId === "all" ? "selected" : ""}`}
          onClick={() => {
            switchOrganisation("all");
          }}
          title="All organisations"
        >
          <span className="org-avatar all">
            <Grid2X2 size={14} />
          </span>
          <span>All organisations</span>
        </button>
        {w.organisations.map((org) => (
          <button
            key={org.id}
            className={`org-item ${orgId === org.id ? "selected" : ""}`}
            onClick={() => {
              switchOrganisation(org.id);
            }}
            title={org.name}
          >
            <span
              className="org-avatar"
              style={{ color: org.color, background: `${org.color}16` }}
            >
              {org.name.slice(0, 2).toUpperCase()}
            </span>
            <span>{org.name}</span>
          </button>
        ))}
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => navigate("trash")}
            title="Trash"
          >
            <Trash2 size={18} />
            <span>Trash</span>
          </button>
          <button
            className="nav-item"
            onClick={() => setSettings(true)}
            title="Settings"
          >
            <Settings2 size={18} />
            <span>Settings & backup</span>
          </button>
          <button
            className="connection-card"
            onClick={() => setSettings("chatgpt")}
            title="ChatGPT connection"
          >
            <span
              className={`status-dot ${connection?.account?.type === "chatgpt" ? "online" : ""}`}
            />
            <span>
              <strong>
                {connection?.account?.type === "chatgpt"
                  ? "ChatGPT connected"
                  : "Connect ChatGPT"}
              </strong>
              <small>
                {connection?.account?.planType
                  ? `${connection.account.planType} plan · Ready to create`
                  : "Your account, your creativity"}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
          <button
            className="connection-card"
            onClick={() => setSettings("server")}
            title="Workspace server connection"
          >
            <span className={`status-dot ${storage?.online ? "online" : ""}`} />
            <span>
              <strong>{storage?.connected ? (storage.online ? "Server connected" : "Server offline") : "Local workspace"}</strong>
              <small>{storage?.connected ? `${storage.name}${storage.pending ? ` · ${storage.pending} unsent` : ""}` : "Saved on this computer"}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
  );
  return (
    <div className={`app ${isBrowser ? "browser-app" : ""} ${editor ? "editor-open" : ""}`}>
      <input
        type="file"
        ref={uploadRef}
        hidden
        aria-label="Upload image file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            run(async () => {
              await importImageFile(file, libraryScope === "shared" || orgId === "all" ? null : orgId);
              await refresh();
              notify("Image added to Uploads");
              navigate("uploads");
              if (libraryScope === "shared") setLibraryScope("shared");
            });
          e.target.value = "";
        }}
      />
      {compact ? (
        <>
          <header className="mobile-appbar">
            <button className="icon-button" aria-label="Open navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}><Menu size={22} /></button>
            <span className="mobile-brand"><Sparkles size={19} /> imagegen</span>
            <button className="icon-button" aria-label="Create a design" onClick={() => create({ kind: "document", projectId: projectId || undefined })}><Plus size={22} /></button>
          </header>
          {navigationOpen && <div className="mobile-navigation"><Modal title="Workspace navigation" onClose={() => setNavigationOpen(false)}><div className="form-body">{sidebar}</div></Modal></div>}
        </>
      ) : sidebar}
      <main className="main">
        {editor ? (
          <Editor
            key={
              document
                ? `${document.id}:${pageId || document.pages[0].id}`
                : asset!.id
            }
            w={w}
            doc={document}
            asset={asset}
            pageId={pageId}
            libraryRequest={libraryRequest}
            jobs={jobs}
            act={act}
            run={run}
            notify={notify}
            onPage={setPageId}
            onBack={() => {
              setDocId(null);
              setAssetId(null);
            }}
            onEdit={() =>
              edit(document ? "document" : "asset", document || asset!)
            }
            onNew={(sourceImageId) =>
              create({
                kind: "document",
                sourceImageId,
                sourceDocumentId: document?.id,
                projectId: document?.projectId,
              })
            }
            onOpenAsset={(id) => {
              setDocId(null);
              setAssetId(id);
              setPageId(null);
            }}
            onRefresh={refresh}
          />
        ) : (
          <>
            <header className="topbar">
              <div className="workspace-breadcrumb">
                <span
                  className="tiny-dot"
                  style={{ background: organisation?.color || "#8864d7" }}
                />
                <select aria-label="Current organisation" value={orgId} onChange={e => switchOrganisation(e.target.value)}>
                  <option value="all">All organisations</option>
                  {w.organisations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div className="topbar-right">
                <div className="search-box">
                  <Search size={16} />
                  <input
                    ref={searchRef}
                    aria-label="Search workspace"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search designs, projects, assets…"
                  />
                  <kbd>Ctrl K</kbd>
                </div>
                <button
                  className="icon-button"
                  title="Settings and help"
                  onClick={() => setSettings(true)}
                >
                  <CircleHelp size={19} />
                </button>
                <div className="user-avatar">M</div>
              </div>
            </header>
            <div className="workspace-content">
              {!loaded ? (
                <div className="loading-state">
                  <LoaderCircle className="spin" />
                  Opening your workspace…
                </div>
              ) : query ? (
                <SearchResults
                  w={w}
                  orgId={orgId}
                  query={query}
                  onDocument={openDocument}
                  onAsset={openAsset}
                  onProject={(id) => {
                    setProjectId(id);
                    setRoute("projects");
                    setQuery("");
                  }}
                />
              ) : route === "trash" ? (
                <>
                  <PageHeading
                    eyebrow="A LITTLE ROOM TO CHANGE YOUR MIND"
                    title="Trash"
                    subtitle="Deleted work stays here until you restore it."
                  />
                  <div className="list-card">
                    {[
                      ...w.projects
                        .filter((p) => p.deletedAt)
                        .map((p) => ({ ...p, kind: "project" })),
                      ...w.documents
                        .filter((d) => d.deletedAt)
                        .map((d) => ({ ...d, kind: "document" })),
                      ...w.assets
                        .filter((a) => a.deletedAt)
                        .map((a) => ({ ...a, kind: "asset" })),
                    ].map((item) => (
                      <div className="trash-row" key={item.id}>
                        <Trash2 size={18} />
                        <div>
                          <strong>{item.name}</strong>
                          <small>{item.kind}</small>
                        </div>
                        <button
                          className="button secondary small"
                          onClick={() =>
                            run(() =>
                              act({
                                op: "restore",
                                kind: item.kind,
                                id: item.id,
                              }),
                            )
                          }
                        >
                          <Undo2 size={15} />
                          Restore
                        </button>
                      </div>
                    ))}
                    {![...w.projects, ...w.documents, ...w.assets].some(
                      (i) => i.deletedAt,
                    ) && (
                      <Empty
                        icon={<Trash2 />}
                        title="Nothing in Trash"
                        text="Your deleted projects, designs, and assets will appear here."
                      />
                    )}
                  </div>
                </>
              ) : (route === "assets" || route === "uploads") ? (
                <>
                  <PageHeading
                    eyebrow={route === "uploads" ? "YOUR IMPORTED IMAGES" : "YOUR REUSABLE INGREDIENTS"}
                    title={route === "uploads" ? "Uploads" : "Asset library"}
                    subtitle={route === "uploads" ? "Your original images, ready to reference or place." : "Keep your logos exact. Give your next idea a head start."}
                    action={
                      <div className="button-row">
                        <button
                          className="button secondary"
                          onClick={() => uploadRef.current?.click()}
                        >
                          <Upload size={16} />
                          Upload image
                        </button>
                        {route === "assets" && <button
                          className="button primary"
                          onClick={() => create({ kind: "asset" })}
                        >
                          <Sparkles size={16} />
                          Create asset
                        </button>}
                      </div>
                    }
                  />
                  <div className="info-strip">
                    <ShieldCheck size={18} />
                    <span>
                      <strong>Originals stay original.</strong> Use an asset as
                      a generation reference, or place it unchanged on your
                      design.
                    </span>
                  </div>
                  <div className="filter-tabs" aria-label="Library scope">
                    <button className={libraryScope === "owned" ? "active" : ""} onClick={() => setLibraryScope("owned")}>{orgId === "all" ? "All organisations" : organisation?.name}</button>
                    <button className={libraryScope === "shared" ? "active" : ""} onClick={() => setLibraryScope("shared")}>Shared</button>
                  </div>
                  <div className="asset-grid">
                    {assets.map((a) => (
                      <AssetCard
                        key={a.id}
                        asset={a}
                        w={w}
                        onOpen={() => openAsset(a.id)}
                        onEdit={() => edit("asset", a)}
                      />
                    ))}
                  </div>
                  {!assets.length && (
                    <Empty
                      icon={<Images />}
                      title="A home for your creative essentials"
                      text={route === "uploads" ? "Upload an image to use in your designs." : "Generate artwork or save an upload as an asset."}
                      action={
                        <button
                          className="button primary"
                          onClick={() => route === "uploads" ? uploadRef.current?.click() : create({ kind: "asset" })}
                        >
                          <Plus size={16} />
                          {route === "uploads" ? "Upload your first image" : "Create your first asset"}
                        </button>
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  <PageHeading
                    eyebrow={
                      route === "home"
                        ? "A LITTLE INSPIRATION. ENDLESS POSSIBILITIES."
                        : "KEEP EVERY IDEA IN ITS PLACE"
                    }
                    title={
                      route === "home"
                        ? "Let’s make something great."
                        : projectId
                          ? visibleProjects.find((p) => p.id === projectId)
                              ?.name || "Project"
                          : "Your projects"
                    }
                    subtitle={
                      route === "home"
                        ? "Your organisations, projects, and creative work. All together."
                        : "One place for every campaign, event, and new idea."
                    }
                    action={
                      <button
                        className="button secondary"
                        onClick={() => create({ kind: "project" })}
                      >
                        <Folder size={16} />
                        New project
                      </button>
                    }
                  />
                  {route === "home" && (
                    <section className="creative-hero">
                      <div className="hero-copy">
                        <span className="hero-pill">
                          <Sparkles size={13} />
                          FROM A THOUGHT TO A FINISHED DESIGN
                        </span>
                        <h2>
                          Your next idea
                          <br />
                          starts with a conversation.
                        </h2>
                        <p>
                          Describe it. Refine it. Make it yours.
                          <br />
                          Create beautiful images with your ChatGPT account.
                        </p>
                        <button
                          className="button primary"
                          onClick={() => create({ kind: "document" })}
                        >
                          Create a design
                          <ArrowUpRight size={17} />
                        </button>
                      </div>
                      <div className="hero-art" aria-hidden="true">
                        <div className="hero-orbit orbit-one" />
                        <div className="hero-orbit orbit-two" />
                        <div className="paper paper-back">
                          <div className="paper-back-line" />
                          <div className="paper-back-circle" />
                        </div>
                        <div className="paper paper-front">
                          <span>
                            MAKE
                            <br />
                            SOMETHING
                            <br />
                            <i>unexpected.</i>
                          </span>
                          <div className="abstract-flower">✳</div>
                          <small>YOUR IDEA. YOUR CREATIVE DIRECTION.</small>
                        </div>
                        <div className="floating-label">
                          <WandSparkles size={15} />A little prompt. A lot of
                          possibility.
                        </div>
                        <span className="art-spark one">✦</span>
                        <span className="art-spark two">✧</span>
                      </div>
                    </section>
                  )}
                  {(!projectId || route === "home") && (
                    <>
                      <SectionHeading
                        title="Projects"
                        count={visibleProjects.length}
                        action={
                          <button
                            className="text-button"
                            onClick={() => {
                              setRoute("projects");
                              setProjectId(null);
                            }}
                          >
                            View all
                            <ArrowRight size={15} />
                          </button>
                        }
                      />
                      <div className="project-grid">
                        {visibleProjects.map((p) => (
                          <ProjectCard
                            key={p.id}
                            project={p}
                            w={w}
                            onOpen={() => {
                              setProjectId(p.id);
                              setRoute("projects");
                            }}
                            onEdit={() => edit("project", p)}
                          />
                        ))}
                        <button
                          className="new-project-card"
                          onClick={() => create({ kind: "project" })}
                        >
                          <span>
                            <Plus size={22} />
                          </span>
                          <strong>Start a new project</strong>
                          <small>A space for your next big idea</small>
                        </button>
                      </div>
                    </>
                  )}
                  <SectionHeading
                    title={
                      projectId ? "Designs in this project" : "Recent designs"
                    }
                    count={docs.length}
                    action={
                      <button
                        className="text-button"
                        onClick={() =>
                          create({
                            kind: "document",
                            projectId: projectId || undefined,
                          })
                        }
                      >
                        <Plus size={16} />
                        New design
                      </button>
                    }
                  />
                  <div className="document-grid">
                    {[...docs]
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .map((d) => (
                        <DocumentCard
                          key={d.id}
                          doc={d}
                          w={w}
                          jobs={jobs}
                          onOpen={() => openDocument(d.id)}
                          onEdit={() => edit("document", d)}
                        />
                      ))}
                  </div>
                  {!docs.length && (
                    <Empty
                      icon={<FileImage />}
                      title={
                        projectId
                          ? "This project is ready for its first design"
                          : "Your ideas belong here"
                      }
                      text="Create a poster, social post, or something entirely your own. Every design has its own conversation."
                      action={
                        <button
                          className="button secondary"
                          onClick={() =>
                            create({
                              kind: "document",
                              projectId: projectId || undefined,
                            })
                          }
                        >
                          <Plus size={16} />
                          Create a design
                        </button>
                      }
                    />
                  )}
                </>
              )}
            </div>
            <footer className="workspace-footer">
              <span>
                <ShieldCheck size={13} />
                Saved on this computer
              </span>
              <span>Made for your imagination.</span>
            </footer>
          </>
        )}
      </main>
      {creating && (
        <CreateDialog
          options={creating}
          w={w}
          orgId={orgId}
          act={act}
          onClose={() => setCreating(null)}
          onCreated={(kind, id) => {
            setCreating(null);
            if (kind === "document") openDocument(id);
            else if (kind === "asset") openAsset(id);
            else if (kind === "organisation") {
              setOrgId(id);
              navigate("home");
            } else {
              setProjectId(id);
              setRoute("projects");
              setDocId(null);
              setAssetId(null);
            }
          }}
          notify={notify}
        />
      )}
      {editing && (
        <EditDialog
          item={editing}
          w={w}
          act={act}
          onTransferred={id => { setOrgId(id); navigate("home"); }}
          onClose={() => setEditing(null)}
          notify={notify}
        />
      )}
      {settings && (
        <SettingsDialog
          panel={settings === "chatgpt" || settings === "server" ? settings : undefined}
          connection={connection}
          error={connectionError}
          onClose={() => setSettings(false)}
          onConnection={checkConnection}
          onRefresh={async () => {
            clearImageCache();
            await refresh();
            setDocId(null);
            setAssetId(null);
            setPageId(null);
            setProjectId(null);
            setOrgId("all");
            setRoute("home");
          }}
          notify={notify}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

