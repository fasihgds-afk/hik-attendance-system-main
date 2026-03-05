"""
GDS Employee Activity Agent - First Prompt Implementation.
- 3 min idle -> mandatory break form (always-on-top)
- Auto-clicker -> Violation Detected popup
- Lock/Sleep -> treat as Break
- Local NDJSON log, offline queue, sync on reconnect, purge on 200 OK
- Windows startup registration
"""
import os
import time
from datetime import datetime, timezone
from .constants import (
    API_BASE,
    EMP_CODE,
    DEVICE_ID,
    APP_VERSION,
    HEARTBEAT_SECONDS,
    IDLE_THRESHOLD_SECONDS,
)
from .api import AgentApi
from .network import NetworkClient
from .platform_win import get_idle_seconds, get_tick_count_ms, is_autoclicker_running
from .popup import prompt_break_reason, show_violation_popup
from .state import AgentState
from .storage import append_event, read_all_events, purge_log
from . import startup_win


def _iso_now():
    return datetime.now(timezone.utc).isoformat()


class AgentApplication:
    def __init__(self):
        if not EMP_CODE:
            raise RuntimeError("EMP_CODE is required in environment")
        self.state = AgentState()
        self.client = NetworkClient(API_BASE)
        self.api = AgentApi(self.client, EMP_CODE, DEVICE_ID, APP_VERSION)
        self.host_name = os.getenv("COMPUTERNAME", "windows-host")
        self.os_name = "windows"
        self._session_start = _iso_now()
        self._last_tick_ms = get_tick_count_ms()
        self._registered_startup = False
        self._last_violation_popup_at = 0.0
        self._log_event("session_start")

    def _ensure_startup(self):
        if not self._registered_startup:
            if startup_win.register_startup():
                self._registered_startup = True

    def _derive_status(self, idle_seconds: int, suspicious_active: bool) -> str:
        if suspicious_active:
            return "SUSPICIOUS"
        if self.state.break_id:
            return "BREAK"
        if idle_seconds >= IDLE_THRESHOLD_SECONDS:
            return "IDLE"
        return "ACTIVE"

    def _log_event(self, event_type: str, total_idle: int = 0, reason: str = "", category: str = ""):
        append_event({
            "type": event_type,
            "employeeCode": EMP_CODE,
            "deviceId": DEVICE_ID,
            "sessionStart": self._session_start,
            "totalIdle": total_idle,
            "reason": reason,
            "category": category,
            "timestamp": _iso_now(),
        })

    def _sync_log(self):
        events = read_all_events()
        if not events:
            return True
        ok, status = self.api.sync_log(events)
        if ok and status == 200:
            purge_log()
            return True
        return False

    def tick(self):
        self._ensure_startup()
        now_iso = _iso_now()
        idle_seconds = get_idle_seconds()
        suspicious_active = is_autoclicker_running()
        self.state.suspicious_active = suspicious_active

        # Sleep detection: if tick delta >> sleep interval, system was suspended
        current_tick = get_tick_count_ms()
        tick_delta_ms = (current_tick - self._last_tick_ms) & 0x7FFFFFFF
        max_expected_ms = (HEARTBEAT_SECONDS + 5) * 1000
        if tick_delta_ms > max_expected_ms and tick_delta_ms < 24 * 3600 * 1000:
            # Likely sleep/hibernate - treat as break
            self._log_event("lock", total_idle=int(tick_delta_ms / 1000), reason="System sleep/lock")
            category, reason = prompt_break_reason()
            if category and reason:
                self._log_event("break", total_idle=int(tick_delta_ms / 1000), reason=reason, category=category)
        self._last_tick_ms = current_tick

        # Auto-clicker -> Violation popup (persistent, throttle 60s)
        if suspicious_active:
            self._log_event("violation", reason="Auto-clicker detected")
            if time.time() - self._last_violation_popup_at > 60:
                show_violation_popup()
                self._last_violation_popup_at = time.time()

        status = self._derive_status(idle_seconds, suspicious_active)
        self.state.status = status

        # Heartbeat first (ensures device exists for break-log)
        try:
            self.api.heartbeat(
                status=status,
                suspicious_active=suspicious_active,
                host_name=self.host_name,
                os_name=self.os_name,
            )
            self.state.last_heartbeat_at = datetime.utcnow()
        except Exception:
            pass

        # Idle 3 min -> mandatory break form (after heartbeat so device exists)
        if idle_seconds >= IDLE_THRESHOLD_SECONDS and not self.state.break_id:
            category, reason = prompt_break_reason()
            if category and reason:
                self._log_event("break", total_idle=idle_seconds, reason=reason, category=category)
                try:
                    opened = self.api.open_break(category=category, reason=reason)
                    self.state.break_id = opened.get("data", {}).get("breakId")
                    self.state.break_started_at = datetime.utcnow()
                    if self.state.break_id:
                        self.api.end_break(
                            break_id=self.state.break_id,
                            category=category,
                            reason=reason,
                        )
                        self.state.break_id = None
                except Exception:
                    pass

        # Sync local log (offline resilience)
        try:
            self._sync_log()
        except Exception:
            pass
