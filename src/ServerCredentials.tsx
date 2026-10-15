export type ServerCredentialsValue = { method: "key" | "account"; accessKey: string; username: string; password: string };
export const emptyCredentials: ServerCredentialsValue = { method: "key", accessKey: "", username: "", password: "" };
export function credentialsBody(value: ServerCredentialsValue) {
  return value.method === "key" ? { accessKey: value.accessKey } : { username: value.username.trim(), password: value.password };
}
export function credentialsReady(value: ServerCredentialsValue) {
  return value.method === "key" ? !!value.accessKey : !!value.username.trim() && !!value.password;
}
export function ServerCredentials({ value, onChange, disabled = false }: { value: ServerCredentialsValue; onChange: (value: ServerCredentialsValue) => void; disabled?: boolean }) {
  return <>
    <div className="login-methods" role="group" aria-label="Sign in using">
      <button type="button" disabled={disabled} aria-pressed={value.method === "key"} onClick={() => onChange({ ...value, method: "key" })}>Server access key</button>
      <button type="button" disabled={disabled} aria-pressed={value.method === "account"} onClick={() => onChange({ ...value, method: "account" })}>Username &amp; password</button>
    </div>
    {value.method === "key" ? <label>Server access key<input type="password" value={value.accessKey} onChange={e => onChange({ ...value, accessKey: e.target.value })} autoComplete="off" required disabled={disabled} /></label> : <>
      <label>Username<input value={value.username} onChange={e => onChange({ ...value, username: e.target.value })} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required disabled={disabled} /></label>
      <label>Password<input type="password" value={value.password} onChange={e => onChange({ ...value, password: e.target.value })} autoComplete="current-password" maxLength={256} required disabled={disabled} /></label>
    </>}
  </>;
}
