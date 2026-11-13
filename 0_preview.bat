@echo off
cd /d "%~dp0"
title sellerbricks-bot preview (port 3071)
set PORT=3071
set PREVIEW_URL=http://localhost:3071/admin
echo ==================================================
echo  sellerbricks-bot preview  -  %PREVIEW_URL%
echo ==================================================

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20 LTS or newer: https://nodejs.org
  pause
  exit /b 1
)

rem --- already running? just open the browser ---
netstat -ano | findstr /r /c:":3071 .*LISTENING" >nul
if not errorlevel 1 (
  echo Port 3071 is already running. Opening browser ...
  start "" "%PREVIEW_URL%"
  timeout /t 2 >nul
  exit /b 0
)

rem --- first run: automatic setup ---
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example  - please change ADMIN_PASSWORD in .env
)
if not exist "node_modules" (
  echo Installing packages ^(npm install^) ...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
if not exist "data\bot.db" (
  echo Creating local database ^(data\bot.db^) ...
  call npx prisma db push --skip-generate
  if errorlevel 1 (
    echo Database setup failed.
    pause
    exit /b 1
  )
)

rem --- open browser after the server starts ---
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 60;$i++){try{Invoke-WebRequest -UseBasicParsing http://localhost:3071/health -TimeoutSec 1 | Out-Null; break}catch{Start-Sleep 1}}; Start-Process '%PREVIEW_URL%'"

echo Starting dev server on port 3071 ...  ^(Ctrl+C to stop^)
call npm run dev
pause
