@echo off
:: ============================================================================
::  ONE-CLICK INSTALL — WinSystemHealth Agent + Watchdog
::  Right-click -> Run as administrator
:: ============================================================================

set "INSTALL_DIR=%ProgramData%\WinSystemHealth"
set "TASK_AGENT=Windows System Health Monitor"
set "TASK_WATCHDOG=Windows System Health Watchdog"

echo.
echo  ========================================
echo   WinSystemHealth — One-Click Install
echo  ========================================
echo.

:: Check admin
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  ERROR: Please right-click this file and choose "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: Create folder
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: Grant all users write access (fixes PermissionError when employee logs in)
icacls "%INSTALL_DIR%" /grant Users:(OI)(CI)F /T >nul 2>&1

:: Copy files (run from folder containing exe + bat + vbs)
set "SRC=%~dp0"
copy /Y "%SRC%whealthsvc.exe" "%INSTALL_DIR%\" 2>nul
copy /Y "%SRC%watchdog.bat" "%INSTALL_DIR%\" 2>nul
copy /Y "%SRC%run_watchdog.vbs" "%INSTALL_DIR%\" 2>nul

if not exist "%INSTALL_DIR%\whealthsvc.exe" (
    echo  ERROR: whealthsvc.exe not found. Place it in same folder as this installer.
    pause
    exit /b 1
)

if not exist "%INSTALL_DIR%\run_watchdog.vbs" (
    echo  ERROR: watchdog files not found. Ensure watchdog.bat and run_watchdog.vbs
    echo         are in the same folder as this installer.
    pause
    exit /b 1
)

echo  [1/4] Files copied to %INSTALL_DIR%
echo.

:: Agent task (starts 30s after logon)
schtasks /Delete /TN "%TASK_AGENT%" /F 2>nul
schtasks /Create /TN "%TASK_AGENT%" /TR "\"%INSTALL_DIR%\whealthsvc.exe\"" /SC ONLOGON /RL LIMITED /F /DELAY 0000:30 >nul 2>&1
echo  [2/4] Agent will start 30 seconds after each logon
echo.

:: Watchdog task (starts immediately, restarts agent if it closes)
schtasks /Delete /TN "%TASK_WATCHDOG%" /F 2>nul
schtasks /Create /TN "%TASK_WATCHDOG%" /TR "wscript.exe \"%INSTALL_DIR%\run_watchdog.vbs\"" /SC ONLOGON /RL HIGHEST /F /DELAY 0000:00 >nul 2>&1
echo  [3/4] Watchdog will keep agent running (restarts if closed)
echo.

:: Start agent now
start "" "%INSTALL_DIR%\whealthsvc.exe"
echo  [4/4] Agent started
echo.

:: Start watchdog NOW (don't wait for next logon)
wscript.exe "%INSTALL_DIR%\run_watchdog.vbs"
echo  [5/5] Watchdog started (runs in background)
echo.
echo  ========================================
echo   Install complete!
echo  ========================================
echo.
echo  - Agent is running now
echo  - On next logon: agent + watchdog start automatically
echo  - If agent closes: watchdog restarts it within 30 seconds
echo.
echo  First time? Employee must enroll at your company's enrollment URL.
echo.
pause
