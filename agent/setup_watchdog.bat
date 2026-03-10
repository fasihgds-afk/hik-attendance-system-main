@echo off
:: One-time setup: install exe + watchdog, add to Startup (no admin)
:: For best reliability, use setup_watchdog_admin.bat (Run as Administrator)

set "INSTALL_DIR=%ProgramData%\WinSystemHealth"
set "ALT_DIR=%LOCALAPPDATA%\WinSystemHealth"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo.
echo === WinSystemHealth Watchdog Setup ===
echo.

:: Try ProgramData first, fall back to LocalAppData if no access
set "SRC=%~dp0"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" 2>nul
copy /Y "%SRC%whealthsvc.exe" "%INSTALL_DIR%\" 2>nul
if %ERRORLEVEL% neq 0 (
    set "INSTALL_DIR=%ALT_DIR%"
    if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
    copy /Y "%SRC%whealthsvc.exe" "%INSTALL_DIR%\"
    copy /Y "%SRC%watchdog.bat" "%INSTALL_DIR%\"
    copy /Y "%SRC%run_watchdog.vbs" "%INSTALL_DIR%\"
) else (
    copy /Y "%SRC%watchdog.bat" "%INSTALL_DIR%\"
    copy /Y "%SRC%run_watchdog.vbs" "%INSTALL_DIR%\"
)

if not exist "%INSTALL_DIR%\run_watchdog.vbs" (
    echo ERROR: Could not copy files. Run from agent folder.
    echo For ProgramData install, run setup_watchdog_admin.bat as Admin.
    pause
    exit /b 1
)

echo Files installed to %INSTALL_DIR%
echo.

:: Add to Startup folder
echo Creating Startup shortcut...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP_DIR%\WinSystemHealth Watchdog.lnk'); $s.TargetPath='%INSTALL_DIR%\run_watchdog.vbs'; $s.WorkingDirectory='%INSTALL_DIR%'; $s.WindowStyle=7; $s.Save()"

echo.
echo === Setup complete ===
echo.
echo Watchdog will start when %USERNAME% logs in (runs hidden).
echo For best reliability: run setup_watchdog_admin.bat as Administrator.
echo.
pause
