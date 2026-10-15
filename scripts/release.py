"""Release-only helpers. `check` is read-only; other commands create packages."""
import argparse
import hashlib
import json
import re
import shutil
import tomllib
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check(version):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
        raise ValueError("Use a stable X.Y.Z version without a v prefix")
    for name in ("package.json", "package-lock.json", "src-tauri/tauri.conf.json", "companion/plugin.json"):
        data = json.loads((ROOT / name).read_text(encoding="utf-8"))
        if data["version"] != version:
            raise ValueError(f"Version mismatch: {name}")
        if name == "package-lock.json" and data["packages"][""]["version"] != version:
            raise ValueError("Version mismatch in package-lock root package")
    for name in ("src-tauri/Cargo.toml", "server/Cargo.toml"):
        data = tomllib.loads((ROOT / name).read_text(encoding="utf-8"))
        if data["package"]["version"] != version:
            raise ValueError(f"Version mismatch: {name}")
    for name, package in (("src-tauri/Cargo.lock", "image-gen-app"), ("server/Cargo.lock", "image-gen-server")):
        data = tomllib.loads((ROOT / name).read_text(encoding="utf-8"))
        if next(p["version"] for p in data["package"] if p["name"] == package) != version:
            raise ValueError(f"Version mismatch: {name}")


def archive(destination, entries):
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as output:
        for source, name in entries:
            output.write(source, name)
    with zipfile.ZipFile(destination) as output:
        if output.testzip():
            raise ValueError(f"Corrupt ZIP: {destination}")


def companion_entries():
    entries = [(ROOT / "LICENSE", "LICENSE.txt"),
            (ROOT / "Install Companion.cmd", "Install Companion.cmd"),
            (ROOT / "companion/skills/imagegenapp/SKILL.md", "companion/skills/imagegenapp/SKILL.md"),
            (ROOT / "README.md", "README.md"), (ROOT / "GLOSSARY.md", "GLOSSARY.md")]
    entries += [(file, file.relative_to(ROOT).as_posix()) for file in sorted((ROOT / "docs").rglob("*.md"))]
    return entries


def windows(version, target, output):
    release = target / "release"
    required = [release / "image-gen-app.exe", release / "runtime/codex.exe",
                release / "LICENSE.txt",
                release / "runtime/codex-code-mode-host.exe", release / "runtime/LICENSE.txt",
                release / "runtime/NOTICE.txt", release / "THIRD-PARTY-NOTICES.txt"]
    installers = list((release / "bundle/nsis").glob("*.exe"))
    if len(installers) != 1:
        raise ValueError("Expected exactly one NSIS installer in the clean build directory")
    for file in required + installers:
        if not file.is_file() or not file.stat().st_size:
            raise ValueError(f"Required release file missing: {file}")
        if file.suffix == ".exe":
            with file.open("rb") as stream:
                if stream.read(2) != b"MZ":
                    raise ValueError(f"Invalid Windows executable: {file}")
    output.mkdir(parents=True, exist_ok=True)
    prefix = f"Image-Gen-{version}-Windows-x64"
    shutil.copy2(installers[0], output / f"{prefix}-Setup.exe")
    entries = companion_entries() + [(release / "image-gen-app.exe", "Image Gen.exe"),
                                    (release / "THIRD-PARTY-NOTICES.txt", "THIRD-PARTY-NOTICES.txt")]
    entries += [(file, file.relative_to(release).as_posix()) for file in (release / "runtime").rglob("*") if file.is_file()]
    archive(output / f"{prefix}-Portable.zip", entries)
    archive(output / f"Image-Gen-{version}-Companion.zip", companion_entries())


def server_assets(output):
    output.mkdir(parents=True, exist_ok=True)
    # LF is required even when called from a Windows working tree.
    for name in ("install.sh", "compose.release.yaml"):
        (output / name).write_bytes((ROOT / "server" / name).read_bytes().replace(b"\r\n", b"\n"))


def checksums(output):
    lines = []
    for file in sorted(output.iterdir()):
        if file.is_file() and file.name != "SHA256SUMS":
            with file.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            lines.append(f"{digest}  {file.name}\n")
    (output / "SHA256SUMS").write_text("".join(lines), encoding="ascii", newline="\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "windows", "server-assets", "checksums"])
    parser.add_argument("--version")
    parser.add_argument("--target", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command in ("check", "windows"):
        check(args.version or "")
    if args.command == "windows":
        if not args.target or not args.output:
            parser.error("windows needs --target and --output")
        windows(args.version, args.target, args.output)
    elif args.command in ("server-assets", "checksums"):
        if not args.output:
            parser.error("This command needs --output")
        {"server-assets": server_assets, "checksums": checksums}[args.command](args.output)
