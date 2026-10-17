@echo off
rem GO Classes Social Studio - Created by Mrinal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer from https://nodejs.org then try again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing Social Studio...
  call npm install
  if errorlevel 1 goto failed
  call npm run setup
  if errorlevel 1 goto failed
)
echo Open http://localhost:3000 after the server starts.
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Setup or startup failed. See the message above and README.md.
pause
exit /b 1
