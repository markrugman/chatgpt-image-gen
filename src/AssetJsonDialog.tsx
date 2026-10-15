import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { api } from "./api";
import { parseAssetDescription, recreationPrompt } from "./assetPrompts";
import { AssetTypeSelect } from "./AssetTypeSelect";
import type { ObjectType } from "./assetPrompts";
import { Modal, type Act } from "./ui";
import type { Asset } from "./types";

export function AssetJsonDialog({
  asset,
  act,
  onClose,
  onRefresh,
  notify,
  generationBusy,
}: {
  asset: Asset;
  act: Act;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
  generationBusy: boolean;
}) {
  const [objectType, setObjectType] = useState<ObjectType>("auto");
  const [text, setText] = useState(asset.descriptionJson || "");
  const [visual, setVisual] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const imageId = asset.page.history[asset.page.historyIndex].imageId;
  const references = asset.sourceReferences?.length
    ? asset.sourceReferences
    : imageId
      ? [`image:${imageId}`]
      : [];
  async function analyse() {
    setBusy("analyse");
    setError("");
    try {
      setText(
        await api<string>("describe_asset", {
          references,
          description: asset.name,
          objectType,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  async function save(generate: boolean) {
    setError("");
    try {
      const brief = parseAssetDescription(text);
      if (objectType !== "auto") brief.object_type = objectType;
      const descriptionJson = JSON.stringify(brief, null, 2);
      setBusy("save");
      await act({ op: "asset_description", id: asset.id, descriptionJson });
      if (generate)
        await api("submit_prompt", {
          request: {
            target: { kind: "asset", id: asset.id, pageId: asset.page.id },
            prompt: recreationPrompt(descriptionJson, visual, objectType),
            mode: "generate",
            references: visual ? references : [],
            transparent: true,
            freshContext: true,
          },
        });
      await onRefresh();
      onClose();
      if (!generate) notify("JSON description saved.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal
      title="Asset JSON description"
      subtitle="Edit the specification, then save it or create a clean new revision."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="form-body">
        <p className="extraction-help">
          Recreation starts with a fresh conversation. Earlier image versions
          remain in History. A detailed description helps preserve the object,
          though small differences are possible.
        </p>
        <AssetTypeSelect
          value={objectType}
          onChange={setObjectType}
          disabled={!!busy}
        />
        <button
          className="button secondary small"
          disabled={!!busy || !references.length}
          onClick={analyse}
        >
          {busy === "analyse" ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Sparkles size={15} />
          )}
          Analyse source image
        </button>
        <label>
          Editable JSON description
          <textarea
            className="json-editor"
            aria-label="Editable JSON description"
            rows={14}
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!!busy}
            placeholder={
              '{\n  "subject": "Black Rose shot glass",\n  "materials": "clear glass",\n  "markings": "red rose decoration"\n}'
            }
          />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={visual}
            onChange={(e) => setVisual(e.target.checked)}
            disabled={!!busy || !references.length}
          />
          Also use the original image as a visual reference
        </label>
        <small>
          Leave this off to recreate from JSON alone and reduce copying of the
          old background.
        </small>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button
          className="button secondary"
          disabled={!!busy || !text.trim()}
          onClick={() => save(false)}
        >
          Save description
        </button>
        <button
          className="button primary"
          disabled={!!busy || generationBusy || !text.trim()}
          onClick={() => save(true)}
        >
          {busy === "save" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          Recreate asset
        </button>
      </div>
    </Modal>
  );
}
