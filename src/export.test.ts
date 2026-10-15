import { describe, expect, it } from "vitest";
import {
  defaultExportOptions,
  printLayout,
  cropMarkLines,
  encodedByteLength,
} from "./export";
describe("professional export geometry", () => {
  it("keeps A4 trim dimensions while adding physical bleed and room for crop marks", () => {
    const l = printLayout([(210 * 72) / 25.4, (297 * 72) / 25.4], {
      ...defaultExportOptions,
      bleedMm: 3,
      cropMarks: true,
    });
    expect((l.trimWidth * 25.4) / 72).toBeCloseTo(210);
    expect((l.trimHeight * 25.4) / 72).toBeCloseTo(297);
    expect((l.imageWidth * 25.4) / 72).toBeCloseTo(216);
    expect((l.imageHeight * 25.4) / 72).toBeCloseTo(303);
    expect(l.width).toBeCloseTo(l.imageWidth + 36);
    expect(l.height).toBeCloseTo(l.imageHeight + 36);
    const lines = cropMarkLines(l);
    expect(lines).toHaveLength(8);
    for (const [x1, y1, x2, y2] of lines) {
      for (const x of [x1, x2]) expect(x >= 0 && x <= l.width).toBe(true);
      for (const y of [y1, y2]) expect(y >= 0 && y <= l.height).toBe(true);
      expect(
        (x1 < l.margin && x2 < l.margin) ||
          (x1 > l.margin + l.imageWidth && x2 > l.margin + l.imageWidth) ||
          (y1 < l.margin && y2 < l.margin) ||
          (y1 > l.margin + l.imageHeight && y2 > l.margin + l.imageHeight),
      ).toBe(true);
    }
  });
  it("supports zero-bleed marks and unchanged exports with both options off", () => {
    const plain = printLayout([400, 200], defaultExportOptions);
    expect([plain.width, plain.height]).toEqual([400, 200]);
    expect(cropMarkLines(plain)).toEqual([]);
    const marked = printLayout([400, 200], {
      ...defaultExportOptions,
      cropMarks: true,
    });
    expect([marked.width, marked.height]).toEqual([436, 236]);
    expect(cropMarkLines(marked)).toHaveLength(8);
  });
  it("rejects invalid bleed instead of generating misleading print boxes", () => {
    for (const bleedMm of [-1, 21, NaN, Infinity])
      expect(() =>
        printLayout([400, 200], { ...defaultExportOptions, bleedMm }),
      ).toThrow();
  });
  it("reports compressed file sizes correctly including base64 padding", () => {
    expect(encodedByteLength("AA==")).toBe(1);
    expect(encodedByteLength("data:image/jpeg;base64,AAA=")).toBe(2);
    expect(encodedByteLength("AAAA")).toBe(3);
  });
});
