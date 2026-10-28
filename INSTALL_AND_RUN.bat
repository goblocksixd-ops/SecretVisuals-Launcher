@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "package.json" (
  echo ERROR: package.json is missing.
  echo Extract ALL files from the ZIP into one folder, then run this BAT again.
  pause
  exit /b 1
)

if not exist "src\main.js" (
  echo ERROR: src\main.js is missing. The ZIP was not extracted completely.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js LTS is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing launcher dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting SecretVisuals Launcher...
call npm start
if errorlevel 1 pause
