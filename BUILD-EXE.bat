@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0BUILD-EXE.ps1"
if errorlevel 1 (
  echo.
  echo Build failed. Read the error above. Your source project was not removed.
  pause
  exit /b 1
)
echo.
echo Build complete. If a new Setup EXE exists in installer\, run it.
echo Otherwise run INSTALL-WINDOWS.bat to install this EXE folder on your PC.
pause
