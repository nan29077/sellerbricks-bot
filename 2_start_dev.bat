@echo off
cd /d "%~dp0"
echo Starting sellerbricks-bot dev server on port 3071 ...
echo Admin page: http://localhost:3071/admin
echo Press Ctrl+C to stop.
call npm run dev
pause
