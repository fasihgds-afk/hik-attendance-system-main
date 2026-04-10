"""
Headless agent — runs without Tkinter when Tcl/Tk fails (e.g. PyInstaller on short usernames).

Sends heartbeats, tracks activity, and works offline.
Frontend will show Active/Idle/Offline based on heartbeats.
"""

import queue
import threading
import time
from datetime import datetime, timezone, timedelta

from .constants import (
    AGENT_VERSION, IDLE_THRESHOLD_SEC, HEARTBEAT_INTERVAL_SEC,
    CONNECTIVITY_CHECK_SEC, ALIVE_SAVE_SEC,
)
from .config import log, safe_print
from .state import AgentState
from .tracker import ActivityTracker
from .listeners import InputListeners
from .platform_win import is_system_locked, get_system_idle_seconds
from .api import send_heartbeat
from . import network

_PKT = timezone(timedelta(hours=5))


def _is_within_shift(state):
    """Check if current time is within shift."""
    if not state.shift_start or not state.shift_end:
        return True
    now = datetime.now(_PKT)
    current = now.strftime("%H:%M")
    start, end = state.shift_start, state.shift_end
    if state.shift_crosses_midnight:
        return current >= start or current < end
    return start <= current < end


def run_headless(config, shift_info=None):
    """
    Run agent without Tkinter. Heartbeats only, no popup.
    Blocks until KeyboardInterrupt or fatal error.
    """
    state = AgentState()
    tracker = ActivityTracker()
    input_queue = queue.Queue()
    listeners = InputListeners(input_queue)

    if shift_info:
        state.shift_start = shift_info.get("shiftStart")
        state.shift_end = shift_info.get("shiftEnd")
        state.shift_grace_min = shift_info.get("gracePeriod", 20)
        state.shift_crosses_midnight = shift_info.get("crossesMidnight", False)

    listeners.start()
    log.info(
        "v%s HEADLESS (no popup) | idle=%ds, hb=%ds, shift=%s→%s",
        AGENT_VERSION, IDLE_THRESHOLD_SEC, HEARTBEAT_INTERVAL_SEC,
        state.shift_start or "always-on", state.shift_end or "always-on",
    )
    safe_print("Service running (headless mode).\n")

    last_connectivity_check = 0
    last_alive_save = 0
    tick_interval = 3

    try:
        while True:
            now = time.time()

            # Drain input queue
            try:
                batch = 0
                while batch < 200:
                    try:
                        event = input_queue.get_nowait()
                    except queue.Empty:
                        break
                    batch += 1
                    kind = event[0]
                    if kind == "move":
                        tracker.on_mouse_move(event[1], event[2], event[3])
                    elif kind == "click":
                        tracker.on_mouse_click(event[1], event[2], event[3])
                    elif kind == "scroll":
                        tracker.on_mouse_scroll()
                    elif kind == "key":
                        tracker.on_key_event()
                    if _is_within_shift(state):
                        state.record_activity()
            except Exception as e:
                log.error("Headless poll error: %s", e)

            if not _is_within_shift():
                time.sleep(tick_interval)
                continue

            # System idle supplement
            sys_idle = get_system_idle_seconds()
            if sys_idle >= 0 and sys_idle < state.idle_seconds - 5:
                state.record_activity()

            # Lock detection
            locked = is_system_locked()
            if locked and not state.system_locked:
                state.system_locked = True
                log.info("System LOCKED — marking IDLE")
            elif not locked and state.system_locked:
                state.system_locked = False
                log.info("System UNLOCKED")

            # Current state
            idle_secs = state.idle_seconds
            current = "IDLE" if (state.system_locked or idle_secs >= IDLE_THRESHOLD_SEC) else "ACTIVE"

            # Heartbeat
            interval = config.get("heartbeatIntervalSec", HEARTBEAT_INTERVAL_SEC)
            state_changed = current != state.last_heartbeat_state
            interval_elapsed = (now - state.last_heartbeat_time) >= interval
            if (state_changed or interval_elapsed) and not state.heartbeat_in_flight:
                state.last_heartbeat_state = current
                state.last_heartbeat_time = now
                state.heartbeat_in_flight = True

                def do_hb(s=current, sc=tracker.calculate_activity_score() if current == "ACTIVE" else None):
                    try:
                        ok = send_heartbeat(config, s, sc, False)
                        if ok:
                            state.consecutive_hb_failures = 0
                        else:
                            state.consecutive_hb_failures += 1
                    except Exception as e:
                        log.warning("Heartbeat error: %s", e)
                        state.consecutive_hb_failures += 1
                    finally:
                        state.heartbeat_in_flight = False

                threading.Thread(target=do_hb, daemon=True).start()

            # Connectivity check
            if now - last_connectivity_check >= CONNECTIVITY_CHECK_SEC:
                last_connectivity_check = now
                server_url = config.get("serverUrl", "")
                if server_url:
                    if state.consecutive_hb_failures >= 2 and state.online:
                        if not network.is_online(server_url):
                            state.mark_offline()
                            log.warning("Network OFFLINE (headless)")
                    elif not state.online:
                        if network.is_online(server_url):
                            state.mark_online()
                            log.info("Network ONLINE — reconnected")
                            if network.has_buffered_requests():
                                def _flush():
                                    time.sleep(2)
                                    network.flush_buffer()
                                threading.Thread(target=_flush, daemon=True).start()
                    elif network.has_buffered_requests():
                        threading.Thread(target=network.flush_buffer, daemon=True).start()

            # Save alive
            if now - last_alive_save >= ALIVE_SAVE_SEC:
                last_alive_save = now
                network.save_alive_ts(config["empCode"])

            time.sleep(tick_interval)

    except KeyboardInterrupt:
        pass
    finally:
        listeners.stop()
        network.save_alive_ts(config["empCode"])
        log.info("Headless agent shut down.")
