@echo off
:: Start the watchdog immediately (use this if watchdog isn't running)
:: Double-click to run. No admin needed.

wscript.exe "%ProgramData%\WinSystemHealth\run_watchdog.vbs"
echo Watchdog started. It runs hidden in the background.
timeout /t 3 >nul
