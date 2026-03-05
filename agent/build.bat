@echo off
REM Build GDS Agent executable
REM Requires: pip install pyinstaller

cd /d "%~dp0"

echo Installing PyInstaller if needed...
pip install pyinstaller requests --quiet

echo.
echo Building GDS-Agent.exe...
python -m PyInstaller --clean --noconfirm agent.spec

if exist "dist\GDS-Agent.exe" (
    echo.
    echo SUCCESS: dist\GDS-Agent.exe created
    echo.
    echo Place agent_config.ini next to the exe with:
    echo   [agent]
    echo   AGENT_API_BASE=http://localhost:3000
    echo   EMP_CODE=your_employee_code
    echo   DEVICE_ID=whealthsvc-win
    echo   DEVICE_TOKEN=optional_token
    echo.
) else (
    echo BUILD FAILED
    exit /b 1
)
