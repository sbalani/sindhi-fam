@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo VANSH - Install local voice backend
echo ==============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found.
  echo Install Python 3.10 or 3.11, tick "Add Python to PATH", then run this file again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating Python environment...
  python -m venv .venv
  if errorlevel 1 goto :error
)

call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
if errorlevel 1 goto :error
python -m pip install -r requirements.txt
if errorlevel 1 goto :error

echo.
echo Installation complete.
echo Next, double-click: 2 - START VOICE BACKEND.bat
echo.
echo NOTE: Browser microphone recordings usually require FFmpeg.
echo If transcription says FFmpeg is missing, install FFmpeg and ensure `ffmpeg` works in Command Prompt.
pause
exit /b 0

:error
echo.
echo Installation failed. Read the error above, then try again.
pause
exit /b 1
