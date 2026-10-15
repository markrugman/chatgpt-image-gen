import { useState } from "react";
import { Modal, type Act } from "./ui";
import { type Workspace } from "./types";

export function TransferDialog({
  item,
  w,
  mode,
  act,
  onClose,
  onDone,
}: {
  item: { id: string; kind: string; name: string };
  w: Workspace;
  mode: "copy" | "move";
  act: Act;
  onClose: () => void;
  onDone: (orgId: string) => void;
}) {
  const asset = w.assets.find((a) => a.id === item.id);
  const doc = w.documents.find((d) => d.id === item.id);
  const sourceOrg =
    asset?.organisationId ||
    w.projects.find((p) => p.id === doc?.projectId)?.organisationId;
  const organisations = w.organisations.filter((o) => o.id !== sourceOrg);
  const [org, setOrg] = useState(organisations[0]?.id || "");
  const [project, setProject] = useState(""),
    [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const label = mode === "copy" ? "Copy" : "Move";
  return (
    <Modal title={`${label} ${item.name} to…`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await act({
              op: "transfer",
              kind: item.kind,
              id: item.id,
              mode,
              organisationId: org,
              projectId: project || null,
              projectName,
            });
            onDone(org);
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <label>
            Destination organisation
            <select
              required
              value={org}
              onChange={(e) => {
                setOrg(e.target.value);
                setProject("");
              }}
            >
              {!organisations.length && (
                <option value="">Create another organisation first</option>
              )}
              {organisations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          {item.kind === "document" && (
            <>
              <label>
                Destination project
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">Create a new project…</option>
                  {w.projects
                    .filter((p) => !p.deletedAt && p.organisationId === org)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              {!project && (
                <label>
                  New project name
                  <input
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    maxLength={160}
                  />
                </label>
              )}
              <p>
                Pages, conversations, and history are preserved. Used assets and
                uploads receive independent copies in the destination; source
                library items stay available.
              </p>
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !org}>
            {busy
              ? `${label === "Copy" ? "Copying" : "Moving"}…`
              : `${label} here`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
