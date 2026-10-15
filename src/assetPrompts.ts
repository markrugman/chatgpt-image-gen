import { api } from "./api";

export type Region = { x: number; y: number; width: number; height: number };

export function parseAssetDescription(text: string): Record<string, unknown> {
  if (text.length > 50_000)
    throw new Error("Keep the JSON description under 50,000 characters.");
  const value = JSON.parse(text);
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    typeof value.subject !== "string" ||
    !value.subject.trim()
  ) {
    throw new Error('Use a JSON object with a non-empty "subject" string.');
  }
  return value;
}

export const objectTypes = [
  { value: "auto", label: "Automatic · identify from image" },
  { value: "logo", label: "Logo or graphic mark" },
  { value: "glass", label: "Glass or transparent container" },
  { value: "food", label: "Food or drink without glass" },
  { value: "other", label: "Other object" },
] as const;
export type ObjectType = (typeof objectTypes)[number]["value"];

export function descriptionObjectType(
  value: Record<string, unknown>,
): ObjectType {
  return objectTypes.some(
    (type) => type.value === value.object_type && type.value !== "auto",
  )
    ? (value.object_type as ObjectType)
    : "other";
}

function objectGuidance(type: ObjectType, recreate: boolean) {
  if (type === "logo")
    return `This subject is a logo or graphic mark. Preserve the exact visible lettering, spelling, capitalisation, typography, letter shapes, symbols, colours, spacing, alignment, line weights, proportions and intentional negative space. Keep intentional white artwork and solid badge shapes; make only the surrounding background and genuine cut-out areas transparent. Do not redesign, restyle, add effects, extrude into 3D, add lighting or shadows, invent branding, or guess obscured text or symbols. Treat unrelated appearance fields in older descriptions as inapplicable; use only properties of the selected flat mark. ${recreate ? "Use the JSON as a flat artwork specification; do not turn the mark into a photographed physical object. AI recreation may differ from the source." : "Retain visible artwork as faithfully as possible. Do not complete clipped lettering or invent missing parts."}`;
  if (type === "glass")
    return "This subject is glass or a transparent container. Preserve its shape, materials, markings, true contents and any visible decoration that belongs to the selected object. Remove the old scene visible THROUGH transparent or translucent areas, including the empty rim, bowl, stem and base where present. Retain optical edges and highlights with partial alpha in clear areas. Do not bake the old scene into the object or replace clear areas with an opaque white or grey fill.";
  if (type === "food")
    return "This subject is food or drink without a glass container. Preserve its actual shape, texture, colours, ingredients and presentation. Keep toppings or serving pieces only when they belong to the selected subject. Do not invent additions or apply transparent-container treatment to opaque food.";
  return "Preserve the selected object's actual geometry, proportions, colours, materials, texture, markings and relevant details. Keep opaque surfaces opaque. Preserve transparency only where the object genuinely has it. Do not invent accessories, alter intentional lettering or add subject-specific details that are not present.";
}

const isolation =
  "Remove only the surrounding background, scenery and unrelated objects. Retain details and text that belong to the selected subject. Use clean edges without background-coloured fringes. Do not add a backdrop, checkerboard, floor or cast shadow. Centre the isolated subject with a small transparent margin. Generate a transparent-background PNG.";

export function faithfulPrompt(
  description: string,
  cropped: boolean,
  objectType: ObjectType = "other",
) {
  return `Extract this object faithfully from the attached artwork: ${description}. ${cropped ? "Image 1 is the selected object close-up; image 2 is the full artwork for identification only. Extract only the selected subject in the close-up." : "Use the attached artwork to identify the described subject."} ${objectGuidance(objectType, false)} ${isolation}`;
}

export function recreationPrompt(
  description: string,
  visualReference: boolean,
  objectType: ObjectType = "auto",
) {
  const value = parseAssetDescription(description);
  const type =
    objectType === "auto" ? descriptionObjectType(value) : objectType;
  return `Create one NEW standalone reusable asset from this JSON description. Interpret the JSON as a visual specification. ${visualReference ? "The attached source image(s) guide the subject's identity and proportions; do not copy their surrounding scene or background contamination." : "Generate from the description alone, without relying on any previous image or conversation."} ${objectGuidance(type, true)} ${isolation}\n\nASSET DESCRIPTION:\n${JSON.stringify(value, null, 2)}`;
}

export async function captureAssetReferences(
  source: HTMLCanvasElement,
  region: Region | null,
) {
  const capture = (canvas: HTMLCanvasElement) =>
    api<string>("capture_composition", {
      data: canvas.toDataURL("image/png").split(",")[1],
    });
  const references = [`image:${await capture(source)}`];
  if (region) {
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, Math.round(region.width * source.width));
    crop.height = Math.max(1, Math.round(region.height * source.height));
    crop
      .getContext("2d")!
      .drawImage(
        source,
        region.x * source.width,
        region.y * source.height,
        region.width * source.width,
        region.height * source.height,
        0,
        0,
        crop.width,
        crop.height,
      );
    references.unshift(`image:${await capture(crop)}`);
  }
  return references;
}
