@echo off
cd /d "%~dp0"
if not exist .env (
  echo First-time setup is required. Opening setup wizard...
  py setup_local.py
  if errorlevel 1 (
    echo Setup was not completed. Run setup_local.bat and try again.
    pause
    exit /b 1
  )
)
if not exist .venv (
  py -m venv .venv
)
call .venv\Scripts\activate.bat
py -m pip install -r requirements.txt
py app.py
pause
