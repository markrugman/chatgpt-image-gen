import {
  faithfulPrompt,
  recreationPrompt,
  parseAssetDescription,
  descriptionObjectType,
} from "./assetPrompts";
import { exportDimensions } from "./export";
import { describe, expect, it } from "vitest";
import { matchesSearch, printDpi, versionImage, emptyWorkspace } from "./types";
describe("workspace behaviour", () => {
  it("matches all search terms across name and explicit tags", () => {
    expect(
      matchesSearch(
        "Halloween Cocktail Hour",
        ["courtyard", "poster"],
        "courtyard halloween",
      ),
    ).toBe(true);
    expect(
      matchesSearch("Halloween Cocktail Hour", ["poster"], "courtyard"),
    ).toBe(false);
    expect(matchesSearch("Logo", ["DCG"], "dcg")).toBe(true);
  });
  it("reports native resolution independently of export DPI", () => {
    expect(
      printDpi(
        { width: 210, height: 297, unit: "mm" },
        {
          id: "i",
          file: "i.png",
          mime: "image/png",
          width: 1024,
          height: 1536,
        },
      ),
    ).toBe(124);
    expect(printDpi({ width: 1080, height: 1080, unit: "px" })).toBeNull();
  });
  it("uses an exact version even when the library asset is deleted", () => {
    const workspace = {
      ...emptyWorkspace,
      assets: [
        {
          id: "a",
          name: "Logo",
          organisationId: null,
          tags: [],
          versions: [
            { id: "old", imageId: "original", createdAt: 0 },
            { id: "new", imageId: "updated", createdAt: 1 },
          ],
          currentVersionId: "new",
          deletedAt: 1,
          page: {} as never,
        },
      ],
    };
    expect(versionImage(workspace, "old")).toBe("original");
  });
});

describe("physical document sizes", () => {
  it("exports fractional inches with the same physical PDF dimensions at any DPI", () => {
    const document = { width: 8.5, height: 11, unit: "in" };
    expect(exportDimensions(document, 300)).toEqual({
      width: 2550,
      height: 3300,
      points: [612, 792],
    });
    expect(exportDimensions(document, 150)).toEqual({
      width: 1275,
      height: 1650,
      points: [612, 792],
    });
    expect(
      printDpi(document, {
        id: "image",
        file: "image.png",
        mime: "image/png",
        width: 2550,
        height: 3300,
      }),
    ).toBe(300);
  });
  it("keeps paper and pixel exports compatible", () => {
    const a5 = exportDimensions({ width: 148, height: 210, unit: "mm" }, 300);
    expect([a5.width, a5.height]).toEqual([1748, 2480]);
    expect(a5.points[0]).toBeCloseTo(419.5276, 3);
    expect(
      exportDimensions({ width: 1080, height: 1920, unit: "px" }, 300),
    ).toEqual({ width: 1080, height: 1920, points: [810, 1440] });
  });
});

describe("editable asset descriptions", () => {
  it("preserves advanced nested details and rejects malformed or empty briefs", () => {
    const advanced = {
      subject: "Black Rose shot",
      geometry: { rim: "thin", proportions: [1, 2, 3] },
      decoration: [{ motif: "red rose", position: "front" }],
      custom_notes: "preserve engraving",
    };
    expect(parseAssetDescription(JSON.stringify(advanced))).toEqual(advanced);
    for (const value of [
      "{",
      "[]",
      "null",
      '{"subject":" "}',
      '{"subject":12}',
    ])
      expect(() => parseAssetDescription(value)).toThrow();
  });
});

describe("object-specific asset guidance", () => {
  it("keeps logo extraction and recreation free of glass and food instructions", () => {
    const logo = {
      subject: "Black Rose mark",
      object_type: "logo",
      lettering: "BLACK ROSE SHOTS",
    };
    for (const prompt of [
      faithfulPrompt("Black Rose mark", true, "logo"),
      recreationPrompt(JSON.stringify(logo), false),
    ]) {
      expect(prompt).toContain("typography");
      expect(prompt).toContain("Do not redesign");
      expect(prompt).not.toMatch(
        /garnish|\bglass\b|\bstem\b|\bbowl\b|studio setup/i,
      );
    }
  });
  it("retains transparent-container cleanup only for the glass profile", () => {
    expect(faithfulPrompt("Amber cocktail", true, "glass")).toContain(
      "THROUGH",
    );
    expect(faithfulPrompt("Amber cocktail", true, "glass")).toContain("stem");
    const other = faithfulPrompt("Pumpkin", false, "other");
    expect(other).toContain("Keep opaque surfaces opaque");
    expect(other).not.toMatch(/garnish|\bstem\b|\bbowl\b/);
    const food = faithfulPrompt("Chocolate cake", false, "food");
    expect(food).toContain("toppings");
    expect(food).not.toMatch(/rim, bowl|clean neutral glass/);
  });
  it("honours explicit type overrides and safely loads legacy or unknown JSON types", () => {
    expect(descriptionObjectType({ subject: "Old brief" })).toBe("other");
    expect(
      descriptionObjectType({ subject: "Mark", object_type: "unknown" }),
    ).toBe("other");
    expect(recreationPrompt('{"subject":"Mark"}', true, "logo")).toContain(
      "exact visible lettering",
    );
    expect(recreationPrompt('{"subject":"Old brief"}', false)).not.toMatch(
      /garnish|\bstem\b|\bbowl\b/,
    );
  });
});

it("preserves intrinsic logo words and symbol descriptions even when they name other object parts", () => {
  const spec = {
    subject: "GLASS & STEM brand",
    object_type: "logo",
    lettering: "GLASS & STEM",
    symbol: { description: "rose without a stem" },
  };
  const prompt = recreationPrompt(JSON.stringify(spec), false);
  const [guidance, description] = prompt.split("ASSET DESCRIPTION:");
  expect(guidance).not.toMatch(/reconstruct.*glass|rim, bowl|garnish/i);
  expect(JSON.parse(description)).toEqual(spec);
});
