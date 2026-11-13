@echo off
cd /d "%~dp0"
title sellerbricks-bot - commit and push to main
set REPO_URL=https://github.com/nan29077/sellerbricks-bot.git

where git >nul 2>nul
if errorlevel 1 (
  echo Git is not installed. Install Git for Windows: https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo Initializing git repository ...
  git init
  git symbolic-ref HEAD refs/heads/main
)

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin %REPO_URL%
) else (
  git remote set-url origin %REPO_URL%
)

git config user.name >nul 2>nul || git config user.name "nan29077"
git config user.email >nul 2>nul || git config user.email "nan29077@users.noreply.github.com"

echo.
git add -A
git status --short
echo.

set MSG=
git diff --cached --quiet
if errorlevel 1 (
  set /p MSG=Commit message ^(Enter = default^): 
  if not defined MSG set MSG=sellerbricks-bot update
  call git commit -m "%%MSG%%"
  if errorlevel 1 (
    echo Commit failed.
    pause
    exit /b 1
  )
) else (
  echo Nothing new to commit.
)

git branch -M main
echo Pushing to %REPO_URL% ^(main^) ...
git push -u origin main
if errorlevel 1 (
  echo Push failed. Check your GitHub login ^(a browser login window may appear^).
  pause
  exit /b 1
)
echo.
echo Done: pushed to main.
pause
