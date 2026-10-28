@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js LTS first.& pause & exit /b 1)
call npm install
if errorlevel 1 (pause & exit /b 1)
call npm run dist
pause
