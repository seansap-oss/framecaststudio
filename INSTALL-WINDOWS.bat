@echo off
setlocal
cd /d "%~dp0"
if not exist "dist\PoknaphamEditingSuite\PoknaphamEditingSuite.exe" (
  echo Build first with BUILD-EXE.bat in this folder.
  exit /b 1
)
set "TARGET=%LOCALAPPDATA%\Programs\Poknapham Editing Suite"
if not exist "%TARGET%" mkdir "%TARGET%"
robocopy "dist\PoknaphamEditingSuite" "%TARGET%" /E /R:2 /W:1 >nul
if errorlevel 8 (
  echo Install copy failed.
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Poknapham Editing Suite.lnk'); $s.TargetPath = '%TARGET%\PoknaphamEditingSuite.exe'; $s.WorkingDirectory = '%TARGET%'; $s.Save()"
if errorlevel 1 (
  echo App copied to "%TARGET%", but the desktop shortcut could not be created.
  exit /b 1
)
echo Installed the latest built EXE to "%TARGET%".
echo Open the desktop shortcut and copy the PC code shown on the activation page.
pause
