import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { OriginalAssetDialog } from "./OriginalAssetDialog";
import { api } from "./api";
import { AssetTypeSelect } from "./AssetTypeSelect";
import { renderPage } from "./export";
import { Modal, type Act } from "./ui";
import type { Composition, Workspace } from "./types";

type Point = { x: number; y: number };
import {
  captureAssetReferences,
  descriptionObjectType,
  type ObjectType,
  faithfulPrompt,
  parseAssetDescription,
  recreationPrompt,
  type Region,
} from "./assetPrompts";

export function ExtractAssetDialog({
  w,
  composition,
  ratio,
  organisationId,
  act,
  onClose,
  onCreated,
  notify,
}: {
  w: Workspace;
  composition: Composition;
  ratio: number;
  organisationId: string | null;
  act: Act;
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [objectType, setObjectType] = useState<ObjectType>("auto");
  const [busyLabel, setBusyLabel] = useState("Starting generation…");
  const [method, setMethod] = useState("faithful");
  const [json, setJson] = useState("");
  const [visual, setVisual] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [stale, setStale] = useState(false);
  const captured = useRef<{ key: string; references: string[] } | null>(null);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(!organisationId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = useRef<Point | null>(null);
  useEffect(() => {
    let active = true;
    const image = w.images.find((i) => i.id === composition.imageId);
    const width = image?.width || 1024;
    renderPage(w, composition, width, Math.round(width / ratio))
      .then((canvas) => {
        if (active) setSource(canvas);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
    // Freeze the exact source composition when this dialog opens.
  }, []);

  async function getReferences() {
    const key = JSON.stringify(region);
    if (captured.current?.key === key) return captured.current.references;
    const references = await captureAssetReferences(source!, region);
    captured.current = { key, references };
    return references;
  }
  async function analyse() {
    setAnalysing(true);
    setError("");
    try {
      setJson(
        await api<string>("describe_asset", {
          references: await getReferences(),
          objectType,
          description:
            description.trim() ||
            name.trim() ||
            "The selected foreground object",
        }),
      );
      setStale(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalysing(false);
    }
  }
  async function extract(e: React.FormEvent) {
    e.preventDefault();
    if (!source || busy || analysing) return;
    setBusy(true);
    setError("");
    let assetId: string | undefined;
    try {
      let brief = method === "recreate" ? parseAssetDescription(json) : null;
      const sourceReferences = await getReferences();
      if (method === "faithful" && objectType === "auto") {
        setBusyLabel("Identifying the object…");
        brief = parseAssetDescription(
          await api<string>("describe_asset", {
            references: sourceReferences,
            description: description.trim() || name.trim(),
            objectType: "auto",
          }),
        );
      }
      if (brief && objectType !== "auto") brief.object_type = objectType;
      const resolvedType =
        objectType === "auto"
          ? brief
            ? descriptionObjectType(brief)
            : "other"
          : objectType;
      const descriptionJson = brief ? JSON.stringify(brief, null, 2) : null;
      const references =
        method === "faithful" || visual ? sourceReferences : [];
      setBusyLabel("Starting generation…");
      assetId = await act<string>({
        op: "asset",
        name: name.trim(),
        organisationId: shared ? null : organisationId,
        descriptionJson,
        sourceReferences,
      });
      const current = await api<Workspace>("get_workspace");
      const asset = current.assets.find((a) => a.id === assetId)!;
      await api("submit_prompt", {
        request: {
          target: { kind: "asset", id: assetId, pageId: asset.page.id },
          prompt:
            method === "faithful"
              ? faithfulPrompt(
                  description.trim() || name.trim(),
                  !!region,
                  resolvedType,
                )
              : recreationPrompt(descriptionJson!, visual, resolvedType),
          freshContext: method === "recreate",
          mode: "generate",
          references,
          transparent: true,
        },
      });
      await onCreated(assetId);
    } catch (e) {
      const message = String(e);
      if (assetId) {
        notify(`Asset workspace saved. Generation could not start: ${message}`);
        await onCreated(assetId);
      } else setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (method === "original" && composition.imageId)
    return (
      <OriginalAssetDialog
        imageId={composition.imageId}
        organisationId={organisationId}
        onClose={onClose}
        onBack={() => setMethod("faithful")}
        onCreated={onCreated}
        notify={notify}
      />
    );

  return (
    <Modal
      title="Extract an asset"
      subtitle="Give an element from this design a life of its own."
      onClose={() => {
        if (!busy && !analysing) onClose();
      }}
      wide
    >
      <form onSubmit={extract}>
        <div className="form-body">
          <button
            type="button"
            className="method-card"
            disabled={busy || analysing}
            onClick={() => setMethod("original")}
          >
            <strong>Keep original pixels — ideal for logos</strong>
            <small>
              Crop and optionally erase background. Original lettering, colours
              and shapes; no AI generation.
            </small>
          </button>
          <p className="extraction-help">
            Draw a box around the object, or describe it below. AI will create
            an isolated version on a transparent background; fine details may
            change. Your poster is preserved.
          </p>
          {source ? (
            <div
              className="extraction-stage"
              style={{ width: `min(100%, ${320 * ratio}px)` }}
              onPointerDown={(e) => {
                if (busy || analysing) return;
                if (json) setStale(true);
                const rect = e.currentTarget.getBoundingClientRect();
                start.current = {
                  x: (e.clientX - rect.left) / rect.width,
                  y: (e.clientY - rect.top) / rect.height,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
                setRegion(null);
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(
                  0,
                  Math.min(1, (e.clientX - rect.left) / rect.width),
                );
                const y = Math.max(
                  0,
                  Math.min(1, (e.clientY - rect.top) / rect.height),
                );
                setRegion({
                  x: Math.min(start.current.x, x),
                  y: Math.min(start.current.y, y),
                  width: Math.abs(x - start.current.x),
                  height: Math.abs(y - start.current.y),
                });
              }}
              onPointerUp={() => {
                start.current = null;
                setRegion((r) =>
                  r && r.width > 0.01 && r.height > 0.01 ? r : null,
                );
              }}
              onPointerCancel={() => {
                start.current = null;
                setRegion(null);
              }}
            >
              <img
                src={source.toDataURL("image/png")}
                alt="Source artwork: drag to select the object to extract"
                draggable={false}
              />
              {region && (
                <div
                  className="extraction-region"
                  style={{
                    left: `${region.x * 100}%`,
                    top: `${region.y * 100}%`,
                    width: `${region.width * 100}%`,
                    height: `${region.height * 100}%`,
                  }}
                />
              )}
            </div>
          ) : (
            !error && (
              <p>
                <LoaderCircle size={16} /> Preparing your artwork…
              </p>
            )
          )}
          {region && (
            <button
              type="button"
              className="button secondary small"
              disabled={busy || analysing}
              onClick={() => {
                setRegion(null);
                if (json) setStale(true);
              }}
            >
              Clear selection
            </button>
          )}
          <div className="form-grid">
            <label>
              Asset name
              <input
                autoFocus
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Black Rose shot"
                disabled={busy || analysing}
              />
            </label>
            <label>
              Save to
              <select
                value={shared ? "shared" : "organisation"}
                onChange={(e) => setShared(e.target.value === "shared")}
                disabled={busy || analysing}
              >
                {organisationId && (
                  <option value="organisation">This organisation</option>
                )}
                <option value="shared">Shared library</option>
              </select>
            </label>
          </div>
          <label>
            What should we extract? <span className="optional">optional</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy || analysing}
              placeholder="The black shot glass with the red rose; keep its decoration and glass shape."
            />
          </label>
          <AssetTypeSelect
            value={objectType}
            disabled={busy || analysing}
            onChange={(value) => {
              setObjectType(value);
            }}
          />
          <div
            className="extraction-methods"
            role="group"
            aria-label="Extraction method"
          >
            <button
              type="button"
              className={`method-card ${method === "faithful" ? "active" : ""}`}
              disabled={busy || analysing}
              onClick={() => setMethod("faithful")}
            >
              <strong>Extract faithfully</strong>
              <small>
                Preserve the object and clean scenery out of transparent areas.
              </small>
            </button>
            <button
              type="button"
              className={`method-card ${method === "recreate" ? "active" : ""}`}
              disabled={busy || analysing}
              onClick={() => setMethod("recreate")}
            >
              <strong>Recreate as a clean asset</strong>
              <small>
                Analyse, edit the JSON, then generate a fresh isolated object.
              </small>
            </button>
          </div>
          {method === "recreate" && (
            <>
              <button
                type="button"
                className="button secondary small"
                disabled={busy || analysing || !source}
                onClick={analyse}
              >
                {analysing ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <Sparkles size={15} />
                )}{" "}
                {analysing ? "Analysing selection…" : "Create JSON description"}
              </button>
              <label>
                Editable JSON description
                <textarea
                  className="json-editor"
                  aria-label="Editable JSON description"
                  rows={12}
                  spellCheck={false}
                  value={json}
                  onChange={(e) => {
                    setJson(e.target.value);
                    setStale(false);
                  }}
                  disabled={busy || analysing}
                  placeholder="Analyse your selection, or enter a JSON object with a subject field."
                />
              </label>
              {stale && (
                <small className="form-error">
                  The selection changed. Analyse again or update the JSON before
                  recreating.
                </small>
              )}
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={visual}
                  onChange={(e) => setVisual(e.target.checked)}
                  disabled={busy || analysing}
                />
                Also use the original image as a visual reference
              </label>
              <small>
                Off by default: JSON-only recreation helps avoid copying the old
                scene. Small differences are possible.
              </small>
            </>
          )}
          <small>
            The asset opens with its own conversation so you can refine the
            result.
          </small>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy || analysing}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              analysing ||
              !source ||
              !name.trim() ||
              (method === "recreate" && (!json.trim() || stale))
            }
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
            {busy
              ? busyLabel
              : method === "recreate"
                ? "Recreate asset"
                : "Extract asset"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
