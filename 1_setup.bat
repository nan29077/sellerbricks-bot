@echo off
cd /d "%~dp0"
echo ==================================================
echo  sellerbricks-bot setup
echo ==================================================
echo [1/3] Checking Node.js ...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20 LTS or newer: https://nodejs.org
  pause
  exit /b 1
)
node -v
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Created .env from .env.example  - please change ADMIN_PASSWORD in .env
)
echo [2/3] Installing packages ^(npm install^) ...
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)
echo [3/3] Creating local database ^(data\bot.db^) ...
call npx prisma db push --skip-generate
if errorlevel 1 (
  echo Database setup failed.
  pause
  exit /b 1
)
echo.
echo Setup complete. Next: run 2_start_dev.bat
pause
