import ctypes
import subprocess
from ctypes import wintypes
from .constants import AUTCLICKER_PROCESS_KEYWORDS


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]


def get_idle_seconds() -> int:
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    last_input = LASTINPUTINFO()
    last_input.cbSize = ctypes.sizeof(LASTINPUTINFO)
    user32.GetLastInputInfo(ctypes.byref(last_input))
    millis = kernel32.GetTickCount() - last_input.dwTime
    return int(millis / 1000)


def get_tick_count_ms() -> int:
    return ctypes.windll.kernel32.GetTickCount() & 0x7FFFFFFF


def is_autoclicker_running() -> bool:
    try:
        output = subprocess.check_output(["tasklist"], text=True, encoding="utf-8", errors="ignore")
        low = output.lower()
        return any(keyword in low for keyword in AUTCLICKER_PROCESS_KEYWORDS)
    except Exception:
        return False


def is_workstation_locked() -> bool:
    """Check if Windows workstation is locked. Stub - lock treated via idle heuristic."""
    return False
