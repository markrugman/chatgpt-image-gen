import { useEffect, useState } from "react";
import { ArrowDownToLine, FileImage, LoaderCircle } from "lucide-react";
import { Modal } from "./ui";
import {
  currentComposition,
  printDpi,
  type DesignDocument,
  type Workspace,
} from "./types";
import {
  applyBleed,
  defaultExportOptions,
  encodedByteLength,
  exportDimensions,
  exportDocument,
  printLayout,
  printProfileName,
  printProof,
  printSheetPreview,
  readableFileSize,
  renderPage,
  type ExportOptions,
} from "./export";

export function ExportDialog({
  w: liveWorkspace,
  doc: liveDocument,
  pageIndex,
  asset,
  onClose,
  notify,
  onBusyChange,
}: {
  w: Workspace;
  doc: DesignDocument;
  pageIndex: number;
  asset: boolean;
  onClose: () => void;
  notify: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [w] = useState(() => structuredClone(liveWorkspace));
  const [doc] = useState(() => structuredClone(liveDocument));
  const [format, setFormat] = useState<"png" | "jpg" | "pdf">("png");
  const [dpi, setDpi] = useState(300);
  const [bleedEnabled, setBleedEnabled] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    ...defaultExportOptions,
  });
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [originalPreview, setOriginalPreview] = useState("");
  const [compareRgb, setCompareRgb] = useState(false);
  const [fileSize, setFileSize] = useState(0);
  const [exporting, setExporting] = useState(false);
  useEffect(() => onBusyChange(exporting), [exporting, onBusyChange]);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const page = doc.pages[pageIndex];
  const image = w.images.find((i) => i.id === currentComposition(page).imageId);
  const resolution = printDpi(doc, image);
  const dimensions = exportDimensions(doc, dpi);
  const settingsKey = JSON.stringify(options);
  const layout = printLayout(dimensions.points, {
    ...options,
    bleedMm: Number.isFinite(options.bleedMm) ? options.bleedMm : 0,
  });
  const setOption = <K extends keyof ExportOptions>(
    key: K,
    value: ExportOptions[K],
  ) => setOptions((o) => ({ ...o, [key]: value }));
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSource(null);
    const dimensions = exportDimensions(doc, dpi);
    if (dimensions.width * dimensions.height > 80_000_000) {
      setError("This export is too large. Choose a lower resolution.");
      setLoading(false);
      return;
    }
    const scale =
      format === "jpg"
        ? 1
        : Math.min(1, 720 / Math.max(dimensions.width, dimensions.height));
    renderPage(
      w,
      currentComposition(doc.pages[pageIndex]),
      Math.max(1, Math.round(dimensions.width * scale)),
      Math.max(1, Math.round(dimensions.height * scale)),
      format === "png",
    )
      .then((canvas) => {
        if (active) setSource(canvas);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [w, doc, pageIndex, dpi, format, asset]);
  useEffect(() => {
    let active = true;
    if (!source) return;
    setPreviewBusy(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const options: ExportOptions = JSON.parse(settingsKey);
        if (format === "pdf") {
          if (bleedEnabled && options.bleedMm < 0.5)
            throw new Error(
              "Enter a bleed of 0.5 to 20 mm, or turn bleed off.",
            );
          const layout = printLayout(
            exportDimensions(doc, dpi).points,
            options,
          );
          const bleed = applyBleed(source, layout, options.bleedMethod);
          const original = printSheetPreview(bleed, layout);
          const proof =
            options.pdfColour === "cmyk"
              ? printSheetPreview(await printProof(bleed), layout)
              : original;
          if (active) {
            setPreview(proof);
            setOriginalPreview(original);
            setFileSize(0);
          }
        } else {
          const value = source.toDataURL(
            format === "jpg" ? "image/jpeg" : "image/png",
            options.jpegQuality / 100,
          );
          if (active) {
            setPreview(value);
            setOriginalPreview(value);
            setFileSize(encodedByteLength(value));
          }
        }
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        if (active) setPreviewBusy(false);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source, settingsKey, format, doc, dpi, bleedEnabled]);
  async function save() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const result = await exportDocument(
        w,
        doc,
        format,
        pageIndex,
        dpi,
        format === "png",
        options,
      );
      if (result) {
        notify("Export saved");
        onClose();
      }
    } catch (e) {
      setExportError(String(e));
    } finally {
      setExporting(false);
    }
  }
  return (
    <Modal
      title="Export your design"
      className="export-panel"
      subtitle="Prepare a digital image or a PDF for print. Your saved design stays unchanged."
      wide
      onClose={() => {
        if (!exporting) onClose();
      }}
    >
      <div className="form-body">
        <div className="export-workspace">
          <fieldset className="export-settings" disabled={exporting}>
            <div className="export-dimensions" aria-label="Document and export dimensions">
              <span>Document size</span>
              <strong>{doc.width} × {doc.height} {doc.unit}</strong>
              <span>Export dimensions</span>
              <strong>{dimensions.width} × {dimensions.height} px{doc.unit !== "px" ? ` · ${dpi} DPI` : ""}</strong>
              {image && <span>Original image: {image.width} × {image.height} px</span>}
              <p>Export settings affect the exported copy. A larger export does not add image detail.</p>
            </div>
            <label>
              File format
              <select
                aria-label="File format"
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
              >
                <option value="png">PNG · sharp detail</option>
                <option value="jpg">JPEG · smaller file</option>
                {!asset && <option value="pdf">PDF · all pages</option>}
              </select>
            </label>
            {doc.unit !== "px" && (
              <label>
                Export resolution
                <select
                  aria-label="Export resolution"
                  value={dpi}
                  onChange={(e) => setDpi(Number(e.target.value))}
                >
                  <option value={150}>150 DPI</option>
                  <option value={300}>300 DPI</option>
                </select>
              </label>
            )}
            {format === "pdf" && (
              <>
                <label>
                  PDF colour
                  <select
                    value={options.pdfColour}
                    onChange={(e) => {
                      setOption(
                        "pdfColour",
                        e.target.value as ExportOptions["pdfColour"],
                      );
                      setCompareRgb(false);
                    }}
                  >
                    <option value="rgb">
                      RGB · screen and desktop printing
                    </option>
                    <option value="cmyk">
                      CMYK · professional coated printing
                    </option>
                  </select>
                </label>
                {options.pdfColour === "cmyk" && (
                  <div className="export-profile">
                    <strong>{printProfileName}</strong>
                    <small>
                      Generic coated-paper target. The profile is embedded in
                      the PDF. Follow your printer’s requirements if they
                      specify a different profile.
                    </small>
                  </div>
                )}
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={bleedEnabled}
                    onChange={(e) => {
                      setBleedEnabled(e.target.checked);
                      setOption("bleedMm", e.target.checked ? 3 : 0);
                    }}
                  />
                  Add bleed
                </label>
                {bleedEnabled && (
                  <>
                    <label>
                      Bleed on each side (mm)
                      <input
                        type="number"
                        min="0.5"
                        max="20"
                        step="0.5"
                        value={options.bleedMm}
                        onChange={(e) =>
                          setOption(
                            "bleedMm",
                            Math.max(0, Math.min(20, Number(e.target.value))),
                          )
                        }
                      />
                    </label>
                    <div
                      className="export-bleed-methods"
                      role="group"
                      aria-label="Bleed method"
                    >
                      {(
                        [
                          {
                            value: "extend",
                            name: "Extend edges",
                            description:
                              "Stretch the outer edge into bleed; keep the finished-page layout.",
                          },
                          {
                            value: "crop",
                            name: "Crop to fill",
                            description:
                              "Enlarge the artwork to fill bleed; details near the trim may be cropped.",
                          },
                        ] as const
                      ).map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          className={`method-card ${options.bleedMethod === method.value ? "active" : ""}`}
                          aria-pressed={options.bleedMethod === method.value}
                          onClick={() => setOption("bleedMethod", method.value)}
                        >
                          <strong>{method.name}</strong>
                          <small>{method.description}</small>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={options.cropMarks}
                    onChange={(e) => setOption("cropMarks", e.target.checked)}
                  />
                  Include crop marks
                </label>
                <small className="muted">
                  Marks sit outside the bleed. The finished document size stays
                  the same.
                </small>
              </>
            )}
            {format === "jpg" && (
              <label>
                JPEG quality: {options.jpegQuality}%
                <input
                  aria-label="JPEG quality"
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={options.jpegQuality}
                  onChange={(e) =>
                    setOption("jpegQuality", Number(e.target.value))
                  }
                />
                <small>
                  Lower quality makes a smaller file and may soften fine detail.
                  Pixel dimensions stay unchanged.
                </small>
              </label>
            )}
            {resolution && (
              <div
                className={`resolution-note ${resolution < 200 ? "warning" : ""}`}
              >
                <FileImage size={18} />
                <p>
                  <strong>
                    Original image: {image?.width} × {image?.height} px ·{" "}
                    {resolution} DPI
                  </strong>
                  <span>
                    {resolution < 200
                      ? "This image may look soft at print size. Exporting at 300 DPI does not add detail."
                      : "Review the final file before printing."}
                  </span>
                </p>
              </div>
            )}
            <p className="muted">
              {format === "pdf"
                ? `Includes all ${doc.pages.length} pages. Preview shows page ${pageIndex + 1}.`
                : "Exports the current page."}{" "}
              {format === "png" ? "Transparency is preserved." : ""}
            </p>
          </fieldset>
          <section className="export-preview-panel" aria-label="Export preview">
            <div className="export-preview-heading">
              <strong>Export preview</strong>
              {(loading || previewBusy) && (
                <span>
                  <LoaderCircle size={13} className="spin" /> Updating…
                </span>
              )}
            </div>
            {format === "pdf" && options.pdfColour === "cmyk" && (
              <div
                className="export-colour-compare"
                role="group"
                aria-label="Colour preview"
              >
                <button
                  type="button"
                  className={`button secondary small ${!compareRgb ? "active" : ""}`}
                  aria-pressed={!compareRgb}
                  onClick={() => setCompareRgb(false)}
                >
                  CMYK preview
                </button>
                <button
                  type="button"
                  className={`button secondary small ${compareRgb ? "active" : ""}`}
                  aria-pressed={compareRgb}
                  onClick={() => setCompareRgb(true)}
                >
                  RGB original
                </button>
              </div>
            )}
            <div
              className={`export-preview-stage ${format === "png" ? "checker" : ""}`}
            >
              {preview && (
                <div className="export-sheet">
                  <img
                    src={compareRgb ? originalPreview : preview}
                    alt="Export preview"
                  />
                  {format === "pdf" && (
                    <>
                      <div
                        className="export-bleed-guide"
                        style={{
                          left: `${(layout.margin / layout.width) * 100}%`,
                          top: `${(layout.margin / layout.height) * 100}%`,
                          width: `${(layout.imageWidth / layout.width) * 100}%`,
                          height: `${(layout.imageHeight / layout.height) * 100}%`,
                        }}
                      />
                      <div
                        className="export-trim-guide"
                        style={{
                          left: `${((layout.margin + layout.bleed) / layout.width) * 100}%`,
                          top: `${((layout.margin + layout.bleed) / layout.height) * 100}%`,
                          width: `${(layout.trimWidth / layout.width) * 100}%`,
                          height: `${(layout.trimHeight / layout.height) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
            {format === "pdf" ? (
              <>
                <div className="export-guide-legend">
                  <span>— Finished page</span>
                  <span>— Bleed boundary</span>
                </div>
                <small>
                  Coloured guides are preview-only.{" "}
                  {options.pdfColour === "cmyk"
                    ? "CMYK preview is an approximate screen simulation, not a physical print proof."
                    : ""}
                </small>
                <p className="export-size">
                  Finished: {((dimensions.points[0] * 25.4) / 72).toFixed(1)} ×{" "}
                  {((dimensions.points[1] * 25.4) / 72).toFixed(1)} mm
                  <br />
                  PDF sheet: {((layout.width * 25.4) / 72).toFixed(1)} ×{" "}
                  {((layout.height * 25.4) / 72).toFixed(1)} mm
                </p>
              </>
            ) : (
              <p className="export-size">
                {dimensions.width} × {dimensions.height} px
                {format === "jpg" && fileSize > 0
                  ? ` · Estimated file size: ${readableFileSize(fileSize)}`
                  : ""}
              </p>
            )}
          </section>
        </div>
        {(error || exportError) && (
          <div role="alert" className="form-error">
            {error || exportError}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <span>{format === "pdf" ? `All ${doc.pages.length} pages` : `Page ${pageIndex + 1} of ${doc.pages.length}`} · {dimensions.width} × {dimensions.height} px</span>
        <button
          type="button"
          className="button primary"
          disabled={exporting || loading || previewBusy || !!error}
          onClick={save}
        >
          {exporting ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <ArrowDownToLine size={16} />
          )}{" "}
          {exporting ? "Exporting…" : `${exportError ? "Retry export" : "Export"} ${format === "jpg" ? "JPEG" : format.toUpperCase()}`}
        </button>
      </div>
    </Modal>
  );
}
