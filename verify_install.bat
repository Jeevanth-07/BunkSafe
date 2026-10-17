@echo off
cd /d "%~dp0"
py verify_install.py
if errorlevel 1 pause
