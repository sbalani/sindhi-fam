@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Voice backend is not installed yet.
  echo Run "1 - INSTALL VOICE BACKEND.bat" first.
  pause
  exit /b 1
)

call ".venv\Scripts\activate.bat"
echo ==============================================
echo VANSH - Local speech-to-text backend
echo ==============================================
echo URL: http://127.0.0.1:8001
echo Health check: http://127.0.0.1:8001/health
echo.
echo Keep this window open while using Voice Import.
echo The first transcription for a language may take longer while its model downloads.
echo.
python -m uvicorn server:app --host 127.0.0.1 --port 8001
pause
