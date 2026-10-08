@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Installe Node.js 24 puis relance ce fichier.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4173"
node scripts/serve-offline.mjs
pause
