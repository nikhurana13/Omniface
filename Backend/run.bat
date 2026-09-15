@echo off
setlocal enabledelayedexpansion
title OmniFace Runner

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%Omniface2.0\Frontend\omniface-__-multimodal-deepfake-forensics"

if not "%~1"=="" (
    if /I "%~1"=="backend" goto start_backend
    if /I "%~1"=="frontend" goto start_frontend
    if /I "%~1"=="both" goto start_both
    if /I "%~1"=="test" goto run_tests
    if /I "%~1"=="tests" goto run_tests
    if /I "%~1"=="install" goto install_deps
    if /I "%~1"=="health" goto check_health
    if /I "%~1"=="help" goto show_help
    echo [!] Unknown argument: %~1
    echo.
)

:menu
cls
echo =====================================================================
echo                     OMNIFACE EXECUTION MANAGER
echo =====================================================================
echo.
echo   [1] Start Both (Backend + Frontend in separate windows)
echo   [2] Start Backend Only (FastAPI - http://127.0.0.1:8000)
echo   [3] Start Frontend Only (Next.js - http://localhost:3000)
echo   [4] Run Backend Tests (pytest)
echo   [5] Install Dependencies (pip requirements + npm packages)
echo   [6] Check Backend Health Endpoint
echo   [7] Exit
echo.
echo =====================================================================
set /p "CHOICE=Select an option [1-7]: "

if "%CHOICE%"=="1" goto start_both
if "%CHOICE%"=="2" goto start_backend
if "%CHOICE%"=="3" goto start_frontend
if "%CHOICE%"=="4" goto run_tests
if "%CHOICE%"=="5" goto install_deps
if "%CHOICE%"=="6" goto check_health
if "%CHOICE%"=="7" exit /b 0

echo [!] Invalid selection. Please choose 1-7.
pause
goto menu

:start_both
echo [*] Launching Backend on http://127.0.0.1:8000 in a new window...
start "OmniFace - Backend Server" cmd /k "cd /d "%BACKEND_DIR%" && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo [*] Launching Frontend on http://localhost:3000 in a new window...
start "OmniFace - Frontend Web App" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo [OK] Both services have been launched in separate terminal windows!
echo - Backend API:    http://127.0.0.1:8000
echo - Swagger Docs:   http://127.0.0.1:8000/docs
echo - Frontend UI:    http://localhost:3000
echo.
pause
goto menu

:start_backend
cls
echo =====================================================================
echo Starting OmniFace Backend Server...
echo API:  http://127.0.0.1:8000
echo Docs: http://127.0.0.1:8000/docs
echo =====================================================================
cd /d "%BACKEND_DIR%"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pause
goto menu

:start_frontend
cls
echo =====================================================================
echo Starting OmniFace Frontend Server...
echo App: http://localhost:3000
echo =====================================================================
cd /d "%FRONTEND_DIR%"
npm run dev
pause
goto menu

:run_tests
cls
echo =====================================================================
echo Running OmniFace Backend Pytest Suite...
echo =====================================================================
cd /d "%ROOT_DIR%"
python -m pytest backend/tests -v
echo.
pause
goto menu

:install_deps
cls
echo =====================================================================
echo Installing OmniFace Dependencies...
echo =====================================================================
echo.
echo [*] Installing Python backend dependencies...
cd /d "%BACKEND_DIR%"
python -m pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [!] Warning: Python dependencies installation had issues.
) else (
    echo [OK] Python dependencies installed successfully.
)

echo.
echo [*] Installing Node.js frontend dependencies...
cd /d "%FRONTEND_DIR%"
call npm install
if %ERRORLEVEL% neq 0 (
    echo [!] Warning: npm install had issues.
) else (
    echo [OK] Frontend dependencies installed successfully.
)

echo.
echo [OK] Dependency installation completed.
pause
goto menu

:check_health
cls
echo =====================================================================
echo Checking OmniFace Backend Health...
echo =====================================================================
curl -s http://127.0.0.1:8000/health
if %ERRORLEVEL% neq 0 (
    echo.
    echo [!] Could not connect to http://127.0.0.1:8000/health.
    echo     Please make sure the backend is running.
)
echo.
pause
goto menu

:show_help
echo Usage: run.bat [command]
echo.
echo Commands:
echo   both      Launch backend and frontend concurrently in new windows
echo   backend   Run FastAPI backend in current window
echo   frontend  Run Next.js frontend in current window
echo   test      Execute backend pytest test suite
echo   install   Install both Python and npm dependencies
echo   health    Query backend /health endpoint
echo.
exit /b 0
