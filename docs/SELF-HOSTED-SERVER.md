# Image Gen desktop and browser access (0.8.0)

## Published-image installer (prepared in source)

The new `server/install.sh` and `server/compose.release.yaml` provide the [README server setup](../README.md#2-server--debianubuntu-linux-x64) once a complete GitHub release and public server image have been published. The installer is qualified separately from existing manual deployments. The existing source-build `server/compose.yaml` and current server configuration are unchanged.

The installer defaults to `~/.local/share/chatgpt-image-gen-server`, uses the fixed Compose project `chatgpt-image-gen`, and creates `chatgpt-image-gen_imagegen-data` and `chatgpt-image-gen_imagegen-worker` volumes. Do not use it to adopt a manually configured deployment or the current `imagegen` deployment. Run it under the same user and with the same `--directory` for future maintenance. Keep its private `.env`, Compose file and installed script together. Do not run two copies in different directories to manage the same fixed project.

Rerunning the installed script shows status, URL and key without downloading or changing versions. Keys are printed only to an interactive terminal, never redirected output. The initial generated key is stored in the workspace volume. A configured `IMAGEGEN_SERVER_TOKEN` remains authoritative. Do not enable shell tracing when handling keys.

For explicit `--update --version X.Y.Z`, the installer pulls the new digest first, then stops only its service and backs up both complete volumes and configuration into a dated private `backups/` folder. Both volumes include private records: workspace login/session data and key, and worker ChatGPT credentials respectively. Keep an off-host private copy; backups on the same disk are not disaster recovery. The script retains backups until you deliberately remove them.

If backup fails before configuration changes, the installer attempts to restart the previous service. If startup or health fails after switching, it retains the backup and new configuration without automatically downgrading data. Inspect status/logs from the installation directory:

```sh
docker compose --env-file .env -p chatgpt-image-gen -f compose.yaml ps
docker compose --env-file .env -p chatgpt-image-gen -f compose.yaml logs --tail 100 imagegen
```

For manual rollback, first stop this service. Preserve the failed installation's full volumes privately if it may contain newer work. Restore **both complete volumes** from the same backup (`data.tar.gz`, `worker.tar.gz`), clearing the target volume contents before extracting so newer database files are not mixed with older ones. Preserve archived ownership (UID/GID 10001 for application records). Restore that backup's `.env`, `compose.yaml` and `install.sh`, then start with `up -d --no-build`. A system administrator should perform this deliberate restore; do not use `down -v` as an update/recovery shortcut. Do not point an older binary at potentially migrated data without restoring its matching backup.

If the script is interrupted and leaves `.install-lock`, verify no installer is running before removing that empty lock directory. The installer handles ordinary exits, Ctrl+C and termination; power loss requires manual inspection. Health failures and previously completed backups remain visible in the installation directory.

## Owner login and remembered browser sessions

Version 0.8.0 is built and deployed (2026-10-15). Keep existing `.env`, workspace volume and worker volume unchanged when upgrading. Server login is separate from the ChatGPT account used for generation.

1. A new server with no configured `IMAGEGEN_SERVER_TOKEN` generates its key once in `/data/server-access-key`. Retrieve it privately with `docker compose --env-file server/.env -f server/compose.yaml exec imagegen cat /data/server-access-key`. A configured access key takes precedence and is never changed by account setup. Existing deployments must retain their current environment key.
2. Open the server in a browser and choose **Server access key** to prove ownership. First login offers a personal username/password account or **Use access key only**. There is no unauthenticated account registration.
3. Both the access key and username/password remain valid login methods after account creation. The key remains an alternative if the password is forgotten. One owner account serves the same personal workspace; this adds no multiuser separation.
4. **Keep me signed in** stores a persistent HttpOnly/SameSite=Strict session cookie for up to 90 days, with Secure on HTTPS. Without it, a browser-session cookie expires server-side after 12 hours. Sessions survive server restarts; Sign out revokes the current session and clears its cookie. No password or access key is stored in localStorage.
5. Native clients accept either method. Password login obtains a 90-day bearer token stored in the OS credential vault; the application does not save the password. Existing key-based connections keep working. Expired sign-in can be renewed in workspace-server management.
6. If initial account setup was skipped, browser workspace-server management offers **Set up an owner login**. Creating the account requires a recent key-verified session (10 minutes); re-enter the key when prompted.

Passwords use salted Argon2id PHC hashes through [RustCrypto Argon2](https://docs.rs/argon2/0.5.3/argon2/). The separate `/data/auth.sqlite3` stores the single owner, setup preference and hashes of revocable random session tokens. Account changes do not edit workspace SQLite, original media, server identity, access key or ChatGPT worker credentials. Workspace/export ZIPs contain no account/session records; protect full server-volume backups because they include login records and, for automatically configured new servers, the access-key file. Restore those private server files only as part of the full server backup.

Sign-in attempts have a shared 20-per-minute limit for this personal server. Owner setup requires key ownership, writes retain existing CSRF/origin checks, and sign-in bodies are limited to 4 KB. Existing LAN HTTP and HTTPS deployment choices remain unchanged.


Open the server's address in a browser to use the same editor, organisations, projects, designs, page conversations and asset library. Desktop apps continue to support local-only storage and local generation. The browser UI is the shared React interface served by Rust; a WebAssembly rewrite is not required.

## Browser sign-in and generation

Enter your private server access key or owner username/password on the welcome page. The key is exchanged for an HttpOnly, SameSite=Strict session cookie and is not saved in localStorage/sessionStorage. Without Keep me signed in, browser sessions last up to 12 hours; remembered sessions last up to 90 days. Sessions survive server restarts. Sign out from Settings. Use HTTPS or a private VPN outside the home network.

The optional server worker is enabled by setting `IMAGEGEN_WORKER_ENABLED=true` in `server/.env`, then recreating the container. Default is false. With it disabled, browser storage, editing, assets and export remain available; generation requires enabling/signing in the worker.

In browser Settings, **Server ChatGPT connection → Sign in with ChatGPT** starts managed device-code sign-in. Complete the displayed code at the official ChatGPT sign-in page. The worker uses this server account for browser requests. Desktop requests keep using each PC's own sign-in and runtime. There is no separately billed Image API fallback.

Browser generation keeps running when you close a tab or disconnect; reopen the server to see the request and its result. A server/container restart interrupts active requests, which are shown as failed on reopening; saved designs remain intact and you can retry. Finished image versions and page chats persist. Conflicting edits keep the existing recovery-copy protection.

The worker stores its managed credentials, provider sessions, generated output and unsent recovery cache on the separate `imagegen-worker` Docker volume. Workspace ZIP backups exclude credentials. Protect and back up that private volume separately if preserving server sign-in/session state is needed; signing in again also works. One private server currently uses one shared owner/workspace and one worker account, not individual public user accounts.

## Desktop installation without Codex

The Windows installer includes the pinned managed generation runtime and its companion helper executable. No separate Codex installation or Node.js installation is required on the user's PC. Choose **Manage** beside ChatGPT connection in Settings, then **Sign in with ChatGPT** on a new PC. Existing managed sign-in on that PC can be reused. Token refresh is managed by the runtime.

The portable distribution is now a ZIP. Extract the **entire** folder, including `runtime/`, then run Image Gen.exe. The runtime folder contains the required executables and upstream licence/notice. Do not move only the app EXE onto another PC. Source builds download the pinned official runtime through npm's integrity-checked package installation, into local build cache, then bundle it as resources.

The bundled runtime version is `0.162.0-alpha.17.2`, qualified with actual image generation on Windows and Linux. Both the main executable and the companion code-mode host are required. Runtime upgrades must repeat these integration checks; a capability flag alone does not prove image generation works.

## Export and original assets in a browser

Browser exports and workspace backups download through the browser. PNG, JPEG quality controls, RGB/CMYK PDF, bleed and crop marks use the same export logic. Rust image processing and profile-managed CMYK conversion run on the server. Original-pixel crop/background erase and editable JSON analysis/recreation are shared with desktop. Restore remains disabled for the shared server; switch a desktop app to local mode to restore a workspace backup.

## Build and run

The whole source layout is required because the desktop and server share Rust modules and the interface. Use Docker Engine with Compose and BuildKit:

```sh
cp server/.env.example server/.env
chmod 600 server/.env
openssl rand -hex 32
```

For a new server, either set `IMAGEGEN_SERVER_TOKEN` to your generated key or leave it empty for automatic generation. Existing servers must retain their key. Choose a name, and set `IMAGEGEN_BIND_ADDRESS` to the VM LAN IP. Set `IMAGEGEN_WORKER_ENABLED=true` if browser generation is wanted. Default binding is host-local `127.0.0.1`, port 8787. Then:

```sh
docker compose --env-file server/.env -p imagegen -f server/compose.yaml up -d --build
```

Browse to `http://YOUR-VM-IP:8787`. Health is available at `/health`; all workspace/media/browser operations require authentication. Keep the same Compose project name when upgrading to retain data volumes. Default desktop connection still uses this same URL and access key, with an explicit copy to an empty server when desired.

## Existing manual deployments

Keep using the original project name, configuration, workspace and private worker volume for an existing server. The published-image installer creates a separate installation and does not migrate an existing deployment. Back up both volumes and private configuration before any deliberate migration.

# Earlier storage behaviour and backup reference (0.6.0)

The desktop app works by itself. A private server lets your computers open the same organisations, projects, documents, page conversations, assets, tags and custom sizes. Generation runs on the computer that starts it; that computer must remain open until it finishes. In 0.6.0 the server did not run Codex or store ChatGPT credentials; 0.7.0 adds the optional separate worker described above. Requests are not transferred to another computer.

## Run on a Docker host

Use a Linux VM with Docker Engine and Compose, including a Proxmox Debian/Ubuntu VM. Extract the **whole source package**, or the dedicated server source package, then:

```sh
cp server/.env.example server/.env
chmod 600 server/.env
openssl rand -hex 32
```

Edit `server/.env`: replace the access-key placeholder with the generated value, choose a server name, and set `IMAGEGEN_BIND_ADDRESS` to the VM's private LAN IP. The default `127.0.0.1` accepts only host-local connections. Default port: 8787. Do not commit or share the real `.env`.

```sh
docker compose --env-file server/.env -p imagegen -f server/compose.yaml up -d --build
curl http://127.0.0.1:8787/health
```

Use the bind IP instead of 127.0.0.1 when binding to a LAN IP. `/health` discloses only service/version/protocol. All workspace/media requests require the access key. This is a single-owner private workspace, with one shared access key, not a public account service.

The container runs as a non-root user, has a read-only root filesystem and keeps SQLite plus original media on the named `imagegen_imagegen-data` volume. The image uses a multi-stage Rust build; there is no desktop/ChatGPT runtime in it. Keep the database on local Docker storage, not a network filesystem or OneDrive. Restart policy is `unless-stopped`.

## Connect a desktop

1. Open **Settings and help → Your workspace storage**.
2. Enter `http://YOUR-VM-LAN-IP:8787` and the access key, then **Connect to server**. Internet addresses require HTTPS. Private LAN HTTP is supported.
3. On an empty server, choose **Copy local workspace to server… → Copy and verify**. Every original image is uploaded and SHA-256 checked, then metadata is committed atomically and re-read for verification. Your local workspace stays unchanged. The server refuses this copy if it already contains work.
4. Connect the other computer with the same URL/key. Each computer signs into ChatGPT separately.

**Use local workspace** reopens the original creations on that computer. Connecting does not automatically merge, upload or replace them. An existing populated server cannot be overwritten by this copy operation. A lost access key can be rotated by changing the Docker `.env` and recreating the container; enter the new key on each desktop.

The URL and server identity are saved locally. The access key is saved in the operating system's credential vault and is excluded from backups. On Linux, a working Secret Service credential store is required. ChatGPT tokens remain managed by the client's Codex installation.

## Sync, offline use and conflicts

Changes save to the server immediately. Other computers refresh about every five seconds while idle; refresh pauses during forms, typing, dragging and local generation. You can refresh explicitly from Settings. The status badge opens connection settings and indicates cached/offline viewing or unsent work.

Different documents can be edited concurrently. If two computers change the same document or asset from different starting states, the server rejects the stale save rather than overwriting newer work. Page history and image versions remain together. Generations retain their starting document state for this check, even if another computer edits it during generation.

When offline, previously cached designs remain viewable. Uncached images need a connection. Edits cannot be saved offline. Failed remote saves keep an unsent recovery snapshot and any new image bytes on the starting computer. **Save unsent work backups** exports a ZIP containing individual workspace backup ZIPs. Unzip it, switch to the local workspace, save a current backup, and restore the appropriate individual recovery ZIP if needed. Recovery copies are retained; there is no automatic replay/force-overwrite. A backup containing uncached server images needs the server online to download them.

The saved chat transcript and current artwork can be used when the provider's previous thread is unavailable on another computer. Generation progress, request cancellation and the local companion bridge remain specific to the starting computer.

## Backup and upgrade

Desktop **Save backup** saves the currently selected workspace and all referenced media, without credentials. **Restore backup** is available in local mode only; it cannot replace the shared server. Normal desktop updates retain the app identity and local data folder, and save `before-v0.6.0.zip` on first opening of an existing workspace before writes. Previous version backups are retained.

For a consistent server backup, stop this service briefly and archive its entire volume (SQLite and media together). Example, from the source directory:

```sh
mkdir -p backups
docker compose --env-file server/.env -p imagegen -f server/compose.yaml stop imagegen
docker run --rm -v imagegen_imagegen-data:/data:ro -v "$PWD/backups:/backup" debian:bookworm-slim sh -c 'tar -czf /backup/imagegen-data.tar.gz -C /data .'
docker compose --env-file server/.env -p imagegen -f server/compose.yaml start imagegen
```

Also back up `server/.env` privately. Use dated filenames for repeated backups. To restore, stop the service and restore the complete archive to its volume, preserving UID/GID 10001 ownership. Do not run `docker compose down -v`: `-v` deletes persistent volumes.

Keep the Compose project name `imagegen` across releases to keep the same volume. Back up before upgrading. Extract the new version, securely copy your `.env`, then run the same `up -d --build` command. A server opening existing data saves a versioned pre-upgrade workspace ZIP as well. Downgrading should use a matching whole-volume backup if the workspace format changes in a future version.

## Internet access

Use a VPN for private remote access, or put an HTTPS reverse proxy such as Nginx Proxy Manager in front. Point the proxy at the VM's LAN IP and port 8787; enable a valid certificate and set a request-body limit of at least 50 MB. Do not expose plain HTTP with the access key over the public internet. The client verifies TLS certificates and does not follow redirects with the key. A proxy may use a path prefix if it strips that prefix before forwarding to this API.

This release deploys on the home network. Public DNS, certificates and router forwarding are separate configuration choices. No existing Tales Past Midnight or other container needs changing.
