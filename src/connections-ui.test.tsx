import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsDialog } from "./dialogs";
beforeEach(() => vi.stubGlobal("window", { location: { host: "imagegen.test" } }));
afterEach(() => vi.unstubAllGlobals());
const props = {
  connection: null,
  error: "",
  onClose: () => {},
  onConnection: async () => {},
  onRefresh: async () => {},
  notify: () => {},
};
describe("direct connection dialogs", () => {
  it("opens ChatGPT controls without the general settings dialog", () => {
    const html = renderToStaticMarkup(<SettingsDialog {...props} panel="chatgpt" />);
    expect(html.match(/<dialog/g)).toHaveLength(1);
    expect(html).toContain("Sign in with ChatGPT");
    expect(html).not.toContain("Your workspace, your way");
    expect(html).not.toContain("Save backup");
  });
  it("opens server controls without the general settings dialog", () => {
    const html = renderToStaticMarkup(<SettingsDialog {...props} panel="server" />);
    expect(html.match(/<dialog/g)).toHaveLength(1);
    expect(html).toContain("Workspace server");
    expect(html).toContain("Sign out of browser");
    expect(html).not.toContain("Your workspace, your way");
    expect(html).not.toContain("Sign in with ChatGPT");
  });
  it("keeps general settings available separately", () => {
    const html = renderToStaticMarkup(<SettingsDialog {...props} />);
    expect(html.match(/<dialog/g)).toHaveLength(1);
    expect(html).toContain("Your workspace, your way");
    expect(html).toContain("Manage workspace server");
    expect(html).toContain("Manage ChatGPT connection");
    expect(html).toContain("App and server versions");
  });
});
