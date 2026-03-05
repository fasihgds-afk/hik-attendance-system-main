"""
Register agent in Windows Startup (Registry).
"""
import os
import sys
import winreg


def _exe_path() -> str:
    if getattr(sys, "frozen", False):
        return os.path.abspath(sys.executable)
    py = sys.executable
    script = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "agent.py")
    return f'"{py}" "{script}"'


def register_startup() -> bool:
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE,
        )
        winreg.SetValueEx(key, "GDS-Agent", 0, winreg.REG_SZ, _exe_path())
        winreg.CloseKey(key)
        return True
    except OSError:
        return False


def unregister_startup() -> bool:
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE,
        )
        winreg.DeleteValue(key, "GDS-Agent")
        winreg.CloseKey(key)
        return True
    except OSError:
        return False
