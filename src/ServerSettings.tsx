import { useEffect, useState } from "react";
import { CheckCircle2, Database, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { api, isBrowser } from "./api";
import { Modal } from "./ui";
import { ConnectionVersions } from "./ConnectionVersions";
import { ServerCredentials, credentialsBody, credentialsReady, emptyCredentials } from "./ServerCredentials";
export type ServerStatus = {
  connected: boolean;
  name: string;
  url?: string;
  online: boolean;
  error?: string;
  pending: number;
  empty?: boolean;
  nativeVersion?: string;
  serverVersion?: string | null;
};
export function ServerSettings({
  onRefresh,
  notify,
  onStatus,
  standalone = false,
  onClose,
}: {
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
  onStatus: (s: ServerStatus) => void;
  standalone?: boolean;
  onClose?: () => void;
}) {
  const [status, setStatus] = useState<ServerStatus | null>(null),
    [url, setUrl] = useState(""),
    [credentials, setCredentials] = useState(emptyCredentials),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copy, setCopy] = useState(false),
    [disconnect, setDisconnect] = useState(false),
    [open, setOpen] = useState(standalone),
    [ownerConfigured, setOwnerConfigured] = useState<boolean | null>(null);
  const close = () => { setOpen(false); onClose?.(); };
  const load = async () => {
    const s = await api<ServerStatus>("server_status");
    setStatus(s);
    onStatus(s);
    if (s.url) setUrl(s.url);
    if (isBrowser) {
      const session = await fetch(new URL("web/session", document.baseURI), { credentials: "same-origin" });
      if (session.ok) { const info = await session.json(); if (typeof info.hasOwner === "boolean") setOwnerConfigured(info.hasOwner); }
    }
  };
  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);
  const run = async (work: () => Promise<unknown>, refreshStatus = true) => {
    setBusy(true);
    setError("");
    try {
      await work();
      if (refreshStatus) await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const details = isBrowser ? (
      <section className="settings-section server-settings">
        <div className="settings-section-title">
          <span className="settings-icon mint">
            <Server size={21} />
          </span>
          <div>
            <h3>Your server workspace</h3>
            <p>{status?.name || "Connected to Image Gen"}</p>
          </div>
        </div>
        <div className="account-details">
          <strong>{window.location.host}</strong>
          <span>Designs and assets are shared with your desktop apps.</span>
        </div>
        <p className="settings-note">
          Browser generation runs on this server and continues when you close
          the page. Desktop generation still runs on the PC that starts it.
        </p>
        {!!status?.pending && (
          <div className="restore-confirm">
            <strong>{status.pending} unsent recovery copies</strong>
            <p>
              A save could not complete. Export recovery backups to preserve
              that work.
            </p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("server_save_unsent");
                  notify("Recovery backups downloaded");
                })
              }
            >
              Save unsent work backups
            </button>
          </div>
        )}
        {ownerConfigured === false && <button className="button secondary" disabled={busy} onClick={() => window.dispatchEvent(new Event("imagegen-owner-setup"))}>Set up an owner login</button>}
        {ownerConfigured === true && <p className="settings-note">Owner login configured. Your server access key also remains available.</p>}
        <button
          className="button secondary"
          onClick={() => { setError(""); setDisconnect(true); }}
          disabled={busy}
        >
          Sign out of browser
        </button>
        {error && <div className="form-error">{error}</div>}
      </section>
    ) : (
    <section className="settings-section server-settings">
      <div className="settings-section-title">
        <span className="settings-icon mint">
          <Server size={21} />
        </span>
        <div>
          <h3>Your workspace storage</h3>
          <p>{status?.connected ? (status.online ? "Your shared workspace is connected." : "Your server workspace is available from the local cache.") : "Use this computer or your own private server."}</p>
        </div>
        {status?.connected && status.online && <span className="connected-pill"><CheckCircle2 size={13} />Connected</span>}
      </div>
      <div className="account-details">
        <strong>
          <Database size={15} /> {status?.name || "Checking storage…"}
        </strong>
        <span>
          {!status ? "Checking connection…" : status.connected
            ? `${status.online ? "Connected" : "Offline · cached viewing"} · ${status.url}`
            : "Saved on this computer"}
        </span>
      </div>
      {status?.error && <div className="form-error">{status.error}</div>}
      <p className="settings-note">
        Generation runs on the computer that starts it. ChatGPT sign-in stays on
        each computer. Connecting keeps your local creations safe and separate.
      </p>
      {status && !status.connected && <>
      <label>
        Server address
        <input
          placeholder="http://192.168.1.10:8787"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <ServerCredentials value={credentials} onChange={setCredentials} disabled={busy} />
      <small>Your access key or a sign-in token is saved in your system credential vault. Your password is not saved by Image Gen.</small>
      <div className="button-row">
        <button
          className="button primary"
          disabled={busy || !url || !credentialsReady(credentials)}
          onClick={() =>
            run(async () => {
              await api("server_connect", { url, accessKey: "", ...credentialsBody(credentials) });
              setCredentials(emptyCredentials);
              setCopy(false);
              await onRefresh();
              notify("Server connected. Your local creations are unchanged.");
            })
          }
        >
          {busy ? "Working…" : "Connect to server"}
        </button>
      </div>
      </>}
      {status?.connected && <div className="button-row">
        <button className="button secondary" disabled={busy} onClick={() => run(async () => { await onRefresh(); })}>
          <RefreshCw size={15} />Refresh
        </button>
        <button className="button secondary" disabled={busy} onClick={() => { setError(""); setDisconnect(true); }}>Disconnect</button>
      </div>}
      {status?.connected && status.empty && (
        <div className="restore-confirm">
          <p>
            Your server is empty. Copy your local organisations, projects,
            designs, chats and assets to start sharing them across your
            computers.
          </p>
          {!copy ? (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setCopy(true)}
            >
              Copy local workspace to server…
            </button>
          ) : (
            <>
              <p>
                Your local workspace will stay on this computer. This only works
                while the server is empty.
              </p>
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api("server_copy_local");
                      setCopy(false);
                      await onRefresh();
                      notify(
                        "Workspace copied and verified. Local originals preserved.",
                      );
                    })
                  }
                >
                  Copy and verify
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setCopy(false)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {!!status?.pending && (
        <div className="restore-confirm">
          <strong>
            {status.pending} unsent recovery{" "}
            {status.pending === 1 ? "copy" : "copies"}
          </strong>
          <p>
            A save could not reach the server or conflicted with another device.
            Save recovery backups before restoring any missing work into your
            local workspace.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (await api("server_save_unsent"))
                  notify(
                    "Recovery backups saved. Unzip to find individual workspace backups.",
                  );
              })
            }
          >
            <ShieldCheck size={15} />
            Save unsent work backups
          </button>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
    </section>
  );
  return (
    <>
      {!standalone && <section className="settings-section connection-summary">
        <span className="settings-icon mint"><Server size={21} /></span>
        <div className="connection-summary-text">
          <h3>Workspace server</h3>
          <p>{!status ? (error ? "Unable to check connection" : "Checking storage…") : isBrowser || status.connected ? (status.online ? "Connected to server" : "Offline · cached viewing") : "Local workspace · saved on this computer"}</p>
          {!!status?.pending && <small>{status.pending} unsent recovery copies</small>}
        </div>
        <button className="button secondary small" onClick={() => setOpen(true)} aria-label="Manage workspace server">Manage</button>
      </section>}
      {open && (
        <Modal title="Workspace server" subtitle="Manage your workspace connection and storage." onClose={close}>
          <div className="form-body settings-body">{details}<ConnectionVersions status={status} /></div>
          <div className="modal-footer">
            <button className="button primary" onClick={close}>Done</button>
          </div>
        </Modal>
      )}
      {disconnect && (
        <Modal title={isBrowser ? "Sign out of this browser?" : "Disconnect from workspace server?"} onClose={() => setDisconnect(false)}>
          <div className="form-body">
            <p>{isBrowser ? "Your shared creations stay on the server. You’ll need to sign in again in this browser." : "Your shared creations stay on the server. This app will open your local workspace."}</p>
            {!!status?.pending && <p>Unsent recovery copies remain on this computer.</p>}
            {error && <div className="form-error" role="alert">{error}</div>}
          </div>
          <div className="modal-footer">
            <button className="button secondary" disabled={busy} onClick={() => setDisconnect(false)}>Cancel</button>
            <button className="button primary" disabled={busy} onClick={() => run(async () => {
              if (isBrowser) { await api("web_logout"); return; }
              await api("server_disconnect");
              setDisconnect(false);
              setCopy(false);
              await onRefresh();
              notify("Your local workspace is open");
            }, !isBrowser)}>{busy ? "Working…" : isBrowser ? "Sign out" : "Disconnect"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
