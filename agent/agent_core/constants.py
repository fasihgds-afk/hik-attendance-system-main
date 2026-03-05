import os

API_BASE = os.getenv("AGENT_API_BASE", "http://localhost:3000")
EMP_CODE = os.getenv("EMP_CODE", "").strip()
DEVICE_ID = os.getenv("DEVICE_ID", "whealthsvc-win")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "").strip()
APP_VERSION = "1.0.0"

HEARTBEAT_SECONDS = int(os.getenv("HEARTBEAT_SECONDS", "15"))
IDLE_THRESHOLD_SECONDS = int(os.getenv("IDLE_THRESHOLD_SECONDS", "180"))

BREAK_CATEGORIES = ("Official", "General", "Namaz")
BREAK_REASON_REQUIRED = True

AUTCLICKER_PROCESS_KEYWORDS = (
    "autoclick",
    "auto click",
    "gs autoclicker",
    "op autoclicker",
)
