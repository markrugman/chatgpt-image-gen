import { describe, expect, it } from "vitest";
import { folderDates, newestFirst } from "./folderOrdering";

describe("folder ordering dates", () => {
  it("uses the newest contained modification, ignoring a newer parent rename", () => {
    expect(folderDates({ createdAt: 10, updatedAt: 1000 }, [{ updatedAt: 20 }, { updatedAt: 50 }]))
      .toEqual({ createdAt: 10, updatedAt: 50 });
  });
  it("uses own dates for empty folders and keeps undated legacy folders stable", () => {
    expect(folderDates({ createdAt: 10, updatedAt: 20 }, [])).toEqual({ createdAt: 10, updatedAt: 20 });
    expect(folderDates({}, [])).toEqual({ createdAt: 0, updatedAt: 0 });
    expect(newestFirst({}, {})).toBe(0);
  });
  it("uses creation descending to break equal modification dates", () => {
    expect(newestFirst({ createdAt: 20, updatedAt: 50 }, { createdAt: 10, updatedAt: 50 })).toBeLessThan(0);
  });
  it("allows the virtual General folder to use its templates' dates", () => {
    expect(folderDates({}, [{ createdAt: 30, updatedAt: 60 }]).updatedAt).toBe(60);
  });
});
