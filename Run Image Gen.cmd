@echo off
setlocal
cd /d "%~dp0"
set "IMAGEGEN_BUILD=%LOCALAPPDATA%\ImageGenBuild\target"
if exist "%~dp0outputs\Image Gen 0.8.4 Portable\Image Gen.exe" (
  start "" "%~dp0outputs\Image Gen 0.8.4 Portable\Image Gen.exe"
  exit /b 0
)
if exist "%~dp0outputs\Image Gen 0.8.3 Portable\Image Gen.exe" (
  start "" "%~dp0outputs\Image Gen 0.8.3 Portable\Image Gen.exe"
  exit /b 0
)
if exist "%~dp0outputs\Image Gen 0.8.0 Portable\Image Gen.exe" (
  start "" "%~dp0outputs\Image Gen 0.8.0 Portable\Image Gen.exe"
  exit /b 0
)
if exist "%~dp0outputs\Image Gen 0.6.0.exe" (
  start "" "%~dp0outputs\Image Gen 0.6.0.exe"
  exit /b 0
)
if exist "%~dp0outputs\Image Gen.exe" (
  start "" "%~dp0outputs\Image Gen.exe"
  exit /b 0
)
if exist "%IMAGEGEN_BUILD%\release\image-gen-app.exe" (
  start "" "%IMAGEGEN_BUILD%\release\image-gen-app.exe"
  exit /b 0
)
echo Build the application first with Build Image Gen.cmd.
pause
