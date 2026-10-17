import { describe, expect, it } from "vitest";
import { copyPlacement, libraryPlacement, reorderOverlay } from "./overlayOperations";
import type { Overlay } from "./types";
const overlay: Overlay = { id: "one", assetVersionId: "v1", x: 10, y: 20, width: 25, height: 30, rotation: 12, locked: true };
describe("canvas placement commands", () => {
  it("centres library images on the drop point using design coordinates", () => {
    expect(libraryPlacement(400, 200, 2, { x: 50, y: 40 })).toEqual({ width: 25, height: 25, x: 37.5, y: 27.5 });
  });
  it("keeps every edge and corner inside with an inset of 1% of the shorter side", () => {
    for (const ratio of [.5, 1, 2]) {
      const ix = Math.min(1, 1 / ratio), iy = Math.min(1, ratio);
      for (const x of [-100, 50, 200]) for (const y of [-100, 50, 200]) {
        const p = libraryPlacement(400, 200, ratio, { x, y });
        expect(p.x).toBeCloseTo(x < 0 ? ix : x > 100 ? 100 - ix - p.width : 50 - p.width / 2);
        expect(p.y).toBeCloseTo(y < 0 ? iy : y > 100 ? 100 - iy - p.height : 50 - p.height / 2);
      }
    }
  });
  it("shrinks tall images proportionally for both Place and drop", () => {
    const placed = libraryPlacement(100, 2000, 2);
    expect(placed).toEqual({ x: 8, y: 8, width: 2, height: 80 });
    const dropped = libraryPlacement(100, 2000, 2, { x: 200, y: 200 });
    expect(dropped).toEqual({ x: 97.5, y: 19, width: 2, height: 80 });
  });
  it("preserves exact version, pixel size and rotation across differently sized pages and unlocks the copy", () => {
    const next = copyPlacement({ token: "copy", overlay, width: 1000, height: 800 }, 2000, 1600);
    expect(next.id).not.toBe(overlay.id);
    expect(next).toMatchObject({ assetVersionId: "v1", width: 12.5, height: 15, rotation: 12, locked: false, x: 5.5, y: 10.625 });
  });
  it("keeps pointer-positioned paste visible at page edges", () => {
    const next = copyPlacement({ token: "copy", overlay, width: 1000, height: 800 }, 1000, 800, { x: 99, y: 99 });
    expect(next).toMatchObject({ x: 75, y: 70 });
  });
  it("orders overlays without changing their image versions or mutating the source", () => {
    const items = [overlay, { ...overlay, id: "two", locked: false }, { ...overlay, id: "three", locked: false }];
    expect(reorderOverlay(items, "two", "top").map(o => o.id)).toEqual(["one", "three", "two"]);
    expect(reorderOverlay(items, "two", "bottom").map(o => o.id)).toEqual(["two", "one", "three"]);
    expect(reorderOverlay(items, "one", "top")).toBe(items);
    expect(reorderOverlay(items, "three", "up")).toBe(items);
    expect(items.map(o => o.id)).toEqual(["one", "two", "three"]);
  });
});
