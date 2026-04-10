# GDS Attendance Agent

Windows desktop agent for employee activity monitoring. Connects to the GDS Attendance Portal at **https://ams.globaldigitsolutions.com**.

## Setup

1. Install Python 3.10+ and create a virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. (Optional) Add `gds.png` logo in the agent folder for branding in dialogs.

3. Run the agent:
   ```bash
   python agent.py
   ```

4. On first run, the enrollment form appears. Enter your **Employee Code** (from HR) and the **Server URL** (default: https://ams.globaldigitsolutions.com). Click **Connect & Start**.

## Build EXE

```bash
build.bat
```

Output: `dist\whealthsvc.exe`

## Features

- Heartbeat every 3 minutes
- Idle detection (3 min)
- Auto-clicker / mouse-jiggler detection
- Lock screen detection
- Offline buffering with auto-sync
- Shift-aware (only active during work hours)
- Auto-start on Windows login

## Config

Stored in `C:\ProgramData\WinSystemHealth\config.json` after enrollment.
