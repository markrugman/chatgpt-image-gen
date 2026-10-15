import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { credentialsBody, credentialsReady, emptyCredentials, ServerCredentials } from "./ServerCredentials";
describe("server credential selection", () => {
  it("sends only the selected login method", () => {
    const value={ ...emptyCredentials,accessKey:"original key",username:" owner ",password:"a long password" };
    expect(credentialsBody(value)).toEqual({ accessKey:"original key" });
    expect(credentialsBody({ ...value,method:"account" })).toEqual({ username:"owner",password:"a long password" });
  });
  it("requires the appropriate fields for each method", () => {
    expect(credentialsReady(emptyCredentials)).toBe(false);
    expect(credentialsReady({ ...emptyCredentials,accessKey:"key" })).toBe(true);
    expect(credentialsReady({ ...emptyCredentials,method:"account",username:"owner" })).toBe(false);
    expect(credentialsReady({ ...emptyCredentials,method:"account",username:"owner",password:"password" })).toBe(true);
  });
  it("renders distinct accessible key and username/password controls", () => {
    const props={onChange:()=>{}};
    const key=renderToStaticMarkup(<ServerCredentials {...props} value={emptyCredentials} />);
    expect(key).toContain("Server access key");expect(key).not.toContain('autoComplete="username"');
    const account=renderToStaticMarkup(<ServerCredentials {...props} value={{...emptyCredentials,method:"account"}} />);
    expect(account).toContain('autoComplete="username"');expect(account).toContain('autoComplete="current-password"');expect(account).toContain('type="password"');
  });
});
