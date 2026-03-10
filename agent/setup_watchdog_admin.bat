@echo off
:: Admin setup: Use Task Scheduler for watchdog (most reliable)
:: Right-click -> Run as administrator

set "INSTALL_DIR=%ProgramData%\WinSystemHealth"
set "TASK_NAME=Windows System Health Watchdog"

echo.
echo === WinSystemHealth Watchdog (Admin Setup) ===
echo.

:: Create install dir
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Grant all users write access (fixes PermissionError when employee logs in)
icacls "%INSTALL_DIR%" /grant Users:(OI)(CI)F /T >nul 2>&1

:: Copy files
set "SRC=%~dp0"
copy /Y "%SRC%whealthsvc.exe" "%INSTALL_DIR%\" 2>nul
copy /Y "%SRC%watchdog.bat" "%INSTALL_DIR%\" 2>nul
copy /Y "%SRC%run_watchdog.vbs" "%INSTALL_DIR%\" 2>nul

if not exist "%INSTALL_DIR%\run_watchdog.vbs" (
    echo ERROR: Could not copy files.
    pause
    exit /b 1
)

:: Remove old task if exists
schtasks /Delete /TN "%TASK_NAME%" /F 2>nul

:: Create task: run watchdog on every user logon, 0 delay
schtasks /Create /TN "%TASK_NAME%" /TR "wscript.exe \"%INSTALL_DIR%\run_watchdog.vbs\"" /SC ONLOGON /RL HIGHEST /F /DELAY 0000:00

if %ERRORLEVEL% equ 0 (
    echo.
    echo Task created: %TASK_NAME%
    echo Watchdog will start on every logon and run hidden.
) else (
    echo.
    echo Task creation failed. Use setup_watchdog.bat (no admin) for Startup folder method.
)

echo.
pause
