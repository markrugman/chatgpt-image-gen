import type { Overlay } from "./types";

export type OverlayClipboard = { token: string; overlay: Overlay; width: number; height: number };
export const overlayId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
export const libraryImageDragType = "application/x-imagegen-library-version";
// Some WebKit hosts omit custom drag formats; retain the version for this app's active drag.
export const libraryImageDrag = { versionId: null as string | null };
export function libraryPlacement(sourceWidth: number, sourceHeight: number, pageRatio: number, point?: { x: number; y: number }) {
  let width = 25, height = width * pageRatio * sourceHeight / sourceWidth;
  if (height > 80) { width *= 80 / height; height = 80; }
  const insetX = Math.min(1, 1 / pageRatio), insetY = Math.min(1, pageRatio);
  return { width, height,
    x: point ? Math.max(insetX, Math.min(100 - insetX - width, point.x - width / 2)) : 8,
    y: point ? Math.max(insetY, Math.min(100 - insetY - height, point.y - height / 2)) : 8 };
}
export function fitPlacement(o: Overlay): Overlay {
  return { ...o, x: Math.max(0, Math.min(Math.max(0, 100 - o.width), o.x)), y: Math.max(0, Math.min(Math.max(0, 100 - o.height), o.y)) };
}
export function copyPlacement(copy: OverlayClipboard, width: number, height: number, point?: { x: number; y: number }): Overlay {
  const o = copy.overlay;
  return fitPlacement({ ...o, id: overlayId(), locked: false,
    width: o.width * copy.width / width, height: o.height * copy.height / height,
    x: point?.x ?? (o.x * copy.width + 1000) / width,
    y: point?.y ?? (o.y * copy.height + 1000) / height });
}
export function reorderOverlay(overlays: Overlay[], id: string, direction: "top" | "up" | "down" | "bottom") {
  const index = overlays.findIndex(o => o.id === id);
  if (index < 0 || overlays[index].locked) return overlays;
  const to = direction === "top" ? overlays.length - 1 : direction === "bottom" ? 0 : index + (direction === "up" ? 1 : -1);
  if (to < 0 || to >= overlays.length || to === index) return overlays;
  const next = [...overlays], [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}
