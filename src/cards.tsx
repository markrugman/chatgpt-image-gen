import type { HTMLAttributes } from "react";
import { modificationDate } from "./folderOrdering";
import {
  ChevronRight,
  FileImage,
  Folder,
  Images,
  LoaderCircle,
  MoreHorizontal,
  Search,
} from "lucide-react";
import {
  activeJob,
  libraryKind,
  currentComposition,
  matchesSearch,
  versionImage,
  type Asset,
  type Composition,
  type DesignDocument,
  type Job,
  type Project,
  type Workspace,
} from "./types";
import { Empty, ImageView, PageHeading } from "./ui";

function CompositionPreview({ comp, doc, w, alt = "" }: {
  comp: Composition;
  doc: DesignDocument;
  w: Workspace;
  alt?: string;
}) {
  return (
    <div className="card-composition" style={{ aspectRatio: doc.width / doc.height, "--composition-ratio": doc.width / doc.height } as React.CSSProperties}>
      <ImageView id={comp.imageId} alt={alt} />
      {comp.overlays.map((o) => (
        <ImageView
          key={o.id}
          id={versionImage(w, o.assetVersionId)}
          className="card-overlay"
          style={{
            left: `${o.x}%`, top: `${o.y}%`, width: `${o.width}%`, height: `${o.height}%`,
            transform: `rotate(${o.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function ProjectCard({
  dropProps,
  project,
  w,
  onOpen,
  onEdit,
}: {
  dropProps?: HTMLAttributes<HTMLElement>;
  project: Project;
  w: Workspace;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const org = w.organisations.find((o) => o.id === project.organisationId),
    docs = w.documents.filter(
      (d) => d.projectId === project.id && !d.deletedAt,
    );
  const previews = docs.flatMap(d => d.pages.flatMap(page => {
    const current = currentComposition(page);
    const images = page.revisions.map(r => ({
      id: r.imageId, doc: d,
      comp: r.imageId === current.imageId ? current : { imageId: r.imageId, revisionId: r.id, overlays: r.overlays },
      createdAt: r.imageId === current.imageId && current.overlays.length ? modificationDate(d) : r.createdAt,
    }));
    if ((current.imageId || current.overlays.length) && !images.some(image => image.id === current.imageId)) {
      images.push({ id: current.imageId || page.id, doc: d, comp: current, createdAt: modificationDate(d) });
    }
    return images;
  })).sort((a, b) => b.createdAt - a.createdAt)
    .filter((image, index, images) => images.findIndex(other => other.id === image.id) === index)
    .slice(0, 3);
  return (
    <article {...dropProps} data-project-id={project.id} className={`project-card ${dropProps?.className || ""}`}>
      <button
        className="project-preview"
        onClick={onOpen}
        style={{ background: `${org?.color || "#7654cf"}0e` }}
        aria-label={`Open ${project.name}`}
      >
        <Folder
          size={38}
          style={{ color: org?.color || "#7654cf" }}
          strokeWidth={1.2}
        />
        {previews.map((image, i) => (
          <div
            key={image.id}
            className="project-paper"
            style={{
              transform: `rotate(${[0, -9, 9][i]}deg) translateX(${[0, -34, 34][i]}px)`,
              zIndex: 3 - i,
            }}
          >
            <CompositionPreview comp={image.comp} doc={image.doc} w={w} alt={i === 0 ? "Latest project image" : "Recent project image"} />
          </div>
        ))}
      </button>
      <div className="card-caption">
        <button className="card-name" onClick={onOpen}>
          <strong>{project.name}</strong>
          <small>
            {org?.name} <span>·</span> {docs.length}{" "}
            {docs.length === 1 ? "design" : "designs"}
          </small>
        </button>
        <button
          className="icon-button"
          aria-label={`Edit ${project.name}`}
          onClick={onEdit}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </article>
  );
}
export function DocumentCard({
  dragProps,
  doc,
  w,
  jobs,
  onOpen,
  onEdit,
}: {
  dragProps?: HTMLAttributes<HTMLElement>;
  doc: DesignDocument;
  w: Workspace;
  jobs: Job[];
  onOpen: () => void;
  onEdit: () => void;
}) {
  const project = w.projects.find((p) => p.id === doc.projectId),
    comp = currentComposition(doc.pages[0]),
    busy = jobs.some((j) => j.target.id === doc.id && activeJob(j));
  return (
    <article {...dragProps} data-document-id={doc.id} className={`document-card ${dragProps?.className || ""}`}>
      <button
        className="document-preview checker"
        draggable={!!dragProps?.draggable}
        onClick={onOpen}
        aria-label={`Open ${doc.name}`}
      >
        <CompositionPreview comp={comp} doc={doc} w={w} />
        <span className="format-badge">
          {doc.width} × {doc.height} {doc.unit}
        </span>
        {busy && (
          <span className="busy-badge">
            <LoaderCircle size={13} className="spin" />
            Creating
          </span>
        )}
      </button>
      <div className="card-caption">
        <button className="card-name" draggable={!!dragProps?.draggable} onClick={onOpen}>
          <strong>{doc.name}</strong>
          <small>
            {project?.name}
            <span>·</span>
            {doc.pages.length} {doc.pages.length === 1 ? "page" : "pages"}
          </small>
        </button>
        <button
          className="icon-button"
          aria-label={`Edit ${doc.name}`}
          onClick={onEdit}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      {doc.tags.length > 0 && (
        <div className="card-tags">
          {doc.tags.slice(0, 3).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </article>
  );
}
export function AssetCard({
  asset,
  w,
  onOpen,
  onEdit,
}: {
  asset: Asset;
  w: Workspace;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <article className="asset-card">
      <button
        className="asset-preview checker"
        onClick={onOpen}
        aria-label={`Open ${asset.name}`}
      >
        <ImageView
          id={
            asset.currentVersionId
              ? versionImage(w, asset.currentVersionId)
              : null
          }
        />
      </button>
      <div className="card-caption">
        <button className="card-name" onClick={onOpen}>
          <strong>{asset.name}</strong>
          <small>
            {w.organisations.find((o) => o.id === asset.organisationId)?.name ||
              "Shared library"}
          </small>
        </button>
        <button
          className="icon-button"
          aria-label={`Edit ${asset.name}`}
          onClick={onEdit}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </article>
  );
}
export function SearchResults({
  w,
  orgId,
  query,
  type,
  onType,
  onDocument,
  onAsset,
  onProject,
}: {
  w: Workspace;
  orgId: string;
  query: string;
  type: string;
  onType: (type: string) => void;
  onDocument: (id: string) => void;
  onAsset: (id: string) => void;
  onProject: (id: string) => void;
}) {
  const projects = w.projects.filter(
    (p) => !p.deletedAt && (orgId === "all" || p.organisationId === orgId),
  );
  const results = [
    ...projects
      .filter((p) => matchesSearch(p.name, p.tags, query))
      .map((p) => ({
        kind: "project",
        id: p.id,
        name: p.name,
        path:
          w.organisations.find((o) => o.id === p.organisationId)?.name || "",
        tags: p.tags,
      })),
    ...w.documents
      .filter(
        (d) =>
          !d.deletedAt &&
          projects.some((p) => p.id === d.projectId) &&
          matchesSearch(d.name, d.tags, query),
      )
      .map((d) => {
        const p = projects.find((p) => p.id === d.projectId)!;
        return {
          kind: "document",
          id: d.id,
          name: d.name,
          path: `${w.organisations.find((o) => o.id === p.organisationId)?.name} / ${p.name}`,
          tags: d.tags,
        };
      }),
    ...w.assets
      .filter(
        (a) =>
          !a.deletedAt &&
          (orgId === "all" ||
            !a.organisationId ||
            a.organisationId === orgId) &&
          matchesSearch(a.name, a.tags, query),
      )
      .map((a) => ({
        kind: libraryKind(a),
        id: a.id,
        name: a.name,
        path:
          w.organisations.find((o) => o.id === a.organisationId)?.name ||
          "Shared library",
        tags: a.tags,
      })),
  ].filter((r) => type === "all" || r.kind === type);
  return (
    <>
      <PageHeading
        eyebrow="FIND YOUR NEXT STARTING POINT"
        title={`Results for “${query}”`}
        subtitle={`${results.length} matches in your workspace`}
      />
      <div className="filter-tabs">
        {["all", "project", "document", "asset", "upload"].map((t) => (
          <button
            key={t}
            className={type === t ? "active" : ""}
            onClick={() => onType(t)}
          >
            {t === "all" ? "Everything" : `${t[0].toUpperCase()}${t.slice(1)}s`}
          </button>
        ))}
      </div>
      <div className="list-card">
        {results.map((r) => (
          <button
            key={r.id}
            className="search-result"
            onClick={() =>
              r.kind === "project"
                ? onProject(r.id)
                : (r.kind === "asset" || r.kind === "upload")
                  ? onAsset(r.id)
                  : onDocument(r.id)
            }
          >
            <span className="result-icon">
              {r.kind === "project" ? (
                <Folder />
              ) : (r.kind === "asset" || r.kind === "upload") ? (
                <Images />
              ) : (
                <FileImage />
              )}
            </span>
            <span>
              <strong>{r.name}</strong>
              <small>
                {r.kind} · {r.path}
              </small>
            </span>
            <div className="card-tags">
              {r.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
        {!results.length && (
          <Empty
            icon={<Search />}
            title="No matches yet"
            text="Try a different name or tag, or choose another organisation."
          />
        )}
      </div>
    </>
  );
}
