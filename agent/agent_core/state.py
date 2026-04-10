"""
AgentState — single source of truth for all agent state.

All mutations happen on the Tkinter main thread. No locks needed.
"""

import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AgentState:
    # ── Input tracking ────────────────────────────────────────
    last_input_ts: float = field(default_factory=time.time)
    last_monotonic_ts: float = field(default_factory=time.monotonic)

    # ── Heartbeat ─────────────────────────────────────────────
    last_heartbeat_time: float = 0.0
    last_heartbeat_state: str = ""
    heartbeat_in_flight: bool = False

    # ── System lock ───────────────────────────────────────────
    system_locked: bool = False
    was_locked: bool = False
    lock_popup_handled: bool = False
    lock_start_time: float = 0.0        # When lock began (filters brief UAC prompts)

    # ── Connectivity ──────────────────────────────────────────
    online: bool = True
    offline_since: float = 0.0          # time.time() when we went offline
    consecutive_hb_failures: int = 0

    # ── Shift info (fetched from server, None = always-on) ────
    shift_start: Optional[str] = None   # "HH:MM" or None
    shift_end: Optional[str] = None
    shift_grace_min: int = 20
    shift_crosses_midnight: bool = False

    @property
    def idle_seconds(self) -> float:
        """
        Seconds since last real input (monotonic clock).
        Capped at 600s to absorb sleep/resume clock jumps.
        """
        raw = time.monotonic() - self.last_monotonic_ts
        return min(raw, 600.0)

    def record_activity(self):
        """Mark that real user input just happened."""
        self.last_input_ts = time.time()
        self.last_monotonic_ts = time.monotonic()

    # ── Connectivity transitions ──────────────────────────────

    def mark_offline(self):
        if not self.online:
            return
        self.online = False
        self.offline_since = time.time()

    def mark_online(self):
        self.online = True
        self.consecutive_hb_failures = 0
