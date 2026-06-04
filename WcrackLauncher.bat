@echo off
setlocal

echo ===========================================
echo         Wcrack Launcher (Windows)
echo ===========================================

set ROOT_DIR=%~dp0
set BACKEND_DIR=%ROOT_DIR%backend
set FRONTEND_DIR=%ROOT_DIR%frontend

echo Starting Backend server...
cd /d "%BACKEND_DIR%"
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)
start "Wcrack Backend" cmd /c "python -m uvicorn wcarck.main:app --host 0.0.0.0 --port 8000"

echo Starting Frontend server...
cd /d "%FRONTEND_DIR%"
if exist package.json (
    start "Wcrack Frontend" cmd /c "npm run dev"
) else (
    echo Frontend directory or package.json not found!
)

echo Servers are starting up... Waiting 3 seconds...
timeout /t 3 /nobreak >nul

set APP_URL=http://localhost:3000
echo Redirecting to %APP_URL%
start "" "%APP_URL%"

echo.
echo Both servers are running in separate console windows.
echo To stop them, simply close their command prompt windows.
pause
