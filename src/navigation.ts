import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { libraryKind, type Workspace } from "./types";

export function readNavigation(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const view = params.get("view") || "home";
  return {
    route: ["home", "projects", "assets", "uploads", "templates", "trash"].includes(view) ? view : "home",
    orgId: params.get("org") || "all",
    projectId: params.get("project"), docId: params.get("design"),
    assetId: params.get("asset"), pageId: params.get("page"),
    libraryScope: params.get("library") === "shared" ? "shared" : "owned",
    query: params.get("q") || "",
    searchType: ["project", "document", "asset", "upload"].includes(params.get("type") || "") ? params.get("type")! : "all",
    templateFolder: params.get("folder") || "all",
    templateQuery: params.get("filter") || "",
    templateId: params.get("template"),
  };
}
export type Navigation = ReturnType<typeof readNavigation>;

export function navigationHash(n: Navigation) {
  const params = new URLSearchParams({ view: n.route });
  for (const [key, value] of [
    ["org", n.orgId === "all" ? null : n.orgId], ["project", n.projectId],
    ["design", n.docId], ["asset", n.assetId], ["page", n.pageId],
    ["library", n.libraryScope === "shared" ? "shared" : null], ["q", n.query],
    ["type", n.searchType === "all" ? null : n.searchType],
    ["folder", n.templateFolder === "all" ? null : n.templateFolder],
    ["filter", n.templateQuery], ["template", n.templateId],
  ]) if (value) params.set(key!, value);
  return `#${params}`;
}

export function validNavigation(input: Navigation, w: Workspace | null): Navigation {
  const n = { ...input };
  if (!w) return n;
  const organisations = w.organisations.filter(o => !o.deletedAt);
  const projects = w.projects.filter(p => !p.deletedAt && organisations.some(o => o.id === p.organisationId));
  if (n.orgId !== "all" && !organisations.some(o => o.id === n.orgId)) n.orgId = "all";
  const doc = w.documents.find(d => d.id === n.docId && !d.deletedAt && projects.some(p => p.id === d.projectId));
  const asset = w.assets.find(a => a.id === n.assetId && !a.deletedAt && (!a.organisationId || organisations.some(o => o.id === a.organisationId)));
  if (doc) {
    const project = projects.find(p => p.id === doc.projectId)!;
    n.route = "projects"; n.projectId = project.id; n.assetId = null;
    if (n.orgId !== "all") n.orgId = project.organisationId;
    n.pageId = doc.pages.some(p => p.id === n.pageId) ? n.pageId : doc.pages[0]?.id || null;
  } else if (asset) {
    n.route = libraryKind(asset) === "upload" ? "uploads" : "assets";
    n.docId = null; n.projectId = null; n.pageId = null;
    if (!asset.organisationId) n.libraryScope = "shared";
    else { n.libraryScope = "owned"; if (n.orgId !== "all") n.orgId = asset.organisationId; }
  } else { n.docId = null; n.assetId = null; n.pageId = null; }
  const project = projects.find(p => p.id === n.projectId);
  if (n.route !== "projects" || !project) n.projectId = null;
  else if (n.orgId !== "all") n.orgId = project.organisationId;
  if (n.route === "templates") {
    const all = n.orgId === "all" && n.libraryScope === "owned";
    const owner = n.libraryScope === "shared" || n.orgId === "all" ? null : n.orgId;
    if (n.templateFolder !== "all" && n.templateFolder !== "general" && !(w.templateFolders || []).some(f => f.id === n.templateFolder && (all || f.organisationId === owner))) n.templateFolder = "all";
    if (!(w.templates || []).some(t => t.id === n.templateId && !t.deletedAt && (all || t.organisationId === owner))) n.templateId = null;
  } else { n.templateFolder = "all"; n.templateQuery = ""; n.templateId = null; }
  if (!["assets", "uploads", "templates"].includes(n.route)) n.libraryScope = "owned";
  if (!n.query) n.searchType = "all";
  return n;
}

export function useNavigation(w: Workspace | null, enabled: boolean) {
  const [navigation, setNavigation] = useState(() => readNavigation(enabled ? window.location.hash : ""));
  const current = useRef(navigation);
  current.current = navigation;
  const ready = useRef(false), replace = useRef(false), workspace = useRef(w);
  useEffect(() => {
    if (!enabled) return;
    const restore = () => {
      if (navigationHash(current.current) === window.location.hash) return;
      replace.current = true; setNavigation(readNavigation(window.location.hash));
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", restore); };
  }, [enabled]);
  useLayoutEffect(() => {
    const valid = validNavigation(navigation, w);
    const changedWorkspace = workspace.current !== w;
    workspace.current = w;
    if (navigationHash(valid) !== navigationHash(navigation)) {
      if (changedWorkspace) replace.current = true;
      setNavigation(valid); return;
    }
    if (!enabled) return;
    const hash = navigationHash(navigation);
    if (window.location.hash !== hash) {
      if (!ready.current || replace.current) window.history.replaceState(window.history.state, "", hash);
      else {
        const previous = readNavigation(window.location.hash);
        const searchOnly = navigationHash({ ...previous, query: navigation.query, templateQuery: navigation.templateQuery }) === hash;
        // Keep the first search entry, then replace it as the user continues typing.
        if (searchOnly && ((previous.query && navigation.query) || (previous.templateQuery && navigation.templateQuery))) window.history.replaceState(window.history.state, "", hash);
        else window.history.pushState({ imagegenPrevious: window.location.hash }, "", hash);
      }
    }
    ready.current = true; replace.current = false;
  }, [navigation, w, enabled]);
  const updateNavigation = useCallback((patch: Partial<Navigation>) => setNavigation(n => ({ ...n, ...patch })), []);
  const closeTemplate = useCallback(() => {
    const parent = navigationHash({ ...current.current, templateId: null });
    if (enabled && window.history.state?.imagegenPrevious === parent) window.history.back();
    else { replace.current = true; updateNavigation({ templateId: null }); }
  }, [enabled, updateNavigation]);
  return { navigation, updateNavigation, closeTemplate };
}
