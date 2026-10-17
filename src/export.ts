import { api, imageSource } from "./api";
import { Composition, DesignDocument, Workspace, versionImage } from "./types";
export function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("An image could not be loaded"));
    image.src = source;
  });
}
export async function renderPage(
  w: Workspace,
  composition: Composition,
  width: number,
  height: number,
  transparent = false,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  if (!transparent) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }
  if (composition.imageId) {
    const image = await loadImage(await imageSource(composition.imageId));
    const scale =
      composition.framing === "crop"
        ? Math.max(width / image.width, height / image.height)
        : Math.min(width / image.width, height / image.height);
    ctx.drawImage(
      image,
      (width - image.width * scale) / 2,
      (height - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
  }
  for (const overlay of composition.overlays) {
    const id = versionImage(w, overlay.assetVersionId);
    if (!id) throw new Error("A referenced asset version is missing");
    const image = await loadImage(await imageSource(id));
    const x = (overlay.x * width) / 100,
      y = (overlay.y * height) / 100,
      ow = (overlay.width * width) / 100,
      oh = (overlay.height * height) / 100;
    ctx.save();
    ctx.translate(x + ow / 2, y + oh / 2);
    ctx.rotate((overlay.rotation * Math.PI) / 180);
    ctx.drawImage(image, -ow / 2, -oh / 2, ow, oh);
    ctx.restore();
  }
  return canvas;
}
export function exportDimensions(
  doc: Pick<DesignDocument, "width" | "height" | "unit">,
  dpi: number,
) {
  const inches =
    doc.unit === "mm"
      ? [doc.width / 25.4, doc.height / 25.4]
      : [doc.width, doc.height];
  return {
    width: Math.round(doc.unit === "px" ? doc.width : inches[0] * dpi),
    height: Math.round(doc.unit === "px" ? doc.height : inches[1] * dpi),
    points:
      doc.unit === "px"
        ? [doc.width * 0.75, doc.height * 0.75]
        : [inches[0] * 72, inches[1] * 72],
  };
}

export type ExportOptions = {
  bleedMm: number;
  bleedMethod: "crop" | "extend";
  cropMarks: boolean;
  pdfColour: "rgb" | "cmyk";
  jpegQuality: number;
};
export const defaultExportOptions: ExportOptions = {
  bleedMm: 0,
  bleedMethod: "extend",
  cropMarks: false,
  pdfColour: "rgb",
  jpegQuality: 90,
};
export const printProfileName = "Coated FOGRA39 · 300% ink limit (VIGC)";
export function printLayout(points: number[], options: ExportOptions) {
  if (
    !Number.isFinite(options.bleedMm) ||
    options.bleedMm < 0 ||
    options.bleedMm > 20
  )
    throw new Error("Choose a bleed between 0 and 20 mm.");
  const bleed = (options.bleedMm * 72) / 25.4,
    margin = options.cropMarks ? 18 : 0;
  return {
    trimWidth: points[0],
    trimHeight: points[1],
    bleed,
    margin,
    imageWidth: points[0] + 2 * bleed,
    imageHeight: points[1] + 2 * bleed,
    width: points[0] + 2 * (bleed + margin),
    height: points[1] + 2 * (bleed + margin),
  };
}
export type PrintLayout = ReturnType<typeof printLayout>;
export function cropMarkLines(layout: PrintLayout) {
  const {
    margin: m,
    bleed: b,
    trimWidth: w,
    trimHeight: h,
    imageWidth: iw,
    imageHeight: ih,
  } = layout;
  if (!m) return [];
  const lines: number[][] = [];
  for (const y of [m + b, m + b + h]) {
    lines.push([m - 12, y, m - 3, y], [m + iw + 3, y, m + iw + 12, y]);
  }
  for (const x of [m + b, m + b + w]) {
    lines.push([x, m - 12, x, m - 3], [x, m + ih + 3, x, m + ih + 12]);
  }
  return lines;
}
export function applyBleed(
  source: HTMLCanvasElement,
  layout: PrintLayout,
  method: ExportOptions["bleedMethod"],
) {
  if (!layout.bleed) return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(
    (source.width * layout.imageWidth) / layout.trimWidth,
  );
  canvas.height = Math.round(
    (source.height * layout.imageHeight) / layout.trimHeight,
  );
  if (canvas.width * canvas.height > 80_000_000)
    throw new Error(
      "This export including bleed is too large. Choose a lower resolution.",
    );
  const ctx = canvas.getContext("2d")!;
  const bx = (canvas.width * layout.bleed) / layout.imageWidth,
    by = (canvas.height * layout.bleed) / layout.imageHeight;
  const w = canvas.width - 2 * bx,
    h = canvas.height - 2 * by;
  if (method === "crop") {
    const scale = Math.max(
      canvas.width / source.width,
      canvas.height / source.height,
    );
    ctx.drawImage(
      source,
      (canvas.width - source.width * scale) / 2,
      (canvas.height - source.height * scale) / 2,
      source.width * scale,
      source.height * scale,
    );
  } else {
    // Stretch the outermost pixel rows/columns into bleed, preserving the finished-page layout.
    const sw = source.width,
      sh = source.height;
    ctx.drawImage(source, 0, 0, sw, 1, bx, 0, w, by + 1);
    ctx.drawImage(source, 0, sh - 1, sw, 1, bx, by + h - 1, w, by + 1);
    ctx.drawImage(source, 0, 0, 1, sh, 0, by, bx + 1, h);
    ctx.drawImage(source, sw - 1, 0, 1, sh, bx + w - 1, by, bx + 1, h);
    for (const [sx, dx] of [
      [0, 0],
      [sw - 1, bx + w],
    ])
      for (const [sy, dy] of [
        [0, 0],
        [sh - 1, by + h],
      ])
        ctx.drawImage(source, sx, sy, 1, 1, dx, dy, bx, by);
    ctx.drawImage(source, bx, by, w, h);
  }
  return canvas;
}
function base64Bytes(data: string) {
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}
export function encodedByteLength(data: string) {
  const value = data.includes(",") ? data.split(",")[1] : data;
  return (
    (value.length * 3) / 4 -
    (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0)
  );
}
export function readableFileSize(bytes: number) {
  return bytes < 1_000_000
    ? `${(bytes / 1000).toFixed(1)} KB`
    : `${(bytes / 1_000_000).toFixed(2)} MB`;
}
export async function printProof(canvas: HTMLCanvasElement) {
  const result = await api<{ preview: string }>("convert_print_image", {
    data: canvas.toDataURL("image/png").split(",")[1],
    proof: true,
  });
  return loadImage(result.preview);
}
export function printSheetPreview(
  image: CanvasImageSource,
  layout: PrintLayout,
) {
  const canvas = document.createElement("canvas");
  const scale = 500 / Math.max(layout.width, layout.height);
  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    image,
    layout.margin * scale,
    layout.margin * scale,
    layout.imageWidth * scale,
    layout.imageHeight * scale,
  );
  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(0.5, 0.25 * scale);
  for (const [x1, y1, x2, y2] of cropMarkLines(layout)) {
    ctx.beginPath();
    ctx.moveTo(x1 * scale, (layout.height - y1) * scale);
    ctx.lineTo(x2 * scale, (layout.height - y2) * scale);
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}
export async function prepareDocumentExport(
  w: Workspace,
  doc: DesignDocument,
  format: "png" | "jpg" | "pdf",
  pageIndex: number,
  dpi: number,
  transparent = false,
  options: ExportOptions = defaultExportOptions,
) {
  const { width, height, points } = exportDimensions(doc, dpi);
  if (width * height > 80_000_000)
    throw new Error("This export is too large. Choose a lower resolution.");
  if (format !== "pdf") {
    if (
      !Number.isFinite(options.jpegQuality) ||
      options.jpegQuality < 1 ||
      options.jpegQuality > 100
    )
      throw new Error("Choose a JPEG quality between 1 and 100.");
    const page = doc.pages[pageIndex];
    const canvas = await renderPage(
      w,
      page.history[page.historyIndex],
      width,
      height,
      transparent && format === "png",
    );
    return canvas
      .toDataURL(
        format === "png" ? "image/png" : "image/jpeg",
        options.jpegQuality / 100,
      )
      .split(",")[1];
  }
  const {
    PDFDocument,
    PDFName,
    PDFString,
    cmyk,
    rgb,
    pushGraphicsState,
    popGraphicsState,
    concatTransformationMatrix,
    drawObject,
  } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const layout = printLayout(points, options);
  let profileRef;
  if (options.pdfColour === "cmyk") {
    const profile = base64Bytes(await api<string>("print_profile"));
    profileRef = pdf.context.register(
      pdf.context.flateStream(profile, { N: 4, Alternate: "DeviceCMYK" }),
    );
    const intent = pdf.context.register(
      pdf.context.obj({
        Type: "OutputIntent",
        S: "GTS_PDFX",
        OutputConditionIdentifier: PDFString.of("FOGRA39"),
        OutputCondition: PDFString.of(printProfileName),
        RegistryName: PDFString.of("https://www.color.org"),
        Info: PDFString.of("Coated_Fogra39L_VIGC_300.icc"),
        DestOutputProfile: profileRef,
      }),
    );
    pdf.catalog.set(PDFName.of("OutputIntents"), pdf.context.obj([intent]));
  }
  for (const page of doc.pages) {
    const source = await renderPage(
      w,
      page.history[page.historyIndex],
      width,
      height,
    );
    const canvas = applyBleed(source, layout, options.bleedMethod);
    const output = pdf.addPage([layout.width, layout.height]);
    output.setTrimBox(
      layout.margin + layout.bleed,
      layout.margin + layout.bleed,
      layout.trimWidth,
      layout.trimHeight,
    );
    output.setBleedBox(
      layout.margin,
      layout.margin,
      layout.imageWidth,
      layout.imageHeight,
    );
    if (profileRef) {
      const converted = await api<{
        data: string;
        width: number;
        height: number;
      }>("convert_print_image", {
        data: canvas.toDataURL("image/png").split(",")[1],
        proof: false,
      });
      const ref = pdf.context.register(
        pdf.context.stream(base64Bytes(converted.data), {
          Type: "XObject",
          Subtype: "Image",
          Width: converted.width,
          Height: converted.height,
          BitsPerComponent: 8,
          ColorSpace: ["ICCBased", profileRef],
          Filter: "FlateDecode",
        }),
      );
      const key = output.node.newXObject("Image", ref);
      output.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          layout.imageWidth,
          0,
          0,
          layout.imageHeight,
          layout.margin,
          layout.margin,
        ),
        drawObject(key),
        popGraphicsState(),
      );
    } else {
      const image = await pdf.embedPng(canvas.toDataURL("image/png"));
      output.drawImage(image, {
        x: layout.margin,
        y: layout.margin,
        width: layout.imageWidth,
        height: layout.imageHeight,
      });
    }
    for (const [x1, y1, x2, y2] of cropMarkLines(layout))
      output.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 0.25,
        color: profileRef ? cmyk(0, 0, 0, 1) : rgb(0, 0, 0),
      });
  }
  return pdf.saveAsBase64();
}
export async function exportDocument(
  w: Workspace,
  doc: DesignDocument,
  format: "png" | "jpg" | "pdf",
  pageIndex: number,
  dpi: number,
  transparent = false,
  options: ExportOptions = defaultExportOptions,
) {
  const base64 = await prepareDocumentExport(
    w,
    doc,
    format,
    pageIndex,
    dpi,
    transparent,
    options,
  );
  return api<string | null>("save_export", {
    name: doc.name,
    extension: format,
    data: base64,
  });
}
