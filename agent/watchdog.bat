@echo off
title WinSystemHealth Watchdog
:: Watchdog: restarts whealthsvc.exe if it stops. Runs every 30 seconds.
:: Use run_watchdog.vbs to run this hidden (no black window).

set "EXE_DIR=%~dp0"
set "EXE_PATH=%EXE_DIR%whealthsvc.exe"

:: Wait 15s on first run (let agent start first if installer just ran)
timeout /t 15 /nobreak >nul

:loop
tasklist /FI "IMAGENAME eq whealthsvc.exe" 2>NUL | find /I /N "whealthsvc.exe">NUL
if "%ERRORLEVEL%"=="1" (
    if exist "%EXE_PATH%" (
        start "" "%EXE_PATH%"
    )
)
timeout /t 30 /nobreak >nul
goto loop
