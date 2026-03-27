@echo off
setlocal EnableDelayedExpansion
title Customer Pricing - Starting...
color 0A
cls

echo.
echo  ============================================
echo   Customer Pricing System - Starting Up
echo  ============================================
echo.

:: ── 1. Check Docker CLI is installed ──────────────────────────────────────
echo  [CHECK] Looking for Docker...
where docker >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERROR] Docker not found in PATH.
    echo          Install Docker Desktop from: https://www.docker.com/products/docker-desktop
    echo          Then restart this script.
    echo.
    pause
    exit /b 1
)
echo  [OK]    Docker CLI found.

:: ── 2. Start Docker Desktop if daemon is not running ─────────────────────
echo  [CHECK] Checking Docker daemon...
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

echo  [INFO]  Docker daemon is not running. Attempting to start Docker Desktop...

set "DOCKER_EXE="
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_EXE=C:\Program Files\Docker\Docker\Docker Desktop.exe"
) else if exist "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_EXE=%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_EXE=%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
)

if "!DOCKER_EXE!"=="" (
    echo.
    echo  [ERROR] Cannot find Docker Desktop executable.
    echo          Please start Docker Desktop manually, then run this script again.
    echo.
    pause
    exit /b 1
)

echo  [INFO]  Starting: !DOCKER_EXE!
start "" "!DOCKER_EXE!"

echo  [INFO]  Waiting for Docker daemon (this can take 30-60 seconds)...
set /a dock_wait=0

:wait_docker
set /a dock_wait+=1
if !dock_wait! gtr 24 (
    echo.
    echo  [ERROR] Docker daemon did not start after 2 minutes.
    echo          Please open Docker Desktop manually and wait for it to show
    echo          "Docker Desktop is running" in the system tray, then try again.
    echo.
    pause
    exit /b 1
)
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if errorlevel 1 goto wait_docker
echo.

:docker_ready
echo  [OK]    Docker daemon is ready.

:: --- 3. Move to project directory ------------------------------------------
cd /d "%~dp0"

:: --- 4. Check .env exists --------------------------------------------------
echo  [CHECK] Looking for .env file...
if not exist ".env" (
    echo.
    echo  [ERROR] .env file not found in: %~dp0
    echo          Expected file: %~dp0.env
    echo.
    echo          Copy .env.example to .env and fill in the values:
    echo          copy .env.example .env
    echo.
    pause
    exit /b 1
)
echo  [OK]    .env file found.

:: ── 5. Build and start all services ───────────────────────────────────────
echo.
echo  [INFO]  Building and starting services...
echo          (First run downloads images and compiles - allow 3-5 minutes)
echo.
docker compose up --build -d

:: Docker Desktop on Windows sometimes returns exit code 1 even on success.
:: Verify by checking if the backend container is actually running.
docker compose ps --services --filter "status=running" | findstr /C:"backend" >nul
if errorlevel 1 (
    echo.
    echo  [ERROR] docker compose failed - backend container is not running.
    echo          Troubleshooting hints:
    echo            - Check if Port 80 is in use
    echo            - Verify .env values
    echo            - Check Docker Desktop logs
    echo.
    pause
    exit /b 1
)
echo  [OK]    Containers started.

:: ── 6. Wait for application to be ready ───────────────────────────────────
echo.
echo  [INFO]  Waiting for application to be ready at http://localhost ...
set /a attempts=0
:wait_app
set /a attempts+=1
if !attempts! gtr 60 (
    echo.
    echo  [ERROR] Application did not respond after 3 minutes.
    echo          Check container logs with:  docker compose logs
    echo.
    pause
    exit /b 1
)
timeout /t 3 /nobreak >nul
curl -s -o nul -w "%%{http_code}" http://localhost/ 2>nul | findstr /C:"200" /C:"301" /C:"302" >nul
if errorlevel 1 (
    set /p =. <nul
    goto wait_app
)
echo.
echo  [OK]    Application is responding.

:: ── 7. Create admin user (idempotent) ─────────────────────────────────────
echo.
echo  [INFO]  Ensuring admin user exists...
docker compose exec -T backend python create_admin.py
echo  [OK]    Admin user ready.

:: ── 8. Open browser ────────────────────────────────────────────────────────
echo.
echo  ============================================
echo   Application is ready!
echo.
echo   URL:      http://localhost
echo   Email:    admin@example.com
echo   Password: Admin@2026^^!
echo.
echo   Change the password after your first login.
echo  ============================================
echo.
start "" http://localhost

echo  Press any key to watch live logs (app keeps running in background).
echo  Close this window any time - containers stay running.
echo.
pause >nul
docker compose logs -f

:: Safety net — window never closes silently
echo.
pause
