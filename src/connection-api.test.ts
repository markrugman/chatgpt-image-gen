import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("browser server version reporting", () => {
  it("reads an existing server health endpoint alongside its storage status", async () => {
    vi.stubGlobal("document", { baseURI: "http://imagegen.test/" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ connected: true, online: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ service: "image-gen-server", version: "0.7.0" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await api("server_status")).toEqual({ connected: true, online: true, serverVersion: "0.7.0" });
    expect(String(fetcher.mock.calls[1][0])).toBe("http://imagegen.test/health");
  });
  it("keeps connection controls available if health reporting fails", async () => {
    vi.stubGlobal("document", { baseURI: "http://imagegen.test/" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ connected: true, online: true })))
      .mockRejectedValueOnce(new Error("Unavailable")));
    expect(await api("server_status")).toEqual({ connected: true, online: true });
  });
});
