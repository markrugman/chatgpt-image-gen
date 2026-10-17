import { versionImage, type Composition, type EditBatch, type Workspace, type RegionNote } from "./types";

export const regionNotesFingerprint = (notes: RegionNote[]) => JSON.stringify(notes.map(n => [n.id,n.targetKey,n.sourceImageId,n.x,n.y,n.width,n.height,n.text,n.enabled]));

export function regionBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
export function annotationSource(w: Workspace, composition: Composition, key: string) {
  return key === "background" ? composition.imageId : versionImage(w, composition.overlays.find(o => o.id === key)?.assetVersionId || "");
}
export interface RegionFrame { x: number; y: number; width: number; height: number; rotation: number; ratio: number }
export function regionFrame(w: Workspace, composition: Composition, key: string, ratio: number): RegionFrame | null {
  if (key !== "background") {
    const o = composition.overlays.find(o => o.id === key);
    return o ? { x: o.x / 100, y: o.y / 100, width: o.width / 100, height: o.height / 100, rotation: o.rotation, ratio } : null;
  }
  const image = w.images.find(i => i.id === composition.imageId);
  if (!image) return null;
  const aspect = image.width / image.height;
  const scale = composition.framing === "crop" ? Math.max(ratio / aspect, 1) : Math.min(ratio / aspect, 1);
  const width = aspect * scale / ratio, height = scale;
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height, rotation: 0, ratio };
}
export function regionPoint(frame: RegionFrame, point: { x: number; y: number }) {
  const dx = (point.x - frame.x - frame.width / 2) * frame.ratio, dy = point.y - frame.y - frame.height / 2;
  const angle = frame.rotation * Math.PI / 180;
  return { x: .5 + (dx * Math.cos(angle) + dy * Math.sin(angle)) / (frame.width * frame.ratio), y: .5 + (-dx * Math.sin(angle) + dy * Math.cos(angle)) / frame.height };
}
export function regionPlacement(frame: RegionFrame, region: { x: number; y: number; width: number; height: number }) {
  const dx = (region.x + region.width / 2 - .5) * frame.width * frame.ratio, dy = (region.y + region.height / 2 - .5) * frame.height;
  const angle = frame.rotation * Math.PI / 180;
  const width = region.width * frame.width, height = region.height * frame.height;
  return { x: frame.x + frame.width / 2 + (dx * Math.cos(angle) - dy * Math.sin(angle)) / frame.ratio - width / 2,
    y: frame.y + frame.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - height / 2,
    width, height, rotation: frame.rotation };
}
export function candidateComposition(w: Workspace, batch: EditBatch) {
  const workspace = { ...w, assets: [...w.assets] };
  const composition = structuredClone(batch.source);
  for (const item of batch.items) {
    if (!item.candidate) continue;
    if (item.key === "background") composition.imageId = item.candidate;
    else {
      const overlay = composition.overlays.find(o => o.id === item.key);
      const asset = w.assets.find(a => a.versions.some(v => v.id === overlay?.assetVersionId));
      if (overlay && asset) {
        const versionId = `preview:${item.key}`;
        workspace.assets.push({ ...asset, id: versionId, versions: [{ id: versionId, imageId: item.candidate, createdAt: 0 }] });
        overlay.assetVersionId = versionId;
      }
    }
  }
  return { workspace, composition };
}
