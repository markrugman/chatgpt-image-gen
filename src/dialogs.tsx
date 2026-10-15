import { TransferDialog } from "./TransferDialog";
import { libraryKind } from "./types";
import { ServerSettings, type ServerStatus } from "./ServerSettings";
import { ConnectionVersions } from "./ConnectionVersions";
import { useRef, useState } from "react";
import { openUrl, copyText, isBrowser } from "./api";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Folder,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "./api";
import { presets, type Connection, type Workspace } from "./types";
import { ImageView, Modal, type Act, type CreateOptions } from "./ui";
export function CreateDialog({
  options,
  w,
  orgId,
  act,
  onClose,
  onCreated,
  notify,
}: {
  options: CreateOptions;
  w: Workspace;
  orgId: string;
  act: Act;
  onClose: () => void;
  onCreated: (kind: string, id: string) => void;
  notify: (message: string) => void;
}) {
  const initialProject = w.projects.find((p) => p.id === options.projectId);
  const [org, setOrg] = useState(
    initialProject?.organisationId ||
      (orgId === "all" ? w.organisations[0]?.id || "" : orgId),
  );
  const [project, setProject] = useState(initialProject?.id || ""),
    [newProject, setNewProject] = useState("");
  const [name, setName] = useState(""),
    [prompt, setPrompt] = useState(""),
    [preset, setPreset] = useState(2);
  const [width, setWidth] = useState(210),
    [height, setHeight] = useState(297),
    [unit, setUnit] = useState("mm"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [assetScope, setAssetScope] = useState(orgId === "all" ? "shared" : "organisation");
  const [resize, setResize] = useState("fit");
  const kind = options.kind,
    projects = w.projects.filter(
      (p) => !p.deletedAt && p.organisationId === org,
    );
  const titles = {
    organisation: "Make room for your organisation",
    project: "Start a new project",
    document: options.sourceImageId
      ? "Give this image a new direction"
      : "What will you create?",
    asset: "Create something reusable",
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (kind === "organisation") {
        const id = await act<string>({ op: "organisation", name });
        onCreated(kind, id);
        return;
      }
      if (kind === "project") {
        const id = await act<string>({
          op: "project",
          name,
          organisationId: org,
        });
        onCreated(kind, id);
        return;
      }
      if (kind === "asset") {
        const id = await act<string>({
          op: "asset",
          name,
          organisationId: assetScope === "shared" ? null : org,
        });
        if (prompt.trim()) {
          const current = await api<Workspace>("get_workspace");
          const asset = current.assets.find((a) => a.id === id)!;
          await api("submit_prompt", {
            request: {
              target: { kind: "asset", id, pageId: asset.page.id },
              prompt,
              mode: "generate",
              references: [],
              transparent: true,
            },
          });
        }
        onCreated(kind, id);
        return;
      }
      let projectId = project;
      if (!projectId)
        projectId = await act<string>({
          op: "project",
          name: newProject,
          organisationId: org,
        });
      const id = await act<string>({
        op: "document",
        projectId,
        name,
        width,
        height,
        unit,
        saveCustomSize: preset === -1,
        sourceImageId: options.sourceImageId,
        sourceDocumentId: options.sourceDocumentId,
      });
      const current = await api<Workspace>("get_workspace");
      const document = current.documents.find((d) => d.id === id)!;
      if (resize === "crop" && options.sourceImageId)
        await act({
          op: "framing",
          target: { kind: "document", id, pageId: document.pages[0].id },
          framing: "crop",
        });
      if (prompt.trim() || resize === "regenerate")
        await api("submit_prompt", {
          request: {
            target: { kind: "document", id, pageId: document.pages[0].id },
            prompt:
              prompt.trim() ||
              "Adapt this image to the new document dimensions. Preserve its content and style while recomposing the layout.",
            mode: "generate",
            references: [],
            transparent: false,
          },
        });
      onCreated(kind, id);
    } catch (e) {
      setError(String(e));
      notify(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={titles[kind]}
      subtitle={
        kind === "document"
          ? "A clear brief is the beginning of a great design."
          : kind === "asset"
            ? "Generate a transparent image you can use again and again."
            : "Keep related creative work together."
      }
      onClose={onClose}
      wide={kind === "document"}
    >
      <form onSubmit={submit}>
        <div className="form-body">
          {kind !== "organisation" &&
            (kind !== "asset" || w.organisations.length > 0) && (
              <div className="form-grid">
                <label>
                  Organisation
                  <select
                    value={org}
                    onChange={(e) => {
                      setOrg(e.target.value);
                      setProject("");
                    }}
                    required
                  >
                    {w.organisations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                {kind === "document" && (
                  <label>
                    Project
                    <select
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    >
                      <option value="">Create a new project…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          {kind === "document" && !project && (
            <label>
              New project name
              <input
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
                placeholder="e.g. Halloween Cocktail Hour"
                required
              />
            </label>
          )}
          <label>
            {kind === "organisation"
              ? "Organisation name"
              : kind === "project"
                ? "Project name"
                : kind === "asset"
                  ? "Asset name"
                  : "Design name"}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === "organisation"
                  ? "e.g. Courtyard"
                  : kind === "asset"
                    ? "e.g. Autumn pumpkin"
                    : "Give your idea a name"
              }
              required
              maxLength={160}
            />
          </label>
          {kind === "asset" && (
            <label>
              Save to
              <select
                value={assetScope}
                onChange={(e) => setAssetScope(e.target.value)}
              >
                <option value="shared">
                  Shared library · use across organisations
                </option>
                <option value="organisation" disabled={!w.organisations.length}>
                  This organisation only
                </option>
              </select>
            </label>
          )}
          {kind === "document" && (
            <>
              <label>Choose a starting size</label>
              <div className="preset-grid">
                {presets.map((p, i) => (
                  <button
                    key={p.name}
                    type="button"
                    className={`preset ${preset === i ? "active" : ""}`}
                    onClick={() => {
                      setPreset(i);
                      setWidth(p.width);
                      setHeight(p.height);
                      setUnit(p.unit);
                    }}
                  >
                    <span
                      className={`preset-shape ${p.width > p.height ? "landscape" : p.width === p.height ? "square" : ""}`}
                    />
                    <strong>{p.name}</strong>
                    <small>{p.label}</small>
                    {preset === i && <Check size={14} />}
                  </button>
                ))}
              </div>
              <label>Custom sizes</label>
              <div className="custom-sizes">
                {!w.customSizes.length && (
                  <small>
                    Custom dimensions are saved here when you create a design.
                  </small>
                )}
                {w.customSizes.map((size) => (
                  <div className="custom-size" key={size.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPreset(-2);
                        setWidth(size.width);
                        setHeight(size.height);
                        setUnit(size.unit);
                      }}
                    >
                      {size.width} × {size.height}{" "}
                      {size.unit === "in" ? "inches" : size.unit}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove custom size ${size.width} × ${size.height} ${size.unit}`}
                      title="Remove saved size"
                      onClick={() => {
                        void act({
                          op: "remove_custom_size",
                          id: size.id,
                        }).catch((e) => notify(String(e)));
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="dimensions-row">
                <label>
                  Width
                  <input
                    aria-label="Document width"
                    type="number"
                    min={unit === "in" ? "0.01" : "1"}
                    step={unit === "px" ? "1" : "any"}
                    max="20000"
                    value={width}
                    onChange={(e) => {
                      setPreset(-1);
                      setWidth(Number(e.target.value));
                    }}
                    required
                  />
                </label>
                <span>×</span>
                <label>
                  Height
                  <input
                    aria-label="Document height"
                    type="number"
                    min={unit === "in" ? "0.01" : "1"}
                    step={unit === "px" ? "1" : "any"}
                    max="20000"
                    value={height}
                    onChange={(e) => {
                      setPreset(-1);
                      setHeight(Number(e.target.value));
                    }}
                    required
                  />
                </label>
                <label>
                  Units
                  <select
                    value={unit}
                    onChange={(e) => {
                      setPreset(-1);
                      setUnit(e.target.value);
                    }}
                  >
                    <option value="mm">Millimetres</option>
                    <option value="px">Pixels</option>
                    <option value="in">Inches</option>
                  </select>
                </label>
              </div>
              {options.sourceImageId && (
                <>
                  <label>
                    Fit the source image
                    <select
                      value={resize}
                      onChange={(e) => setResize(e.target.value)}
                    >
                      <option value="fit">
                        Fit · preserve the complete image
                      </option>
                      <option value="crop">Crop · fill the new page</option>
                      <option value="regenerate">
                        Regenerate · recompose for this size
                      </option>
                    </select>
                    <small>
                      The original document is preserved. Regeneration creates a
                      new composition.
                    </small>
                  </label>
                  <div className="resize-preview checker">
                    <div style={{ aspectRatio: width / height }}>
                      <ImageView
                        id={options.sourceImageId}
                        style={{
                          objectFit: resize === "crop" ? "cover" : "contain",
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          {(kind === "document" || kind === "asset") && (
            <label>
              Your starting prompt <span className="optional">optional</span>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  kind === "asset"
                    ? "An illustrated autumn pumpkin, isolated on a transparent background…"
                    : "An atmospheric Halloween cocktail poster with warm amber light…"
                }
              />
              <small>
                Leave blank to open the workspace first. Add a prompt to start
                generating.
              </small>
            </label>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span>
            <ShieldCheck size={14} />
            Saved on this computer
          </span>
          <button className="button primary" disabled={busy} type="submit">
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : kind === "document" || kind === "asset" ? (
              <Sparkles size={16} />
            ) : (
              <Folder size={16} />
            )}
            {busy
              ? "Creating…"
              : kind === "document"
                ? prompt.trim()
                  ? "Create & generate"
                  : "Open workspace"
                : kind === "asset"
                  ? "Create asset"
                  : "Create"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function EditDialog({
  item,
  w,
  onTransferred,
  act,
  onClose,
  notify,
}: {
  item: { kind: string; id: string; name: string; tags: string[] };
  w: Workspace;
  onTransferred: (orgId: string) => void;
  act: Act;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const originalAct = useRef(act).current;
  const [transfer, setTransfer] = useState<"copy" | "move" | null>(null);
  const image = w.assets.find(a => a.id === item.id);
  const upload = image && libraryKind(image) === "upload";
  const [name, setName] = useState(item.name),
    [tags, setTags] = useState(item.tags.join(", ")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={`Edit ${upload ? "upload" : item.kind === "document" ? "design" : item.kind}`}
      subtitle="A useful name and a few tags make everything easier to find."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await originalAct({
              op: "rename",
              name,
              kind: item.kind,
              id: item.id,
              tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            });
            onClose();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label>
            <span className="inline-label">
              <Tag size={14} />
              Tags
            </span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="halloween, cocktails, autumn"
            />
            <small>
              Separate tags with commas. Search finds names and tags.
            </small>
          </label>
          {["asset", "document"].includes(item.kind) && <div className="button-row transfer-actions">
            <button type="button" className="button secondary" disabled={busy} onClick={() => setTransfer("copy")}>Copy to…</button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setTransfer("move")}>Move to…</button>
            {image && <button type="button" className="button secondary" disabled={busy} onClick={async () => {
              setBusy(true); setError("");
              try {
                await originalAct(upload ? { op: "save_as_asset", id: item.id } : { op: "classify", id: item.id, libraryKind: "upload" });
                notify(upload ? "Saved a separate copy in Assets" : "Moved to Uploads"); onClose();
              } catch (e) { setError(String(e)); } finally { setBusy(false); }
            }}>{upload ? "Save as asset" : "Move to Uploads"}</button>}
          </div>}
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button danger-text"
            onClick={async () => {
              try {
                await originalAct({ op: "delete", kind: item.kind, id: item.id });
                onClose();
                notify("Moved to Trash. You can restore it any time.");
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <Trash2 size={15} />
            Move to Trash
          </button>
          <button className="button primary" disabled={busy}>
            Save changes
          </button>
        </div>
      </form>
      {transfer && <TransferDialog item={item} w={w} mode={transfer} act={act} onClose={() => setTransfer(null)} onDone={orgId => { notify(transfer === "copy" ? "Copy created" : "Item moved"); onTransferred(orgId); onClose(); }} />}
    </Modal>
  );
}
export function SettingsDialog({
  panel,
  connection,
  error,
  onClose,
  onConnection,
  onRefresh,
  notify,
}: {
  panel?: "chatgpt" | "server";
  connection: Connection | null;
  error: string;
  onClose: () => void;
  onConnection: () => Promise<void>;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [storage, setStorage] = useState<ServerStatus|null>(null);
  const [chatOpen, setChatOpen] = useState(panel === "chatgpt");
  const closeChat = () => {
    if (login) api("cancel_login", { loginId: login.loginId }).catch(() => {});
    setLogin(null);
    setChatOpen(false);
    if (panel) onClose();
  };
  const [login, setLogin] = useState<{
      loginId: string;
      verificationUrl: string;
      userCode: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [localError, setError] = useState(""),
    [restore, setRestore] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const chatDialog = chatOpen && (
          <Modal title={isBrowser ? "Server ChatGPT connection" : "ChatGPT connection"} subtitle="Manage your account and image generation connection." onClose={closeChat}>
            <div className="form-body settings-body">
        <section className="settings-section">
          <div className="settings-section-title">
            <span className="settings-icon">
              <Sparkles size={21} />
            </span>
            <div>
              <h3>{isBrowser ? "Server ChatGPT connection" : "ChatGPT connection"}</h3>
              <p>{isBrowser ? "Browser requests generate on your server." : "Generate with your existing account."}</p>
            </div>
            {connection?.account?.type === "chatgpt" && (
              <span className="connected-pill">
                <CheckCircle2 size={13} />
                Connected
              </span>
            )}
          </div>
          {connection?.account?.type === "chatgpt" && (
            <div className="account-details">
              <strong>
                {connection.account.email || "Your ChatGPT account"}
              </strong>
              <span>
                Signed in with ChatGPT ·{" "}
                {connection.capabilities.imageGeneration
                  ? "Image generation available"
                  : "Image generation unavailable"}
              </span>
            </div>
          )}
          {login && connection?.account?.type !== "chatgpt" ? (
            <div className="device-login">
              <p>Open ChatGPT in your browser and enter this code:</p>
              <button
                className="device-code"
                onClick={() => {
                  copyText(login.userCode);
                  notify("Code copied");
                }}
              >
                {login.userCode}
                <Copy size={16} />
              </button>
              <button
                className="button primary"
                onClick={() => run(() => openUrl(login.verificationUrl))}
              >
                Open sign-in page
                <ArrowRight size={16} />
              </button>
              <small>Waiting for you to finish signing in…</small>
              <button
                className="text-button"
                onClick={() =>
                  run(async () => {
                    await api("cancel_login", { loginId: login.loginId });
                    setLogin(null);
                  })
                }
              >
                Cancel sign-in
              </button>
            </div>
          ) : (
            <div className="button-row">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api("reconnect");
                    await onConnection();
                  })
                }
              >
                Check connection
              </button>
              {connection?.account?.type !== "chatgpt" && connection?.workerEnabled !== false && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const login = await api<{
                        loginId: string;
                        verificationUrl: string;
                        userCode: string;
                      }>("start_login");
                      setLogin(login);
                    })
                  }
                >
                  Sign in with ChatGPT
                </button>
              )}
            </div>
          )}
          {(localError || error) && (
            <div className="form-error">{localError || error}</div>
          )}
        </section>
            </div>
            <div className="modal-footer"><button className="button primary" onClick={closeChat}>Done</button></div>
          </Modal>
        );
  if (panel === "server") return <ServerSettings standalone onClose={onClose} onRefresh={onRefresh} notify={notify} onStatus={setStorage} />;
  if (panel === "chatgpt") return chatDialog;
  return (
    <Modal
      title="Your workspace, your way"
      subtitle="Connect ChatGPT and keep your creative work safe."
      onClose={() => {
        if (login)
          api("cancel_login", { loginId: login.loginId }).catch(() => {});
        onClose();
      }}
    >
      <div className="form-body settings-body">
        <ServerSettings onRefresh={onRefresh} notify={notify} onStatus={setStorage}/>
        {localError && !chatOpen && <div className="form-error">{localError}</div>}
        <section className="settings-section connection-summary">
          <span className="settings-icon"><Sparkles size={21} /></span>
          <div className="connection-summary-text">
            <h3>{isBrowser ? "Server ChatGPT connection" : "ChatGPT connection"}</h3>
            <p>{connection?.workerEnabled === false ? "Server generation disabled" : connection?.account?.type === "chatgpt" ? (connection.capabilities.imageGeneration ? "Connected · image generation available" : "Connected · image generation unavailable") : error ? "Connection needs attention" : "Not signed in"}</p>
          </div>
          <button className="button secondary small" onClick={() => setChatOpen(true)} aria-label="Manage ChatGPT connection">Manage</button>
        </section>
        {chatDialog}
        <ConnectionVersions status={storage} />
        <section className="settings-section">
          <div className="settings-section-title">
            <span className="settings-icon mint">
              <ShieldCheck size={21} />
            </span>
            <div>
              <h3>Keep a copy of everything</h3>
              <p>Designs, chats, history, and assets. No credentials.</p>
            </div>
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const saved = await api<string | null>("backup");
                  if (saved) notify("Workspace backup saved");
                })
              }
            >
              <ArrowDownToLine size={16} />
              Save backup
            </button>
            <button
              className="button secondary"
              disabled={busy || storage?.connected}
              onClick={() => setRestore(true)}
              title={storage?.connected ? "Use local workspace before restoring a backup" : undefined}
            >
              <Upload size={16} />
              Restore backup
            </button>
          </div>
          {restore && (
            <div className="restore-confirm">
              <p>
                Restoring replaces the current workspace. A recovery backup of
                your current work is saved automatically.
              </p>
              <div className="button-row">
                <button
                  className="button secondary small"
                  onClick={() => setRestore(false)}
                >
                  Keep current workspace
                </button>
                <button
                  className="button primary small"
                  onClick={() =>
                    run(async () => {
                      const restored = await api<boolean>("restore_backup");
                      if (restored) {
                        await onRefresh();
                        notify("Workspace restored");
                        setRestore(false);
                      }
                    })
                  }
                >
                  Choose backup
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="settings-section">
          <div className="settings-section-title">
            <span className="settings-icon peach">
              <ArrowRight size={21} />
            </span>
            <div>
              <h3>Start from ChatGPT</h3>
              <p>The Image Gen companion connects local desktop chats.</p>
            </div>
          </div>
          <p className="settings-note">
            With the companion enabled in your desktop chat, ask it to create a
            poster to start generation, or start a poster project to prepare a
            brief. Your conversation continues here.
          </p>
        </section>
      </div>
      <div className="modal-footer">
        <span>
          <ShieldCheck size={14} />
          {storage?.connected ? "Your server, your workspace" : "Your workspace stays local"}
        </span>
        <button className="button primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
