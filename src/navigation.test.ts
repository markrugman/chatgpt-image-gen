import { describe, expect, it } from "vitest";
import { navigationHash, readNavigation, validNavigation } from "./navigation";
import { emptyWorkspace, type Workspace } from "./types";

const w = {
  ...emptyWorkspace,
  organisations: [{ id: "org", name: "Studio" }, { id: "deleted", deletedAt: 1 }],
  projects: [{ id: "project", organisationId: "org" }, { id: "deleted-project", organisationId: "org", deletedAt: 1 }],
  documents: [
    { id: "doc", projectId: "project", pages: [{ id: "one" }, { id: "two" }] },
    { id: "deleted-doc", projectId: "project", deletedAt: 1 },
    { id: "orphan", projectId: "deleted-project" },
  ],
  assets: [{ id: "upload", libraryKind: "upload", organisationId: "org" }, { id: "shared", organisationId: null }, { id: "hidden", organisationId: "deleted" }],
  templateFolders: [{ id: "folder", name: "Portraits", organisationId: "org" }, { id: "shared-folder", organisationId: null }],
  templates: [{ id: "template", organisationId: "org" }, { id: "trashed", organisationId: "org", deletedAt: 1 }],
} as unknown as Workspace;
const resolve = (hash: string) => navigationHash(validNavigation(readNavigation(hash), w));

describe("navigation destinations", () => {
  it("round-trips folder, detail and Unicode search links", () => {
    const n = { ...readNavigation("#view=templates&org=org&folder=folder&template=template"), templateQuery: "café & flowers", query: "a/b #2" };
    expect(readNavigation(navigationHash(n))).toEqual(n);
  });
  it("retains unvalidated targets until the workspace loads", () => {
    const n = readNavigation("#view=templates&folder=folder&template=template");
    expect(validNavigation(n, null)).toEqual(n);
  });
  it("resolves design parents and an invalid page to the first page", () => {
    expect(resolve("#view=home&org=wrong&design=doc&page=missing")).toBe("#view=projects&project=project&design=doc&page=one");
    expect(resolve("#view=projects&org=org&design=doc&page=two")).toBe("#view=projects&org=org&project=project&design=doc&page=two");
  });
  it.each(["missing", "deleted-doc", "orphan"])("recovers unavailable design %s", id => {
    expect(resolve(`#view=projects&design=${id}&page=two`)).toBe("#view=projects");
  });
  it("opens uploads in Uploads and shared assets in Shared", () => {
    expect(resolve("#view=home&asset=upload")).toBe("#view=uploads&asset=upload");
    expect(resolve("#view=home&asset=shared")).toBe("#view=assets&asset=shared&library=shared");
    expect(resolve("#view=assets&asset=hidden")).toBe("#view=assets");
  });
  it("restricts folders and template details to the selected scope", () => {
    expect(resolve("#view=templates&folder=folder&template=template")).toBe("#view=templates&folder=folder&template=template");
    expect(resolve("#view=templates&library=shared&folder=folder&template=template")).toBe("#view=templates&library=shared");
    expect(resolve("#view=templates&template=trashed")).toBe("#view=templates");
    expect(resolve("#view=templates&folder=general")).toBe("#view=templates&folder=general");
  });
  it("drops stale section parameters while preserving workspace search", () => {
    expect(resolve("#view=trash&project=project&page=one&library=shared&folder=folder&template=template&filter=portrait&q=Test")).toBe("#view=trash&q=Test");
    expect(resolve("#view=nonsense&org=deleted")).toBe("#view=home");
  });
});
