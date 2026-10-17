export interface Organisation {
  position?: number | null;
  deletedAt?: number | null;
  trashedItems?: string[];
  id: string;
  name: string;
  color: string;
}
export interface Project {
  createdAt?: number;
  updatedAt?: number;
  id: string;
  organisationId: string;
  name: string;
  tags: string[];
  deletedAt: number | null;
}
export interface ImageRecord {
  id: string;
  file: string;
  width: number;
  height: number;
  mime: string;
}
export interface Overlay {
  locked?: boolean;
  id: string;
  assetVersionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface Composition {
  imageId: string | null;
  revisionId: string | null;
  overlays: Overlay[];
  framing?: "fit" | "crop" | null;
}
export interface TemplateInput {
  id: string;
  label: string;
  kind: "text" | "colour" | "choice";
  required: boolean;
  defaultValue: string;
  choices: string[];
}
export interface Template {
  inputVersion?: number;
  mode?: "generate" | "discuss";
  subjectRequirement?: "none" | "optional" | "required";
  inputs?: TemplateInput[];
  modifiedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  id: string;
  name: string;
  recipe: string;
  exampleImageId: string;
  usageNotes: string;
  organisationId: string | null;
  folderId: string;
  tags: string[];
  version: number;
  deletedAt: number | null;
}
export interface TemplateFolder {
  createdAt?: number;
  updatedAt?: number;
  id: string;
  name: string;
  organisationId: string | null;
}
export interface ReferencePurpose {
  reference: string;
  purpose: "Subject" | "Style" | "Logo" | "Other";
  explanation: string;
}
export interface TemplateRequest {
  answers?: Record<string, string>;
  template: Template;
  additionalInstructions: string;
  referencePurposes: ReferencePurpose[];
  width: number;
  height: number;
  unit: string;
  transparent: boolean;
  instructions: string;
}
export interface Message {
  id: string;
  role: string;
  templateRequest?: TemplateRequest | null;
  referencePurposes?: ReferencePurpose[];
  text: string;
  mode: string;
  createdAt: number;
  references: string[];
}
export interface Revision {
  regionNotes?: RegionNote[];
  composition?: Composition | null;
  id: string;
  imageId: string;
  prompt: string;
  createdAt: number;
  threadId: string;
  turnId: string;
  messages: Message[];
  overlays: Overlay[];
  parentRevisionId: string | null;
}
export interface Page {
  regionNotes?: RegionNote[];
  editBatch?: EditBatch | null;
  id: string;
  name: string;
  messages: Message[];
  revisions: Revision[];
  history: Composition[];
  historyIndex: number;
  threadId: string | null;
  branchTurnId: string | null;
}
export interface RegionNote {
  id: string; targetKey: string; sourceImageId: string;
  x: number; y: number; width: number; height: number; text: string; enabled: boolean;
}
export interface EditItem {
  key: string; name: string; sourceImageId: string; notes: RegionNote[];
  candidate: string | null; error: string | null; threadId: string | null; turnId: string | null;
}
export interface EditBatch {
  instructions?: string; references?: string[]; referencePurposes?: ReferencePurpose[];
  id: string; source: Composition; historyIndex: number; items: EditItem[]; createdAt: number;
}
export interface DesignDocument {
  modifiedAt?: number;
  id: string;
  projectId: string;
  name: string;
  width: number;
  height: number;
  unit: string;
  pages: Page[];
  tags: string[];
  updatedAt: number;
  deletedAt: number | null;
  sourceDocumentId: string | null;
}
export interface AssetVersion {
  id: string;
  imageId: string;
  createdAt: number;
}
export type LibraryKind = "asset" | "upload";
export const libraryKind = (asset: Asset): LibraryKind => asset.libraryKind || "asset";
export interface Asset {
  modifiedAt?: number;
  libraryKind?: LibraryKind;
  descriptionJson?: string | null;
  sourceReferences?: string[];
  id: string;
  name: string;
  organisationId: string | null;
  tags: string[];
  versions: AssetVersion[];
  currentVersionId: string | null;
  page: Page;
  deletedAt: number | null;
}
export interface CustomSize {
  id: string;
  width: number;
  height: number;
  unit: string;
}
export interface Workspace {
  templates?: Template[];
  templateFolders?: TemplateFolder[];
  formatVersion?: number;
  customSizes: CustomSize[];
  organisations: Organisation[];
  projects: Project[];
  documents: DesignDocument[];
  assets: Asset[];
  images: ImageRecord[];
  handoffs: Record<string, string>;
}
export interface Target {
  kind: "document" | "asset";
  id: string;
  pageId: string;
}
export interface Job {
  id: string;
  target: Target;
  status: string;
  message: string;
  threadId: string | null;
  turnId: string | null;
  cancelRequested: boolean;
  createdAt: number;
}
export interface Connection {
  workerEnabled?: boolean;
  account: { type: string; email?: string; planType?: string } | null;
  capabilities: { imageGeneration: boolean };
  executable: string;
}
export const emptyWorkspace: Workspace = {
  customSizes: [],
  organisations: [],
  projects: [],
  documents: [],
  assets: [],
  images: [],
  handoffs: {},
};
export const activeJob = (j: Job) =>
  ["starting", "running", "cancelling"].includes(j.status);
export const currentComposition = (page: Page) =>
  page.history[page.historyIndex];
export function versionImage(
  w: Workspace,
  versionId: string,
): string | undefined {
  return w.assets.flatMap((a) => a.versions).find((v) => v.id === versionId)
    ?.imageId;
}
export function referenceImage(
  w: Workspace,
  reference: string,
): string | undefined {
  return reference.startsWith("image:")
    ? w.images.find((i) => i.id === reference.slice(6))?.id
    : versionImage(w, reference);
}
export function matchesSearch(
  name: string,
  tags: string[],
  query: string,
): boolean {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return terms.every((term) =>
    `${name} ${tags.join(" ")}`.toLowerCase().includes(term),
  );
}
export function printDpi(
  doc: Pick<DesignDocument, "width" | "height" | "unit">,
  image?: ImageRecord,
): number | null {
  if (!image || doc.unit === "px") return null;
  const perInch = doc.unit === "in" ? 1 : 25.4;
  return Math.round(
    Math.min(
      image.width / (doc.width / perInch),
      image.height / (doc.height / perInch),
    ),
  );
}
export const presets = [
  {
    name: "A2 Poster",
    label: "420 × 594 mm",
    width: 420,
    height: 594,
    unit: "mm",
  },
  {
    name: "A3 Poster",
    label: "A3 · Portrait",
    width: 297,
    height: 420,
    unit: "mm",
  },
  {
    name: "A4 Poster",
    label: "A4 · Portrait",
    width: 210,
    height: 297,
    unit: "mm",
  },
  {
    name: "A5 Flyer",
    label: "148 × 210 mm",
    width: 148,
    height: 210,
    unit: "mm",
  },
  {
    name: "A6 Flyer",
    label: "105 × 148 mm",
    width: 105,
    height: 148,
    unit: "mm",
  },
  {
    name: "Square Post",
    label: "1080 × 1080 px",
    width: 1080,
    height: 1080,
    unit: "px",
  },
  {
    name: "Story",
    label: "1080 × 1920 px",
    width: 1080,
    height: 1920,
    unit: "px",
  },
  {
    name: "Landscape",
    label: "1920 × 1080 px",
    width: 1920,
    height: 1080,
    unit: "px",
  },
];

export function activeOrganisations(w: Workspace): Organisation[] {
  return w.organisations.map((org, index) => ({ org, index }))
    .filter(({ org }) => !org.deletedAt)
    .sort((a, b) => (a.org.position ?? a.index) - (b.org.position ?? b.index))
    .map(({ org }) => org);
}

export function trashedOrganisationForItem(w: Workspace, id: string): Organisation | undefined {
  const project = w.projects.find(p => p.id === id) || w.projects.find(p => p.id === w.documents.find(d => d.id === id)?.projectId);
  const owner = project?.organisationId || w.assets.find(a => a.id === id)?.organisationId || w.templates?.find(t => t.id === id)?.organisationId;
  return w.organisations.find(o => o.id === owner && !!o.deletedAt);
}
