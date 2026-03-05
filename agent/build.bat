@echo off
echo Building GDS Attendance Agent...
python -m PyInstaller --clean whealthsvc.spec
if %ERRORLEVEL% equ 0 (
    echo Build complete. EXE: dist\whealthsvc.exe
) else (
    echo Build failed.
    exit /b 1
)
