@echo off
setlocal
set "IMAGEGEN_INSTALLER_ROOT=%~dp0"
set "IMAGEGEN_COMPANION_APP=%~1"
rem Inline PowerShell needs no .ps1 file or execution-policy change.
powershell.exe -NoProfile -Command ^
 "$ErrorActionPreference='Stop'; try {" ^
 "$root=$env:IMAGEGEN_INSTALLER_ROOT;" ^
 "$skill=Join-Path $root 'companion\skills\imagegenapp\SKILL.md';" ^
 "if (!(Test-Path -LiteralPath $skill)) { throw 'Extract the entire companion ZIP before running this installer.' };" ^
 "$codex=Get-Command codex.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1;" ^
 "if (!$codex) { throw 'Codex CLI was not found on PATH. Install the Codex CLI, open a new terminal, then run this installer again. See https://developers.openai.com/codex/cli/' };" ^
 "$candidates=@();" ^
 "if ($env:IMAGEGEN_COMPANION_APP) { $candidates=@($env:IMAGEGEN_COMPANION_APP) } else {" ^
 "foreach ($hive in @('HKCU:','HKLM:')) {" ^
 "foreach ($branch in @('Software\Microsoft\Windows\CurrentVersion\Uninstall\Image Gen','Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Image Gen')) {" ^
 "$entry=Get-ItemProperty -LiteralPath ($hive+'\'+$branch) -ErrorAction SilentlyContinue;" ^
 "if ($entry.InstallLocation) { $folder=$entry.InstallLocation.Trim([char]34); $candidates+=Join-Path $folder 'image-gen-app.exe'; $candidates+=Join-Path $folder 'Image Gen.exe' }" ^
 "} };" ^
 "$candidates+=Join-Path $root 'Image Gen.exe';" ^
 "$candidates+=Join-Path $root 'image-gen-app.exe';" ^
 "};" ^
 "$app=$candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1;" ^
 "if (!$app) { throw 'Install Image Gen first, or pass its full executable path as the first argument to Install Companion.cmd. Keep portable apps in a permanent folder.' };" ^
 "$app=(Resolve-Path -LiteralPath $app).Path;" ^
 "$codexHome=if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' };" ^
 "$destination=Join-Path $codexHome 'skills\imagegenapp';" ^
 "New-Item -ItemType Directory -Force -Path $destination | Out-Null;" ^
 "$target=Join-Path $destination 'SKILL.md';" ^
 "$previous=if (Test-Path -LiteralPath $target) { [IO.File]::ReadAllBytes($target) } else { $null };" ^
 "Copy-Item -LiteralPath $skill -Destination $target -Force;" ^
 "try {" ^
 "& $codex.Source mcp add imagegenapp -- $app --mcp;" ^
 "if ($LASTEXITCODE -ne 0) { throw 'Codex could not register the companion. Check its error above and try again.' }" ^
 "} catch { if ($null -ne $previous) { [IO.File]::WriteAllBytes($target,$previous) } else { Remove-Item -LiteralPath $target }; throw };" ^
 "Write-Host ('Companion installed for: '+$app);" ^
 "Write-Host 'Open a fresh Codex desktop chat to use $imagegenapp.'" ^
 "} catch { Write-Host ('Installation failed: '+$_.Exception.Message); exit 1 }"
set "IMAGEGEN_RESULT=%ERRORLEVEL%"
if not "%IMAGEGEN_NO_PAUSE%"=="1" pause
exit /b %IMAGEGEN_RESULT%
