@echo off
cd /d "%~dp0"
node scripts\android-worker.mjs start
if errorlevel 1 pause
