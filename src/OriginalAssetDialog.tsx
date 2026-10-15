import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Modal } from "./ui";

type Point = { x: number; y: number };
type Crop = Point & { width: number; height: number };
type Preview = { data: string; width: number; height: number };
const backgrounds = [
  { name: "Checkerboard", color: "checker" },
  { name: "White", color: "#ffffff" },
  { name: "Black", color: "#17151d" },
  { name: "Bright pink", color: "#ff39bd" },
];
export function OriginalAssetDialog({
  imageId,
  organisationId,
  onClose,
  onBack,
  onCreated,
  notify,
}: {
  imageId: string;
  organisationId: string | null;
  onClose: () => void;
  onBack: () => void;
  onCreated: (id: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [source, setSource] = useState<Preview | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [seeds, setSeeds] = useState<Point[]>([]);
  const [tolerance, setTolerance] = useState(0);
  const [erase, setErase] = useState(false);
  const [background, setBackground] = useState("checker");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [readyKey, setReadyKey] = useState("");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(!organisationId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = useRef<Point | null>(null);
  const selection = { imageId, crop, seeds, tolerance };
  const key = JSON.stringify(selection);
  useEffect(() => {
    let active = true;
    api<Preview>("original_asset_preview", { selection: { imageId } })
      .then((s) => {
        if (active) {
          setSource(s);
          setCrop({ x: 0, y: 0, width: s.width, height: s.height });
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [imageId]);
  useEffect(() => {
    let active = true;
    if (!crop) return;
    const timer = setTimeout(() => {
      api<Preview>("original_asset_preview", { selection: JSON.parse(key) })
        .then((s) => {
          if (active) {
            setPreview(s);
            setReadyKey(key);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);
  function changeCrop(next: Crop) {
    setCrop(next);
    setSeeds([]);
  }
  function point(e: React.PointerEvent<HTMLDivElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          source!.width - 1,
          Math.floor(((e.clientX - r.left) / r.width) * source!.width),
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          source!.height - 1,
          Math.floor(((e.clientY - r.top) / r.height) * source!.height),
        ),
      ),
    };
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const p = point(e);
    const a = start.current;
    changeCrop({
      x: Math.min(a.x, p.x),
      y: Math.min(a.y, p.y),
      width: Math.abs(a.x - p.x) + 1,
      height: Math.abs(a.y - p.y) + 1,
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || readyKey !== key || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const id = await api<string>("extract_original_asset", {
        selection,
        name: name.trim(),
        organisationId: shared ? null : organisationId,
      });
      notify("Original pixels saved to your asset library");
      await onCreated(id);
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Keep original pixels"
      subtitle="Crop a logo or object without regenerating it."
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="form-body">
          <p className="extraction-help">
            Retained pixels keep their original colour and transparency at
            native resolution. This uses the original base image; placed library
            assets can be reused directly from the library.
          </p>
          <div className="original-workspace">
            <section>
              <h3>1. Select the logo</h3>
              <p>Drag a box, or fine-tune the crop below.</p>
              {source && crop && (
                <div
                  className="extraction-stage original-source"
                  onPointerDown={(e) => {
                    if (busy) return;
                    start.current = point(e);
                    e.currentTarget.setPointerCapture(e.pointerId);
                    move(e);
                  }}
                  onPointerMove={move}
                  onPointerUp={(e) => {
                    move(e);
                    start.current = null;
                  }}
                  onPointerCancel={() => {
                    start.current = null;
                  }}
                >
                  <img
                    src={source.data}
                    alt="Original image: drag to crop"
                    draggable={false}
                  />
                  <div
                    className="extraction-region"
                    style={{
                      left: `${(crop.x / source.width) * 100}%`,
                      top: `${(crop.y / source.height) * 100}%`,
                      width: `${(crop.width / source.width) * 100}%`,
                      height: `${(crop.height / source.height) * 100}%`,
                    }}
                  />
                </div>
              )}
              {crop && source && (
                <details>
                  <summary>Fine-tune crop (pixels)</summary>
                  <div className="crop-fields">
                    {(["x", "y", "width", "height"] as const).map((field) => (
                      <label key={field}>
                        {field === "x"
                          ? "Left"
                          : field === "y"
                            ? "Top"
                            : field === "width"
                              ? "Width"
                              : "Height"}
                        <input
                          type="number"
                          aria-label={`Crop ${field}`}
                          min={field === "x" || field === "y" ? 0 : 1}
                          max={
                            field === "x"
                              ? source.width - 1
                              : field === "y"
                                ? source.height - 1
                                : field === "width"
                                  ? source.width - crop.x
                                  : source.height - crop.y
                          }
                          value={crop[field]}
                          disabled={busy}
                          onChange={(e) =>
                            changeCrop({
                              ...crop,
                              [field]: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy}
                    onClick={() =>
                      changeCrop({
                        x: 0,
                        y: 0,
                        width: source.width,
                        height: source.height,
                      })
                    }
                  >
                    Use full image
                  </button>
                </details>
              )}
            </section>
            <section>
              <h3>2. Check the edges</h3>
              <p>
                {crop
                  ? `${crop.width} × ${crop.height} original pixels`
                  : "Preparing original image…"}
              </p>
              <div
                className={`original-preview ${background === "checker" ? "checker" : ""}`}
                style={background === "checker" ? {} : { background }}
              >
                {preview && (
                  <img
                    src={preview.data}
                    alt="Original-pixel asset preview"
                    draggable={false}
                    style={{ cursor: erase ? "crosshair" : "default" }}
                    onClick={(e) => {
                      if (
                        !erase ||
                        busy ||
                        key !== readyKey ||
                        seeds.length >= 100
                      )
                        return;
                      const r = e.currentTarget.getBoundingClientRect();
                      setSeeds([
                        ...seeds,
                        {
                          x: Math.min(
                            preview.width - 1,
                            Math.floor(
                              ((e.clientX - r.left) / r.width) * preview.width,
                            ),
                          ),
                          y: Math.min(
                            preview.height - 1,
                            Math.floor(
                              ((e.clientY - r.top) / r.height) * preview.height,
                            ),
                          ),
                        },
                      ]);
                    }}
                  />
                )}
              </div>
              <div
                className="preview-backgrounds"
                role="group"
                aria-label="Extraction preview background"
              >
                <span>Preview</span>
                {backgrounds.map((bg) => (
                  <button
                    key={bg.color}
                    type="button"
                    className={`preview-swatch ${bg.color === "checker" ? "checker" : ""}`}
                    style={
                      bg.color === "checker" ? {} : { background: bg.color }
                    }
                    aria-label={`${bg.name} extraction preview`}
                    aria-pressed={background === bg.color}
                    onClick={() => setBackground(bg.color)}
                  />
                ))}
              </div>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={erase}
                  disabled={busy}
                  onChange={(e) => setErase(e.target.checked)}
                />
                Erase connected background on click
              </label>
              {erase && (
                <>
                  <p>
                    Click background in the preview. Each click makes only the
                    connected matching area transparent. Check lettering and
                    edges before saving.
                  </p>
                  <label>
                    Colour tolerance: {tolerance}
                    <input
                      type="range"
                      aria-label="Background colour tolerance"
                      min="0"
                      max="80"
                      value={tolerance}
                      disabled={busy}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                    />
                  </label>
                  <small>
                    0 matches an exact colour. Increase gently for uneven
                    backgrounds. Edge colour fringes may remain because retained
                    pixels are never recoloured.
                  </small>
                </>
              )}
              <div className="original-mask-actions">
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy || !seeds.length}
                  onClick={() => setSeeds(seeds.slice(0, -1))}
                >
                  Undo background click
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy || !seeds.length}
                  onClick={() => setSeeds([])}
                >
                  Reset background
                </button>
              </div>
            </section>
          </div>
          <div className="form-grid">
            <label>
              Asset name
              <input
                autoFocus
                required
                maxLength={160}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Courtyard logo"
              />
            </label>
            <label>
              Save to
              <select
                value={shared ? "shared" : "organisation"}
                disabled={busy}
                onChange={(e) => setShared(e.target.value === "shared")}
              >
                {organisationId && (
                  <option value="organisation">This organisation</option>
                )}
                <option value="shared">Shared library</option>
              </select>
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onBack}
          >
            Back to AI extraction
          </button>
          <button
            className="button primary"
            disabled={busy || !name.trim() || !crop || key !== readyKey}
          >
            {busy ? "Saving original pixels…" : "Save original-pixel asset"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
