"""Source-only installer tests: fake Docker/curl, no builds or real registration."""
import hashlib
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASH = shutil.which("bash")
if os.name == "nt":
    BASH = str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/bin/bash.exe")

MOCK = r'''#!/usr/bin/env bash
set -eu
name=${0##*/}
printf '%s %s\n' "$name" "$*" >> "$TEST_LOG"
case "$name" in
  uname) [[ $1 == -s ]] && echo Linux || echo x86_64;;
  sleep) :;;
  ip)
    echo '2: eth0 inet 192.168.1.20/24 scope global eth0'
    echo '3: docker0 inet 172.17.0.1/16 scope global docker0'
    if [[ ${TEST_MULTIPLE:-0} == 1 ]]; then echo '4: wlan0 inet 192.168.1.21/24 scope global wlan0'; fi;;
  curl)
    if [[ $* == *'/health'* ]]; then
      [[ ${TEST_FAIL:-} != health ]] || exit 22
      printf '{"service":"image-gen-server","version":"0.8.1","protocol":1}'
    else
      destination= url=
      while (($#)); do
        case "$1" in -o) destination=$2; shift 2;; https://*) url=$1; shift;; *) shift;; esac
      done
      cp "$TEST_ASSETS/${url##*/}" "$destination"
    fi;;
  docker)
    case "$1" in
      ps) [[ ${TEST_FOREIGN:-0} == 0 ]] || echo foreign-container;;
      inspect) echo /another/installation;;
      volume) [[ ${TEST_UNMANAGED:-0} == 1 || -f $TEST_INSTALL/.env ]];;
      pull) [[ ${TEST_FAIL:-} != pull ]];;
      run)
        [[ ${TEST_FAIL:-} != backup ]] || exit 1
        for value in "$@"; do
          if [[ $value == type=bind,src=*,dst=/backup ]]; then
            backup=${value#type=bind,src=}; backup=${backup%,dst=/backup}
          fi
        done
        # Dummy backup files, not actual packaged application or volume archives.
        printf 'test volume bytes' > "$backup/data.tar.gz"
        printf 'test worker bytes' > "$backup/worker.tar.gz";;
      *) :;;
    esac;;
esac
'''


