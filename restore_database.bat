@echo off
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: restore_database.bat path\to\backup.db
  echo Stop BunkSafe before restoring.
  pause
  exit /b 2
)
py restore_database.py "%~1"
if errorlevel 1 pause
