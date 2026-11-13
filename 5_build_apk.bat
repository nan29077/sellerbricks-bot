@echo off
setlocal
rem ============================================================
rem  5_build_apk.bat - build the Android app (APK) for AI seller assistant
rem  Needs: Node.js 22+, Android Studio (Android SDK + JDK 21)
rem  Usage: 5_build_apk.bat                (uses APP_SERVER_URL or PUBLIC_BASE_URL in .env)
rem         5_build_apk.bat https://bot.sellerbricks.co.kr
rem  Result: data\apk-build\sellerbricks-ai.apk  (upload it in admin page - Channels / App)
rem ============================================================
cd /d "%~dp0app-android"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 22 or newer.
  goto fail
)
node -e "process.exit(+process.versions.node.split(String.fromCharCode(46))[0] < 22 ? 1 : 0)"
if errorlevel 1 (
  echo [ERROR] Node.js 22 or newer is required for Capacitor 8.
  goto fail
)

if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined JAVA_HOME (
  where java >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Java not found. Install Android Studio - it includes Java.
    goto fail
  )
)
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined ANDROID_HOME (
  echo [ERROR] Android SDK not found. Open Android Studio once and finish the SDK setup.
  goto fail
)
echo [1/5] npm install
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
echo [2/5] server address
call node scripts\configure.mjs %1
if errorlevel 1 goto fail
if not exist android (
  echo [3/5] create android project
  call npx cap add android
  if errorlevel 1 goto fail
) else (
  echo [3/5] android project exists
)
echo [4/5] icons and sync
call npx capacitor-assets generate --android --iconBackgroundColor "#17634c" --splashBackgroundColor "#f4f7f6"
call npx cap sync android
if errorlevel 1 goto fail
echo [5/5] gradle build (first time takes several minutes)
pushd android
call gradlew.bat assembleDebug
if errorlevel 1 (
  popd
  goto fail
)
popd
if not exist "..\data\apk-build" mkdir "..\data\apk-build"
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "..\data\apk-build\sellerbricks-ai.apk" >nul
echo.
echo [DONE] data\apk-build\sellerbricks-ai.apk
echo Upload this file in admin page: Channels / App - APK upload.
pause
exit /b 0

:fail
echo.
echo [FAILED] See the message above. Guide: docs\07 (web chat and app)
pause
exit /b 1
