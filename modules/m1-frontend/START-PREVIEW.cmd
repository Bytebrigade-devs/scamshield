@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22.18 or newer, then try again.
 pause
 exit /b 1
)
if not exist out\index.html (
 echo Build the project first: npm ci, then npm run build.
 pause
 exit /b 1
)
node scripts\preview.mjs
pause
