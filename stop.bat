@echo off
title Customer Pricing - Stopping...
color 0C
cls

echo.
echo  ============================================
echo   Customer Pricing System - Stopping
echo  ============================================
echo.

cd /d "%~dp0"

docker compose down
if errorlevel 1 (
    echo  [ERROR] Could not stop services cleanly.
) else (
    echo.
    echo  [OK]    All services stopped. Data is preserved.
    echo          Run start.bat to start again.
)
echo.
pause
