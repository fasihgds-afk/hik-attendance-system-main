================================================================================
  WinSystemHealth Watchdog — Keep Agent Running 100% During Shift
================================================================================

WHAT IT DOES
------------
- Checks every 30 seconds if whealthsvc.exe is running
- If closed/crashed, restarts it immediately
- Runs hidden (no black window)
- Starts automatically when the employee logs in

FILES
-----
  whealthsvc.exe      - The agent
  watchdog.bat        - Monitor loop (checks every 30s, restarts if needed)
  run_watchdog.vbs    - Runs watchdog.bat hidden
  setup_watchdog.bat  - One-time setup (no admin)
  setup_watchdog_admin.bat - One-time setup (Run as Admin, most reliable)

DEPLOYMENT STEPS (Recommended: Admin method)
--------------------------------------------

OPTION A — Admin Setup (Best reliability)
  1. Copy these files to the employee's laptop:
     - whealthsvc.exe
     - watchdog.bat
     - run_watchdog.vbs
     - setup_watchdog_admin.bat

  2. Right-click setup_watchdog_admin.bat → Run as administrator

  3. Done. On every logon:
     - Watchdog starts immediately (hidden)
     - Agent exe starts 30s after logon (via its own Task Scheduler)
     - If agent closes, watchdog restarts it within 30 seconds

OPTION B — No Admin (Startup folder)
  1. Copy the same 4 files to a folder on the laptop

  2. Double-click setup_watchdog.bat (no admin needed)

  3. A shortcut is added to the user's Startup folder.
     Watchdog runs on each logon.

VERIFY IT'S WORKING
-------------------
  1. Log in as the employee
  2. Open Task Manager (Ctrl+Shift+Esc)
  3. You should see:
     - whealthsvc.exe (the agent)
     - cmd.exe or wscript.exe (the watchdog — may appear briefly)
  4. Kill whealthsvc.exe — it should reappear within 30 seconds

INSTALL LOCATION
----------------
  Admin setup:  C:\ProgramData\WinSystemHealth\
  No-admin:     C:\Users\<user>\AppData\Local\WinSystemHealth\ (if ProgramData fails)

================================================================================
