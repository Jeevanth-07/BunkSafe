@echo off
setlocal
title BunkSafe Android TWA Builder
 echo.
 echo BunkSafe Android APK Builder (Trusted Web Activity)
 echo -----------------------------------------------
 echo Prerequisites: Node.js LTS, Android Studio/SDK, and a deployed HTTPS BunkSafe site.
 echo Read README_ANDROID_TWA.md before continuing.
 echo.
 where node >nul 2>nul
 if errorlevel 1 (
   echo ERROR: Node.js was not found. Install it from https://nodejs.org/ and reopen this window.
   pause
   exit /b 1
 )
 where bubblewrap >nul 2>nul
 if errorlevel 1 (
   echo Installing Bubblewrap CLI...
   call npm install -g @bubblewrap/cli
   if errorlevel 1 goto failed
 )
 echo.
 echo This script does not guess your Production domain or create signing secrets.
 echo Follow README_ANDROID_TWA.md to validate the site, initialize, and build.
 echo.
 call bubblewrap --version
 pause
 exit /b 0
:failed
 echo Bubblewrap installation failed. Check the npm error above.
 pause
 exit /b 1
