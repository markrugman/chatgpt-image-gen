import { describe, expect, it } from "vitest";
import { versionComparison } from "./ConnectionVersions";
import type { ServerStatus } from "./ServerSettings";
const connected: ServerStatus = { connected: true, online: true, name: "Workspace", pending: 0, serverVersion: "0.7.1" };
describe("version confirmation", () => {
  it("confirms exact matching versions and identifies differences", () => {
    expect(versionComparison(connected, "0.7.1")).toBe("Versions match");
    expect(versionComparison(connected, "0.7.0")).toBe("Versions differ");
  });
  it("does not claim a match from an offline cache or an older server", () => {
    expect(versionComparison({ ...connected, online: false }, "0.7.1")).toContain("cannot be confirmed");
    expect(versionComparison({ ...connected, serverVersion: null }, "0.7.1")).toContain("does not report");
  });
  it("distinguishes local storage and an unfinished status check", () => {
    expect(versionComparison({ ...connected, connected: false }, "0.7.1")).toContain("Connect to a server");
    expect(versionComparison(null, "0.7.1")).toBe("Checking versions…");
  });
});