@unittest.skipUnless(BASH and Path(BASH).is_file(), "Bash is required")
class ServerInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="imagegen-distribution-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.install = self.root / "installation with spaces"
        self.assets = self.root / "assets"
        self.bin = self.root / "bin"
        for folder in (self.install, self.assets, self.bin):
            folder.mkdir()
        self.log = self.root / "calls.log"
        self.env = dict(os.environ, TEST_INSTALL=self.install.as_posix(), TEST_ASSETS=self.assets.as_posix(), TEST_LOG=self.log.as_posix())
        for command in ("uname", "docker", "curl", "ip", "sleep"):
            script = self.bin / command
            script.write_text(MOCK, newline="\n", encoding="utf-8")
            script.chmod(0o755)
        for name in ("install.sh", "compose.release.yaml"):
            (self.assets / name).write_bytes((ROOT / "server" / name).read_bytes())
        (self.assets / "server-image.txt").write_text("ghcr.io/markrugman/chatgpt-image-gen@sha256:" + "a" * 64 + "\n")
        self.checksums()
        (self.install / "compose.yaml").write_bytes((ROOT / "server/compose.release.yaml").read_bytes())
        (self.install / "install.sh").write_bytes((ROOT / "server/install.sh").read_bytes())
        self.old_env = ("IMAGEGEN_REPOSITORY=markrugman/chatgpt-image-gen\nIMAGEGEN_RELEASE_VERSION=0.8.0\n"
                        "IMAGEGEN_IMAGE=ghcr.io/markrugman/chatgpt-image-gen@sha256:" + "b" * 64 + "\n"
                        "IMAGEGEN_BIND_ADDRESS=192.168.1.20\nIMAGEGEN_PORT=8787\nIMAGEGEN_WORKER_ENABLED=true\n"
                        "IMAGEGEN_SERVER_TOKEN=test-only-existing-key\n")
        (self.install / ".env").write_text(self.old_env)

    def checksums(self):
        (self.assets / "SHA256SUMS").write_text("".join(
            f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.name}\n"
            for f in self.assets.iterdir() if f.name != "SHA256SUMS"))

    def run_installer(self, *args, prompt_input=None):
        # Explicit bash PATH avoids Windows/MSYS path-list conversion of mock tools.
        command = 'mock_bin=$1; if command -v cygpath >/dev/null; then mock_bin=$(cygpath -u "$mock_bin"); fi; export PATH="$mock_bin:$PATH"; shift; bash "$@"'
        source = ROOT / "server/install.sh"
        if prompt_input is not None:
            # Redirect only prompt input in the fixture; CI has no controlling terminal.
            source = self.root / "prompt-fixture.sh"
            source.write_text((ROOT / "server/install.sh").read_text().replace("< /dev/tty", ""), newline="\n")
        result = subprocess.run([BASH, "-c", command, "test", self.bin.as_posix(),
                                 source.as_posix(), "--directory", self.install.as_posix(), *args],
                                env=self.env, capture_output=True,
                                input=prompt_input.encode() if prompt_input is not None else None, timeout=20)
        result.stdout = result.stdout.decode()
        result.stderr = result.stderr.decode()
        return result

    def calls(self):
        return self.log.read_text() if self.log.exists() else ""

    def test_rerun_is_read_only_and_hides_key_from_redirected_output(self):
        before = {f.name: f.read_bytes() for f in self.install.iterdir()}
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Installed version: 0.8.0", result.stdout)
        self.assertNotIn("test-only-existing-key", result.stdout + result.stderr)
        self.assertNotIn("curl ", self.calls())
        self.assertNotIn("docker pull", self.calls())
        self.assertEqual(before, {f.name: f.read_bytes() for f in self.install.iterdir()})

    def test_update_preserves_key_and_backs_up_both_volumes_before_start(self):
        result = self.run_installer("--update", "--version", "0.8.1")
        self.assertEqual(result.returncode, 0, result.stderr)
        content = (self.install / ".env").read_text()
        self.assertIn("IMAGEGEN_RELEASE_VERSION=0.8.1", content)
        self.assertIn("IMAGEGEN_SERVER_TOKEN=test-only-existing-key", content)
        backups = list((self.install / "backups").iterdir())
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / ".env").read_text(), self.old_env)
        for part in ("data", "worker"):
            self.assertTrue((backups[0] / f"{part}.tar.gz").is_file())
        calls = self.calls()
        self.assertLess(calls.index("docker pull"), calls.index("stop imagegen"))
        self.assertLess(calls.index("src=chatgpt-image-gen_imagegen-worker"), calls.index("up -d"))

    def test_pull_failure_does_not_stop_or_change_server(self):
        self.env["TEST_FAIL"] = "pull"
        result = self.run_installer("--update", "--version", "0.8.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("stop imagegen", self.calls())
        self.assertEqual((self.install / ".env").read_text(), self.old_env)

    def test_backup_failure_restarts_old_server_without_switching(self):
        self.env["TEST_FAIL"] = "backup"
        result = self.run_installer("--update", "--version", "0.8.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("start imagegen", self.calls())
        self.assertNotIn("up -d", self.calls())
        self.assertEqual((self.install / ".env").read_text(), self.old_env)
        self.assertIn("backup", result.stderr.lower())

    def test_health_failure_retains_backup_without_automatic_downgrade(self):
        self.env["TEST_FAIL"] = "health"
        result = self.run_installer("--update", "--version", "0.8.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("IMAGEGEN_RELEASE_VERSION=0.8.1", (self.install / ".env").read_text())
        self.assertTrue(list((self.install / "backups").glob("*/data.tar.gz")))
        self.assertIn("did not become healthy", result.stderr)
        self.assertFalse((self.install / ".install-lock").exists())

    def test_checksum_failure_prevents_pull_and_downtime(self):
        (self.assets / "compose.release.yaml").write_text("tampered")
        result = self.run_installer("--update", "--version", "0.8.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Checksum failed", result.stderr)
        self.assertNotIn("docker pull", self.calls())
        self.assertNotIn("stop imagegen", self.calls())

    def test_existing_foreign_project_is_rejected(self):
        self.env["TEST_FOREIGN"] = "1"
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("original installation directory", result.stderr)

    def test_fresh_install_refuses_existing_volumes(self):
        (self.install / ".env").unlink()
        self.env["TEST_UNMANAGED"] = "1"
        result = self.run_installer("--repository", "markrugman/chatgpt-image-gen", "--version", "0.8.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not adopt", result.stderr)
        self.assertNotIn("docker pull", self.calls())

    def test_fresh_install_detects_host_ip_and_defaults_worker_and_port(self):
        (self.install / ".env").unlink()
        result = self.run_installer("--repository", "markrugman/chatgpt-image-gen", "--version", "0.8.1", prompt_input="\n\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        content = (self.install / ".env").read_text()
        self.assertIn("IMAGEGEN_BIND_ADDRESS=192.168.1.20", content)
        self.assertIn("IMAGEGEN_PORT=8787", content)
        self.assertIn("IMAGEGEN_WORKER_ENABLED=true", content)
        self.assertIn("IMAGEGEN_SERVER_TOKEN=\n", content)
        self.assertIn("http://192.168.1.20:8787", result.stdout)

    def test_multiple_addresses_and_storage_only_choice(self):
        (self.install / ".env").unlink()
        self.env["TEST_MULTIPLE"] = "1"
        result = self.run_installer("--repository", "markrugman/chatgpt-image-gen", "--version", "0.8.1", prompt_input="2\n9090\nn\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        content = (self.install / ".env").read_text()
        self.assertIn("IMAGEGEN_BIND_ADDRESS=192.168.1.21", content)
        self.assertIn("IMAGEGEN_PORT=9090", content)
        self.assertIn("IMAGEGEN_WORKER_ENABLED=false", content)

    def test_mutable_image_reference_is_rejected_before_pull(self):
        (self.assets / "server-image.txt").write_text("ghcr.io/markrugman/chatgpt-image-gen:latest\n")
        self.checksums()
        result = self.run_installer("--update", "--version", "0.8.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no verified immutable server image", result.stderr)
        self.assertNotIn("docker pull", self.calls())

    def test_downgrade_is_rejected_before_download(self):
        result = self.run_installer("--update", "--version", "0.7.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Downgrades require", result.stderr)
        self.assertNotIn("curl ", self.calls())
        self.assertEqual((self.install / ".env").read_text(), self.old_env)


@unittest.skipUnless(os.name == "nt", "Windows companion installer")
class CompanionInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="imagegen-companion-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.skill = self.root / "companion/skills/imagegenapp/SKILL.md"
        self.skill.parent.mkdir(parents=True)
        self.skill.write_text("test skill")
        self.app = self.root / "Installed app/image-gen-app.exe"
        self.app.parent.mkdir()
        self.app.write_text("nonexecutable discovery fixture")
        self.codex_home = self.root / "isolated codex home"
        self.target = self.codex_home / "skills/imagegenapp/SKILL.md"
        self.env = dict(os.environ, IMAGEGEN_INSTALLER_ROOT=str(self.root), CODEX_HOME=str(self.codex_home),
                        IMAGEGEN_COMPANION_APP="", TEST_APP=str(self.app), TEST_ROOT=str(self.root),
                        TEST_CLI_MISSING="0", TEST_CLI_FAILURE="0", TEST_APP_MISSING="0")
        lines = (ROOT / "Install Companion.cmd").read_text().splitlines()
        start = lines.index("powershell.exe -NoProfile -Command ^") + 1
        end = lines.index('set "IMAGEGEN_RESULT=%ERRORLEVEL%"')
        self.script = " ".join(line.strip().removesuffix(" ^")[1:-1] for line in lines[start:end])
        self.mocks = r'''
function Get-Command { if ($env:TEST_CLI_MISSING -ne '1') { [pscustomobject]@{Source='Invoke-TestCodex'} } }
function Get-ItemProperty { if ($env:TEST_APP_MISSING -ne '1') { [pscustomobject]@{InstallLocation=(Split-Path $env:TEST_APP)} } }
function Invoke-TestCodex {
    $args | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $env:TEST_ROOT 'registration.json')
    $global:LASTEXITCODE=if ($env:TEST_CLI_FAILURE -eq '1') { 27 } else { 0 }
}
'''

    def invoke(self):
        return subprocess.run(["powershell.exe", "-NoProfile", "-Command", self.mocks + self.script],
                              env=self.env, capture_output=True, text=True, timeout=20)

    def test_registry_discovery_registers_exact_path_and_respects_codex_home(self):
        import json
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        arguments = json.loads((self.root / "registration.json").read_text(encoding="utf-8-sig"))
        # PowerShell consumes its -- separator for a mocked function (native executables receive it).
        self.assertEqual(arguments, ["mcp", "add", "imagegenapp", str(self.app), "--mcp"])
        self.assertEqual(self.target.read_text(), "test skill")

    def test_explicit_portable_path_overrides_installed_app(self):
        import json
        portable = self.root / "Portable app/Image Gen.exe"
        portable.parent.mkdir()
        portable.write_text("discovery fixture")
        self.env["IMAGEGEN_COMPANION_APP"] = str(portable)
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        arguments = json.loads((self.root / "registration.json").read_text(encoding="utf-8-sig"))
        self.assertIn(str(portable), arguments)

    def test_missing_cli_does_not_install_skill(self):
        self.env["TEST_CLI_MISSING"] = "1"
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Codex CLI was not found", result.stdout)
        self.assertFalse(self.target.exists())

    def test_missing_native_app_explains_next_step(self):
        self.env["TEST_APP_MISSING"] = "1"
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Install Image Gen first", result.stdout)
        self.assertFalse(self.target.exists())

    def test_registration_failure_restores_previous_skill(self):
        self.env["TEST_CLI_FAILURE"] = "1"
        self.target.parent.mkdir(parents=True)
        self.target.write_bytes(b"previous skill\r\n")
        result = self.invoke()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.target.read_bytes(), b"previous skill\r\n")

    def test_real_cmd_wrapper_reports_missing_skill_without_registration(self):
        command = self.root / "Install Companion.cmd"
        shutil.copy2(ROOT / "Install Companion.cmd", command)
        self.skill.unlink()
        self.env["IMAGEGEN_NO_PAUSE"] = "1"
        result = subprocess.run(["cmd.exe", "/d", "/c", str(command)], env=self.env,
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("Extract the entire companion ZIP", result.stdout)
        self.assertFalse(self.target.exists())


if __name__ == "__main__":
    unittest.main()
