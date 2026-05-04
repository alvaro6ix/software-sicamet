@echo off
REM Reset completo del proyecto SICAMET en Docker (lanzador para reset.ps1).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0reset.ps1"
pause
