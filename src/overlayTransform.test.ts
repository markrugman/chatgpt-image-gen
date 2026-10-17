import { describe, expect, it } from "vitest";
import { resizeOverlay, rotateOverlay, type OverlayCorner } from "./overlayTransform";
import type { Overlay } from "./types";

const start: Overlay = { id: "one", assetVersionId: "v", x: 25, y: 30, width: 20, height: 15, rotation: 0 };
const corners: OverlayCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
function point(o: Overlay, sx: number, sy: number, w: number, h: number) {
  const a = o.rotation * Math.PI / 180, x = sx * o.width * w / 200, y = sy * o.height * h / 200;
  return { x: (o.x + o.width / 2) * w / 100 + Math.cos(a) * x - Math.sin(a) * y,
    y: (o.y + o.height / 2) * h / 100 + Math.sin(a) * x + Math.cos(a) * y };
}
describe("overlay canvas transforms", () => {
  it("resizes from every corner without moving the opposite corner on rotated portrait and landscape canvases", () => {
    for (const [w, h] of [[400, 800], [800, 400]]) for (const rotation of [0, 37, 90, -130]) for (const corner of corners) {
      const o = { ...start, rotation }, sx = corner.endsWith("right") ? 1 : -1, sy = corner.startsWith("bottom") ? 1 : -1;
      const anchor = point(o, -sx, -sy, w, h), handle = point(o, sx, sy, w, h);
      for (const factor of [.5, 1.5, -2]) {
        const next = resizeOverlay(o, corner, (handle.x - anchor.x) * (factor - 1), (handle.y - anchor.y) * (factor - 1), w, h);
        expect(next.width / next.height).toBeCloseTo(o.width / o.height);
        expect(next.width).toBeGreaterThanOrEqual(2);
        expect(next.height).toBeGreaterThanOrEqual(2);
        const fixed = point(next, -sx, -sy, w, h);
        expect(fixed.x).toBeCloseTo(anchor.x);
        expect(fixed.y).toBeCloseTo(anchor.y);
        if (factor > 0) expect(next.width).toBeCloseTo(o.width * factor);
      }
    }
  });
  it("resizes from the centre at every corner, keeping the handle under the pointer", () => {
    for (const [w, h] of [[400, 800], [800, 400]]) for (const rotation of [0, 37, 90, -130]) for (const corner of corners) {
      const o = { ...start, rotation }, sx = corner.endsWith("right") ? 1 : -1, sy = corner.startsWith("bottom") ? 1 : -1;
      const center = point(o, 0, 0, w, h), handle = point(o, sx, sy, w, h);
      for (const factor of [.5, 1.5, -2]) {
        const dx = (handle.x - center.x) * (factor - 1), dy = (handle.y - center.y) * (factor - 1);
        const next = resizeOverlay(o, corner, dx, dy, w, h, true), fixed = point(next, 0, 0, w, h);
        expect(fixed.x).toBeCloseTo(center.x);
        expect(fixed.y).toBeCloseTo(center.y);
        expect(next.width / next.height).toBeCloseTo(o.width / o.height);
        expect(next.width).toBeGreaterThanOrEqual(2);
        expect(next.height).toBeGreaterThanOrEqual(2);
        if (factor > 0) {
          expect(next.width).toBeCloseTo(o.width * factor);
          const moved = point(next, sx, sy, w, h);
          expect(moved.x).toBeCloseTo(handle.x + dx);
          expect(moved.y).toBeCloseTo(handle.y + dy);
        }
      }
    }
  });
  it("rotates around the centre without jumping at the angle boundary or changing placement", () => {
    const o = { ...start, rotation: 170 };
    expect(rotateOverlay(o, { x: 0, y: -10 }, { x: 10, y: 0 }, { x: 0, y: 0 })).toEqual({ ...o, rotation: -100 });
    expect(rotateOverlay(start, { x: -10, y: -.01 }, { x: -10, y: .01 }, { x: 0, y: 0 }).rotation).toBe(0);
  });
});
