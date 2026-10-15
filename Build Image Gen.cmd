@echo off
setlocal
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "CARGO_TARGET_DIR=%LOCALAPPDATA%\ImageGenBuild\target"
set "NODE_OPTIONS=--use-system-ca"
call npm.cmd install
if errorlevel 1 exit /b 1
call npm.cmd run tauri -- build --bundles nsis
if errorlevel 1 exit /b 1
if not exist outputs mkdir outputs
copy /y "%CARGO_TARGET_DIR%\release\image-gen-app.exe" "outputs\Image Gen.exe" >nul
if not exist "outputs\runtime" mkdir "outputs\runtime"
xcopy /e /i /y "%CARGO_TARGET_DIR%\release\runtime" "outputs\runtime" >nul
for %%F in ("%CARGO_TARGET_DIR%\release\bundle\nsis\*.exe") do copy /y "%%~fF" "outputs\" >nul
if not exist "companion\bin" mkdir "companion\bin"
copy /y "outputs\Image Gen.exe" "companion\bin\image-gen-app.exe" >nul
echo Built outputs\Image Gen.exe
