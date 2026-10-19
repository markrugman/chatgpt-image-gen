@echo off
setlocal
cd /d "%~dp0"
node -e "fetch('http://127.0.0.1:4175/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
if not errorlevel 1 (
  start "" "http://127.0.0.1:4175"
  exit /b 0
)
call npm.cmd run build
if errorlevel 1 exit /b 1
echo Open http://127.0.0.1:4175 when the preview is ready.
echo This uses disposable sample data and disables generation.
echo Keep this window open while reviewing. Press Ctrl+C to stop.
node scripts/responsive-review.mjs
