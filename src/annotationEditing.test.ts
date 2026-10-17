import { describe, expect, it } from "vitest";
import { annotationSource, candidateComposition, regionBetween, regionFrame, regionPoint, regionPlacement, regionNotesFingerprint } from "./annotationEditing";
import { emptyWorkspace, type EditBatch, type Workspace } from "./types";

describe("annotated editing", () => {
  it("compares saved notes independent of JSON object property order", () => {
    const note = {id:"n",targetKey:"background",sourceImageId:"base",x:0,y:0,width:.95,height:.95,text:"Red screen",enabled:true};
    const roundtrip = Object.fromEntries(Object.entries(note).sort(([a],[b])=>a.localeCompare(b))) as typeof note;
    expect(regionNotesFingerprint([note])).toBe(regionNotesFingerprint([roundtrip]));
  });
  it("maps fit/crop canvas locations to the original image", () => {
    const w = { ...structuredClone(emptyWorkspace), images: [{id:"base",width:2000,height:1000}] } as Workspace;
    const comp = {imageId:"base",revisionId:null,overlays:[]};
    const fit = regionFrame(w,comp,"background",1)!;
    expect(fit).toMatchObject({x:0,y:.25,width:1,height:.5});
    expect(regionPoint(fit,{x:.25,y:.5})).toEqual({x:.25,y:.5});
    const crop = regionFrame(w,{...comp,framing:"crop"},"background",1)!;
    expect(crop).toMatchObject({x:-.5,y:0,width:2,height:1});
    expect(regionPoint(crop,{x:0,y:.5})).toEqual({x:.25,y:.5});
  });
  it("maps a rotated placement in a landscape page without screen-space distortion", () => {
    const w = structuredClone(emptyWorkspace);
    const frame = regionFrame(w,{imageId:null,revisionId:null,overlays:[{id:"one",assetVersionId:"v",x:20,y:30,width:25,height:40,rotation:45}]},"one",1.5)!;
    const box = regionPlacement(frame,{x:.1,y:.2,width:.3,height:.4});
    const point = regionPoint(frame,{x:box.x+box.width/2,y:box.y+box.height/2});
    expect(point.x).toBeCloseTo(.25);expect(point.y).toBeCloseTo(.4);
    expect(box.rotation).toBe(45);
  });
  it("normalises reverse-drawn regions in original image coordinates", () => {
    expect(regionBetween({ x: .9, y: .8 }, { x: .1, y: .2 })).toEqual({ x: .1, y: .2, width: .8, height: expect.closeTo(.6) });
  });
  it("previews only the selected placement without mutating shared sources", () => {
    const w = { ...structuredClone(emptyWorkspace), assets: [{ id: "asset", versions: [{ id: "v", imageId: "original", createdAt: 0 }] }] } as Workspace;
    const overlay = { id: "one", assetVersionId: "v", x: 10, y: 20, width: 25, height: 30, rotation: 45 };
    const batch = { source: { imageId: "base", revisionId: null, overlays: [overlay, { ...overlay, id: "two" }] }, items: [{ key: "one", candidate: "edited" }] } as EditBatch;
    const preview = candidateComposition(w, batch);
    expect(annotationSource(preview.workspace, preview.composition, "one")).toBe("edited");
    expect(annotationSource(preview.workspace, preview.composition, "two")).toBe("original");
    expect(annotationSource(w, batch.source, "one")).toBe("original");
    expect(preview.composition.overlays[0]).toEqual({ ...overlay, assetVersionId: "preview:one" });
    expect(w.assets).toHaveLength(1);
    expect(batch.source.overlays[0].assetVersionId).toBe("v");
  });
});
