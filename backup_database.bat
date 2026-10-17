@echo off
cd /d "%~dp0"
py backup_database.py
if errorlevel 1 pause
