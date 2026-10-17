import { describe, expect, it } from "vitest";
import { copyPlacement, reorderOverlay } from "./overlayOperations";
import type { Overlay } from "./types";
const overlay: Overlay = { id: "one", assetVersionId: "v1", x: 10, y: 20, width: 25, height: 30, rotation: 12, locked: true };
describe("canvas placement commands", () => {
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
