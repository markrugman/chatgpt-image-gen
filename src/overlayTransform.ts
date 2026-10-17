import type { Overlay } from "./types";

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

// Work in screen pixels: percentage coordinates have different scales on rectangular pages.
export function resizeOverlay(start: Overlay, corner: OverlayCorner, dx: number, dy: number, canvasWidth: number, canvasHeight: number, fromCenter = false): Overlay {
  const sx = corner.endsWith("right") ? 1 : -1;
  const sy = corner.startsWith("bottom") ? 1 : -1;
  const angle = start.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const width = start.width * canvasWidth / 100, height = start.height * canvasHeight / 100;
  const localX = cos * dx + sin * dy, localY = -sin * dx + cos * dy;
  const scale = Math.max(2 / start.width, 2 / start.height,
    1 + (fromCenter ? 2 : 1) * (sx * width * localX + sy * height * localY) / (width * width + height * height));
  const shiftX = fromCenter ? 0 : sx * width * (scale - 1) / 2, shiftY = fromCenter ? 0 : sy * height * (scale - 1) / 2;
  return { ...start, width: start.width * scale, height: start.height * scale,
    x: start.x + (cos * shiftX - sin * shiftY - width * (scale - 1) / 2) / canvasWidth * 100,
    y: start.y + (sin * shiftX + cos * shiftY - height * (scale - 1) / 2) / canvasHeight * 100 };
}

export function rotateOverlay(start: Overlay, origin: { x: number; y: number }, pointer: { x: number; y: number }, center: { x: number; y: number }): Overlay {
  const delta = (Math.atan2(pointer.y - center.y, pointer.x - center.x) - Math.atan2(origin.y - center.y, origin.x - center.x)) * 180 / Math.PI;
  const rotation = Math.round(((start.rotation + delta + 540) % 360 + 360) % 360 - 180);
  return { ...start, rotation: rotation || 0 };
}
