@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 셀러브릭스봇 - main 브랜치 커밋 및 푸시
set REPO_URL=https://github.com/nan29077/sellerbricks-bot.git

where git >nul 2>nul
if errorlevel 1 (
  echo Git 이 설치되어 있지 않습니다. 설치: https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo Git 저장소를 새로 만듭니다 ...
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
git config core.quotepath false
git config i18n.commitEncoding utf-8
git config i18n.logOutputEncoding utf-8

for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%d

echo.
git add -A
git status --short
echo.

set MSG=
git diff --cached --quiet
if errorlevel 1 (
  set /p MSG=커밋 메시지를 한글로 입력하세요 ^(엔터 = 기본 메시지^):
  if not defined MSG set MSG=셀러브릭스봇 업데이트 ^(%TODAY%^)
  call git commit -m "%%MSG%%"
  if errorlevel 1 (
    echo 커밋에 실패했습니다.
    pause
    exit /b 1
  )
) else (
  echo 새로 커밋할 변경 사항이 없습니다.
)

git branch -M main
echo %REPO_URL% 의 main 브랜치로 푸시합니다 ...
git push -u origin main
if errorlevel 1 (
  echo 푸시에 실패했습니다. GitHub 로그인을 확인하세요 ^(브라우저 로그인 창이 뜰 수 있습니다^).
  pause
  exit /b 1
)
echo.
echo 완료: main 브랜치에 푸시했습니다.
pause
