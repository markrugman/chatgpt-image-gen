# Image Gen

**Your images deserve a home of their own.**

Creating an image is easy. Finding it again weeks later shouldn’t be the hard part.

When you generate images across ChatGPT and Codex, they can end up scattered across conversations, mixed in with unrelated work, and buried among different ideas and versions. Finding the right one often means remembering exactly what you asked for—and where you asked it.

Image Gen App gives image creation a dedicated, organised home. Group your work into **organisations** for different clients, businesses, or personal interests, then create **projects** for individual campaigns, events, or ideas. Each design can contain multiple pages, with its images, conversations, and revision history kept together.

Experiment without losing earlier work: revisit previous versions, continue from an older revision, or explore a different direction while keeping the alternatives recoverable. Build libraries of reusable assets and uploads, share them across organisations, and use searchable tags to make your work easier to find.

When your design is ready, export individual pages as **PNG or JPEG**, or complete documents as **multi-page PDFs**, with options for bleed, crop marks, and RGB or CMYK output. From the first prompt to the finished export, everything stays organised in one workspace—so you can spend less time searching and more time creating.

Use the native app on its own, or connect it to your private server. The optional Codex companion starts designs from a chat on the same computer.

Download the Windows app, companion and server setup files from [GitHub Releases](https://github.com/markrugman/chatgpt-image-gen/releases). The server image is distributed through GitHub Container Registry. Downloads do not require a GitHub account.

## 1. Native app — Windows x64

1. Open [Releases](https://github.com/markrugman/chatgpt-image-gen/releases) and download `Image-Gen-VERSION-Windows-x64-Setup.exe` from a published release.
2. Close Image Gen, run Setup, and keep **Upgrade** selected if an older installation is found. Existing creations stay in the same data folder.
3. Open Image Gen. In **Settings**, choose **Manage** beside the ChatGPT connection, then **Sign in with ChatGPT**. Complete the displayed sign-in instructions.
4. Add an organisation, project and design. Enter a prompt and choose **Generate / Edit**, or **Discuss** for advice.

The app includes its generation runtime. Node.js, Rust and a separate Codex installation are not needed to use the native app. Windows WebView2 is required; Setup can install it if missing. macOS, Linux desktop and ARM packages await validation.

From 0.8.3, desktop generation uses only Image Gen's bundled runtime and its own ChatGPT sign-in. Credentials and runtime history stay under `%LOCALAPPDATA%\com.mark.imagegenapp\sessions\codex`, separate from your normal Codex recent chats. Sign in once inside Image Gen after upgrading; existing designs and their saved conversations are retained. Old Image Gen entries already in Codex are not removed automatically.

**Portable option:** download `Image-Gen-VERSION-Windows-x64-Portable.zip`, extract the entire ZIP into a permanent folder, and run `Image Gen.exe`. Keep the `runtime` folder beside it. Do not copy just the EXE.

**Optional shared storage:** after installing the server below, open workspace-server management in Settings and connect using its URL and Server Access Key, or your owner username/password. Connecting does not upload existing local work. Use **Copy local workspace to server** explicitly if the server is empty. Each desktop uses its own ChatGPT sign-in for generation.

## 2. Server — Debian/Ubuntu Linux x64

The server provides the browser editor and shared workspace. Install [Docker Engine](https://docs.docker.com/engine/install/) and the [Compose plugin](https://docs.docker.com/compose/install/linux/) first. Run installation as a user allowed to use Docker. The script requires Bash, curl, sha256sum and iproute2; it does not install Docker or change the host firewall.

Choose a published version. For version `0.8.4`:

```sh
VERSION=0.8.4
REPOSITORY=markrugman/chatgpt-image-gen
curl -fL "https://github.com/$REPOSITORY/releases/download/v$VERSION/install.sh" -o install.sh && \
curl -fL "https://github.com/$REPOSITORY/releases/download/v$VERSION/SHA256SUMS" -o SHA256SUMS
```

After the downloads succeed, review `install.sh`, then verify and run it:

```sh
awk '$2 == "install.sh"' SHA256SUMS | sha256sum --check --strict && \
bash install.sh --repository "$REPOSITORY" --version "$VERSION"
```

The installer pulls the release's immutable image, detects the computer's private IP, asks you to choose if several are available, and offers port **8787** and browser generation **Yes**. It installs into `~/.local/share/chatgpt-image-gen-server`; use `--directory /your/path` to choose another location.

When healthy, it displays the installed version, connection URL and **Server Access Key**. The key is shown only in an interactive terminal. Open the URL in a browser, enter the key, then optionally create your owner username/password. For browser generation, open **Settings → Server ChatGPT connection → Sign in with ChatGPT**. Generation continues if you close the browser tab.

Run this again at any time to show status, URL and key without changing the installation:

```sh
bash "$HOME/.local/share/chatgpt-image-gen-server/install.sh"
```

To update, choose a specific published version:

```sh
bash "$HOME/.local/share/chatgpt-image-gen-server/install.sh" --update --version X.Y.Z
```

Updates pull first, stop this server briefly, and back up both its workspace and private worker volumes plus configuration before changing versions. The key, workspace and ChatGPT sign-in are retained. Backups live in the installation's private `backups/` directory. Failed backups restart the previous server; failures after switching versions retain the backup and configuration for manual recovery. There is no automatic downgrade of migrated data.

The installer uses its own `chatgpt-image-gen` Compose project and refuses to adopt existing volumes. Existing manually deployed servers, including this project's current server, must continue using their original configuration. For remote internet access use HTTPS or a private VPN. See [server operations and recovery](docs/SELF-HOSTED-SERVER.md).

## 3. Companion — local Codex integration on Windows

1. Install the native app above and the [Codex CLI](https://developers.openai.com/codex/cli/), with `codex.exe` available on PATH.
2. Download `Image-Gen-VERSION-Companion.zip` from the same release and extract the entire ZIP.
3. Run **Install Companion.cmd**. It finds the installed native app and registers the local `imagegenapp` connection and skill. It respects `CODEX_HOME` when set.
4. Open a fresh Codex desktop chat. For example: “Use $imagegenapp to create an A4 poster for Courtyard for Halloween Cocktail Hour.”

For a portable app, run the installer included in the portable folder, or specify its permanent path from Command Prompt:

```bat
"Install Companion.cmd" "C:\Apps\Image Gen\Image Gen.exe"
```

If you move a portable app later, rerun the companion installer with its new path. You can rerun the installer to refresh registration. The companion starts a new conversation in Image Gen; the rest of the design work happens there. It needs the native app on the same computer and is optional for browser use.

## Backups and further help

Local creations live under `%LOCALAPPDATA%\com.mark.imagegenapp`. Use Settings to save or restore a workspace ZIP. Keep the live workspace outside OneDrive or network-synchronised folders. Server-volume backups also contain private account/sign-in records; protect them separately from ordinary exports.

- [Server setup, authentication, backups and recovery](docs/SELF-HOSTED-SERVER.md)
- [Release history](docs/CHANGELOG.md)
- [Asset extraction](docs/ASSET-EXTRACTION.md) and [advanced export](docs/ADVANCED-EXPORT.md)
- [Build and release workflow for maintainers](docs/RELEASING.md)
- [Product design](docs/DESIGN.md) and [validation evidence](docs/VALIDATION.md)

## License

Image Gen is available under the [MIT License](LICENSE), allowing reuse, modification, redistribution and commercial use while retaining its copyright and license notice. Bundled third-party components retain their own licenses; see [third-party notices](src-tauri/THIRD-PARTY-NOTICES.txt) and the runtime's included license and notice files.
