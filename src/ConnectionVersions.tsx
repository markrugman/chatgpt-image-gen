import { version as interfaceVersion } from "../package.json";
import { isBrowser } from "./api";
import type { ServerStatus } from "./ServerSettings";

export function versionComparison(status: ServerStatus | null, clientVersion: string) {
  if (!status) return "Checking versions…";
  if (!status.connected) return "Connect to a server to compare versions.";
  if (!status.online) return "Server offline · versions cannot be confirmed.";
  if (!status.serverVersion) return "This server does not report its version.";
  return status.serverVersion === clientVersion ? "Versions match" : "Versions differ";
}

export function ConnectionVersions({ status }: { status: ServerStatus | null }) {
  const clientVersion = isBrowser ? interfaceVersion : status?.nativeVersion || interfaceVersion;
  const mismatch = !!status?.connected && status.online && !!status.serverVersion && status.serverVersion !== clientVersion;
  return (
    <section className="connection-versions" aria-label="App and server versions">
      <dl>
        <dt>{isBrowser ? "Browser interface" : "Native app"}</dt>
        <dd>{clientVersion}</dd>
        <dt>{status?.connected && !status.online ? "Server · last known" : "Server"}</dt>
        <dd>{!status ? "Checking…" : !status.connected ? "Not connected" : status.serverVersion || "Not reported"}</dd>
      </dl>
      <p className={mismatch ? "version-mismatch" : undefined}>{versionComparison(status, clientVersion)}</p>
    </section>
  );
}
