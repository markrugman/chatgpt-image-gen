import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { ServerCredentials, credentialsBody, credentialsReady, emptyCredentials } from "./ServerCredentials";
type Session = { hasOwner?: boolean; canSetup?: boolean; setupNeeded?: boolean };
export function BrowserGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(true),
    [credentials, setCredentials] = useState(emptyCredentials), [remember, setRemember] = useState(false),
    [busy, setBusy] = useState(false), [error, setError] = useState(""),
    [setup, setSetup] = useState(false), [username, setUsername] = useState(""),
    [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [requestSetup, setRequestSetup] = useState(false);
  const readSession = async (forceSetup = false) => {
    const r = await fetch(new URL("web/session", document.baseURI), { credentials: "same-origin" });
    if (!r.ok) { setReady(false); return; }
    const session: Session = await r.json();
    setReady(true);
    setSetup(!!session.setupNeeded || (forceSetup && !!session.canSetup && !session.hasOwner));
    if (forceSetup && !session.canSetup) throw Error(session.hasOwner ? "An owner account already exists." : "Sign out and sign in with your access key again to verify ownership.");
  };
  useEffect(() => {
    readSession().catch(() => setError("The server could not be reached. Try again.")).finally(() => setChecking(false));
    const expired = () => { setReady(false); setSetup(false); setError("Your session has ended. Sign in again to continue."); };
    const ownerSetup = () => { setRequestSetup(true); readSession(true).catch(e => { setReady(false); setSetup(false); setError(String(e)); }); };
    window.addEventListener("imagegen-session-expired", expired);
    window.addEventListener("imagegen-owner-setup", ownerSetup);
    return () => { window.removeEventListener("imagegen-session-expired", expired); window.removeEventListener("imagegen-owner-setup", ownerSetup); };
  }, []);
  const post = async (path: string, body: unknown) => {
    const r = await fetch(new URL(path, document.baseURI), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Imagegen-Request": "1" }, body: JSON.stringify(body) });
    if (!r.ok) { const result = await r.json(); throw Error(result.error || "Could not complete this request"); }
  };
  const finishSetup = async (keyOnly: boolean) => {
    if (!keyOnly && password !== confirmation) { setError("The passwords do not match."); return; }
    setBusy(true); setError("");
    try { await post("web/owner", keyOnly ? { keyOnly: true } : { username, password }); setPassword(""); setConfirmation(""); await readSession(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  if (ready && !setup) return <>{children}</>;
  return <main className="browser-welcome"><section className="browser-login-card">
    <span className="browser-brand"><Sparkles size={25} /> imagegen</span>
    <span className="eyebrow">YOUR CREATIVE WORKSPACE</span>
    <h1>{setup ? "Make your next sign-in easier." : <>Your next idea<br />starts here.</>}</h1>
    <p>{setup ? "Ownership verified. Create your personal owner login, or keep using your server access key. Your designs and access key stay unchanged." : "Open your projects, designs and reusable assets from your private Image Gen server."}</p>
    {checking ? <p>Opening your workspace…</p> : setup ? <form onSubmit={e => { e.preventDefault(); finishSetup(false); }}>
      <label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} pattern={"[a-zA-Z0-9._\\-]+"} required disabled={busy} /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required disabled={busy} /></label>
      <label>Confirm password<input type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="new-password" minLength={12} maxLength={256} required disabled={busy} /></label>
      <small>Use at least 12 characters. Your access key remains an alternative way to sign in.</small>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button primary" disabled={busy}>Create owner account <ArrowRight size={16} /></button>
      <button type="button" className="button secondary" disabled={busy} onClick={() => finishSetup(true)}>Use access key only</button>
      <button type="button" className="text-button" disabled={busy} onClick={async () => { setBusy(true); try { await post("web/logout", {}); setReady(false); setSetup(false); setError(""); setPassword(""); setConfirmation(""); } catch (e) { setError(String(e)); } finally { setBusy(false); } }}>Sign in again</button>
    </form> : <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await post("web/login", { ...credentialsBody(credentials), rememberMe: remember }); setCredentials(emptyCredentials); await readSession(requestSetup); setRequestSetup(false); }
      catch (e) { setError(String(e)); } finally { setBusy(false); }
    }}>
      <ServerCredentials value={credentials} onChange={setCredentials} disabled={busy} />
      <label className="remember-login"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} disabled={busy} />Keep me signed in</label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button primary" disabled={busy || !credentialsReady(credentials)}>{busy ? "Opening…" : "Open workspace"}<ArrowRight size={16} /></button>
    </form>}
    <small><LockKeyhole size={13} />{setup ? "One personal owner account for this server." : "Image Gen uses a sign-in cookie to remember this browser for up to 90 days."}</small>
  </section></main>;
}
