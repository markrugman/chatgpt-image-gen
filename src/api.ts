import { invoke } from "@tauri-apps/api/core";
import {
  listen as nativeListen,
  type EventCallback,
} from "@tauri-apps/api/event";
import { openUrl as nativeOpenUrl } from "@tauri-apps/plugin-opener";
export const isDesktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isBrowser = !isDesktop;
export async function openUrl(url: string) {
  if (isDesktop) return nativeOpenUrl(url);
  window.open(url, "_blank", "noopener,noreferrer");
}
export async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw Error("Select and copy the displayed code");
}
export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<() => void> {
  if (isDesktop) return nativeListen<T>(event, handler);
  if (event !== "jobs-changed" && event !== "login-completed") return () => {};
  const timer = setInterval(
    () => {
      if (
        event === "login-completed" &&
        !document.querySelector(".device-login")
      )
        return;
      handler({ event, id: 0, payload: undefined as T });
    },
    event === "jobs-changed" ? 1500 : 2000,
  );
  return () => clearInterval(timer);
}
function download(bytes: Uint8Array, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return name;
}
async function webRequest(path: string, body?: unknown): Promise<Response> {
  const response = await fetch(new URL(path, document.baseURI), {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Imagegen-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event("imagegen-session-expired"));
    throw Error("Your server session has ended. Sign in again to continue.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Error(error.error || `Server request failed (${response.status})`);
  }
  return response;
}
async function webApi<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (command === "save_export") {
    const raw = atob(String(args.data));
    return download(
      Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      String(args.extension) === "pdf"
        ? "application/pdf"
        : `image/${args.extension === "jpg" ? "jpeg" : args.extension}`,
      `${args.name}.${args.extension}`,
    ) as T;
  }
  if (command === "backup" || command === "server_save_unsent") {
    const response = await webRequest(
      command === "backup" ? "download/backup" : "download/unsent",
    );
    return download(
      new Uint8Array(await response.arrayBuffer()),
      "application/zip",
      command === "backup"
        ? "Image Gen Backup.zip"
        : "Image Gen Unsent Work.zip",
    ) as T;
  }
  if (command === "web_logout") {
    await webRequest("web/logout", {});
    window.location.reload();
    return undefined as T;
  }
  const result = await (await webRequest(`api/${command}`, args)).json();
  if (command === "server_status") {
    try {
      const health = await (await fetch(new URL("health", document.baseURI), {
        signal: AbortSignal.timeout(3000),
      })).json();
      if (health.service === "image-gen-server") result.serverVersion = health.version;
    } catch { /* Keep connection controls usable if version reporting is unavailable. */ }
  }
  return result;
}
const images = new Map<string, Promise<string>>();
export const api = <T>(command: string, args?: Record<string, unknown>) =>
  isDesktop ? invoke<T>(command, args) : webApi<T>(command, args);
export function imageSource(id: string) {
  if (!images.has(id))
    images.set(
      id,
      api<string>("image_data", { imageId: id }).catch((error) => {
        images.delete(id);
        throw error;
      }),
    );
  return images.get(id)!;
}
export const clearImageCache = () => images.clear();
export async function importImageFile(
  file: File,
  organisationId: string | null,
  replaceId: string | null = null,
) {
  if (file.size > 50_000_000)
    throw new Error("Choose an image smaller than 50 MB");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("The image could not be read"));
    reader.readAsDataURL(file);
  });
  return api<string>("import_asset_data", {
    name: file.name.replace(/\.[^.]+$/, ""),
    data,
    organisationId,
    replaceId,
  });
}
