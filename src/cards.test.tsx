import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectCard, DocumentCard } from "./cards";
import { emptyWorkspace, type DesignDocument, type Workspace } from "./types";

vi.mock("./ui", () => ({
  ImageView: ({ id, ...props }: { id?: string }) => <img src={id} {...props} />,
  Empty: () => null,
  PageHeading: () => null,
}));

const overlay = { id: "rose", assetVersionId: "original", x: 20, y: 30, width: 40, height: 25, rotation: 12 };
const revision = { id: "generated", imageId: "fire", createdAt: 10, overlays: [], prompt: "", threadId: "", turnId: "", messages: [], parentRevisionId: null };
const doc: DesignDocument = {
  id: "firestarter", projectId: "halloween", name: "Fire Starter", width: 210, height: 297, unit: "mm",
  pages: [{ id: "page", name: "Page 1", messages: [], revisions: [revision], history: [{ imageId: "fire", revisionId: "generated", overlays: [overlay] }], historyIndex: 0, threadId: null, branchTurnId: null }],
  tags: [], updatedAt: 20, deletedAt: null, sourceDocumentId: null,
};
const w: Workspace = { ...emptyWorkspace, projects: [{ id: "halloween", name: "Halloween Docs", organisationId: "org", tags: [], deletedAt: null }], documents: [doc], assets: [{ id: "asset", name: "Rose", organisationId: "org", tags: [], versions: [{ id: "original", imageId: "rose-image", createdAt: 1 }, { id: "new", imageId: "new-rose", createdAt: 2 }], currentVersionId: "new", page: doc.pages[0], deletedAt: null }] };
const renderProject = (workspace = w) => renderToStaticMarkup(<ProjectCard project={w.projects[0]} w={workspace} onOpen={() => {}} onEdit={() => {}} />);

describe("project composition previews", () => {
  it("shows the same placed asset version and transform as the design card", () => {
    const project = renderProject();
    const design = renderToStaticMarkup(<DocumentCard doc={doc} w={w} jobs={[]} onOpen={() => {}} onEdit={() => {}} />);
    for (const html of [project, design]) {
      expect(html).toContain('src="rose-image"');
      expect(html).toContain('class="card-overlay"');
      expect(html).toContain('left:20%;top:30%;width:40%;height:25%;transform:rotate(12deg)');
      expect(html).not.toContain('src="new-rose"');
    }
    expect(project.match(/src="fire"/g)).toHaveLength(1);
  });

  it("uses the selected history state after undo, including removing all overlays", () => {
    const page = doc.pages[0];
    const undone = { ...doc, pages: [{ ...page, history: [{ imageId: "fire", revisionId: "generated", overlays: [] }, ...page.history], historyIndex: 0 }] };
    expect(renderProject({ ...w, documents: [undone] })).not.toContain('src="rose-image"');
  });

  it("shows current first-page compositions from the three latest modified designs", () => {
    const revisions = [revision, { ...revision, id: "old", imageId: "old", createdAt: 5, overlays: [overlay] }, { ...revision, id: "oldest", imageId: "oldest", createdAt: 1 }];
    const active = { ...doc, pages: [{ ...doc.pages[0], revisions }] };
    const single = renderProject({ ...w, documents: [active] });
    expect(single.match(/class="project-paper"/g)).toHaveLength(1);
    const another = (id: string, modifiedAt: number) => ({ ...doc, id, modifiedAt, pages: [{ ...doc.pages[0], history: [{ imageId: id, revisionId: null, overlays: [] }] }] });
    const html = renderProject({ ...w, documents: [active, another("older", 19000), another("latest", 21002), another("second", 21001), { ...another("deleted-image", 50000), deletedAt: 30 }] });
    expect(html.match(/class="project-paper"/g)).toHaveLength(3);
    expect(html.match(/src="rose-image"/g)).toHaveLength(1);
    expect(html.indexOf('src="latest"')).toBeLessThan(html.indexOf('src="second"'));
    expect(html.indexOf('src="second"')).toBeLessThan(html.indexOf('src="fire"'));
    for (const id of ["old", "oldest", "older"]) expect(html).not.toContain(`src="${id}"`);
    expect(html).not.toContain('src="deleted-image"');
  });

  it("shows only one preview per design even with multiple pages and revisions", () => {
    const multiPage = { ...doc, pages: [...doc.pages, { ...doc.pages[0], id: "page-2" }] };
    const html = renderProject({ ...w, documents: [multiPage] });
    expect(html.match(/class="project-paper"/g)).toHaveLength(1);
  });

  it("previews imported backgrounds and designs containing only placed images", () => {
    for (const imageId of ["imported", null]) {
      const imported = { ...doc, pages: [{ ...doc.pages[0], revisions: [], history: [{ imageId, revisionId: null, overlays: [overlay] }] }] };
      const html = renderProject({ ...w, documents: [imported] });
      expect(html).toContain('src="rose-image"');
      expect(html.match(/class="project-paper"/g)).toHaveLength(1);
    }
  });
});
