"""
AgentApp — the main Tkinter application.

All state, idle detection, heartbeat, popup lifecycle, connectivity
monitoring, and lock detection run inside Tkinter's event loop via
root.after(). Zero busy-wait loops.

Background threads: ONLY pynput listeners + short-lived API call threads.
None of them touch Tkinter directly.
"""

import queue
import threading
import time
import tkinter as tk
from datetime import datetime, timezone, timedelta

from .constants import (
    AGENT_VERSION, IDLE_THRESHOLD_SEC, HEARTBEAT_INTERVAL_SEC,
    CONNECTIVITY_CHECK_SEC, ALIVE_SAVE_SEC, DOWNTIME_MIN_GAP_SEC,
    AUTOCLICKER_CHECK_SEC, AUTOCLICKER_PROCESSES, SHIFT_REFRESH_SEC, THEME,
)
from .config import log, safe_print
from .state import AgentState
from .tracker import ActivityTracker
from .listeners import InputListeners
from .platform_win import (
    is_system_locked, get_system_idle_seconds, detect_autoclicker_processes,
)
from .api import send_heartbeat
from . import http_client
from . import network

_PKT = timezone(timedelta(hours=5))


class AgentApp:
    """
    Owns the Tk main loop. Schedules everything via root.after():
      _poll_input()      — drains pynput queue, updates state    (every 200ms)
      _tick()            — idle/lock/heartbeat logic             (every 3s)
      _check_connectivity() — online/offline transitions         (every 15s)
      _save_alive()      — persist alive timestamp               (every 30s)
      _check_listeners() — restarts dead pynput listeners        (every 30s)

    The root window is hidden (withdrawn). The popup is a Toplevel child.
    """

    def __init__(self, config):
        self._config = config
        self.state = AgentState()
        self._tracker = ActivityTracker()
        self._input_queue = queue.Queue()
        self._listeners = InputListeners(self._input_queue)
        self._root = None
        self._autoclicker_detected = []   # list of detected process names
        self._autoclicker_warned = False   # True once warning popup has been shown
        self._cheat_warning_top = None     # Toplevel for the warning popup

    def run(self):
        """Start the agent. Blocks on Tk mainloop. Call from main thread."""
        self._root = tk.Tk()
        self._root.withdraw()

        self._listeners.start()

        # Schedule recurring tasks
        self._root.after(200, self._poll_input)
        self._root.after(3000, self._tick)
        self._root.after(CONNECTIVITY_CHECK_SEC * 1000, self._check_connectivity)
        self._root.after(ALIVE_SAVE_SEC * 1000, self._save_alive)
        self._root.after(30000, self._check_listeners)
        self._root.after(5000, self._check_autoclicker)  # first scan after 5s
        self._root.after(SHIFT_REFRESH_SEC * 1000, self._refresh_shift_info)

        log.info(
            "v%s started (idle=%ds, hb=%ds, shift=%s→%s)",
            AGENT_VERSION, IDLE_THRESHOLD_SEC, HEARTBEAT_INTERVAL_SEC,
            self.state.shift_start or "always-on",
            self.state.shift_end or "always-on",
        )
        safe_print("Service running.\n")

        try:
            self._root.mainloop()
        finally:
            self._listeners.stop()
            network.save_alive_ts(self._config["empCode"])
            log.info("AgentApp shut down.")

    def stop(self):
        try:
            self._root.quit()
        except Exception:
            pass

    # ─── Shift gating ────────────────────────────────────────

    def _is_within_shift(self) -> bool:
        """
        Check if the current time (PKT) falls within the employee's shift.
        Returns True if no shift info is available (always-on fallback).
        """
        if not self.state.shift_start or not self.state.shift_end:
            return True

        now = datetime.now(_PKT)
        current = now.strftime("%H:%M")
        start = self.state.shift_start
        end = self.state.shift_end

        if self.state.shift_crosses_midnight:
            return current >= start or current < end
        return start <= current < end

    # ─── Input polling (every 200ms) ─────────────────────────

    def _poll_input(self):
        try:
            self._drain_queue()
        except Exception as e:
            log.error("_poll_input error: %s", e)

        self._root.after(200, self._poll_input)

    def _drain_queue(self):
        had_input = False
        batch = 0
        while batch < 200:
            try:
                event = self._input_queue.get_nowait()
            except queue.Empty:
                break
            batch += 1
            had_input = True
            kind = event[0]
            if kind == "move":
                self._tracker.on_mouse_move(event[1], event[2], event[3])
            elif kind == "click":
                self._tracker.on_mouse_click(event[1], event[2], event[3])
            elif kind == "scroll":
                self._tracker.on_mouse_scroll()
            elif kind == "key":
                self._tracker.on_key_event()


        if had_input and self._is_within_shift():
            self.state.record_activity()

    # ─── Tick: idle / lock / heartbeat (every 3s) ────────────

    def _tick(self):
        try:
            self._do_tick()
        except Exception as e:
            log.error("_tick error: %s", e, exc_info=True)
        self._root.after(3000, self._tick)

    def _do_tick(self):
        now = time.time()

        # Skip idle/heartbeat logic outside shift hours
        if not self._is_within_shift():
            return

        # ── System-level idle supplement ──────────
        # pynput can't see input from elevated (admin) windows.
        # GetLastInputInfo reports OS-level idle regardless of elevation.
        sys_idle = get_system_idle_seconds()
        if sys_idle >= 0:
            if sys_idle < self.state.idle_seconds - 5:
                self.state.record_activity()

        # ── Lock detection ────────────────────────
        locked = is_system_locked()

        if locked and not self.state.system_locked:
            self.state.system_locked = True
            self.state.was_locked = True
            self.state.lock_popup_handled = False
            self.state.lock_start_time = now
            log.info("System LOCKED — marking IDLE")

        elif not locked and self.state.system_locked:
            self.state.system_locked = False
            lock_duration = now - self.state.lock_start_time
            log.info("System UNLOCKED (locked for %.0fs)", lock_duration)

        # ── Determine current state ──────────────
        idle_secs = self.state.idle_seconds
        if self.state.system_locked or idle_secs >= IDLE_THRESHOLD_SEC:
            current = "IDLE"
        else:
            current = "ACTIVE"

        # Log approaching idle (once, at ~170s)
        if 170 <= idle_secs < 173 and current == "ACTIVE":
            log.info("Approaching idle: %.0fs (threshold=%ds)", idle_secs, IDLE_THRESHOLD_SEC)

        # ── Heartbeat ────────────────────────────
        interval = self._config.get("heartbeatIntervalSec", HEARTBEAT_INTERVAL_SEC)
        score = None
        cheat_flag = bool(self._autoclicker_detected)
        hb_state = current
        if current == "ACTIVE":
            score = self._tracker.calculate_activity_score()
            if cheat_flag:
                hb_state = "SUSPICIOUS"
                score = 0
                log.warning("SUSPICIOUS — auto-clicker running: %s",
                            ", ".join(self._autoclicker_detected))

        state_changed = hb_state != self.state.last_heartbeat_state
        interval_elapsed = (now - self.state.last_heartbeat_time) >= interval

        if (state_changed or interval_elapsed) and not self.state.heartbeat_in_flight:
            self.state.last_heartbeat_state = hb_state
            self.state.last_heartbeat_time = now
            self.state.heartbeat_in_flight = True

            def do_heartbeat(s=hb_state, sc=score, cheat=cheat_flag):
                success = False
                try:
                    success = send_heartbeat(self._config, s, sc, cheat)
                except Exception as e:
                    log.warning("Heartbeat thread error: %s", e)
                finally:
                    self.state.heartbeat_in_flight = False
                    if success:
                        self.state.consecutive_hb_failures = 0
                    else:
                        self.state.consecutive_hb_failures += 1

            threading.Thread(target=do_heartbeat, daemon=True).start()

    # ─── Connectivity monitoring (every 15s) ──────────────────

    def _check_connectivity(self):
        try:
            self._do_connectivity_check()
        except Exception as e:
            log.error("_check_connectivity error: %s", e)
        self._root.after(CONNECTIVITY_CHECK_SEC * 1000, self._check_connectivity)

    def _do_connectivity_check(self):
        server_url = self._config.get("serverUrl", "")
        if not server_url:
            return

        was_online = self.state.online

        # Detect offline: after 2 consecutive heartbeat failures, verify with socket
        if self.state.consecutive_hb_failures >= 2 and was_online:
            online_now = network.is_online(server_url)
            if not online_now:
                self.state.mark_offline()
                log.warning("Network OFFLINE")
            else:
                self.state.consecutive_hb_failures = 0

        # When offline: check for recovery
        if not self.state.online:
            online_now = network.is_online(server_url)
            if online_now:
                log.info("Network ONLINE — reconnected")
                self.state.mark_online()
                if network.has_buffered_requests():
                    def flush():
                        time.sleep(1)
                        network.flush_buffer()
                    threading.Thread(target=flush, daemon=True).start()
        # When online: flush any buffered requests
        elif network.has_buffered_requests():
            last = getattr(self, "_last_buffered_flush", 0)
            if time.time() - last >= 60:
                self._last_buffered_flush = time.time()
                def flush():
                    time.sleep(1)
                    network.flush_buffer()
                threading.Thread(target=flush, daemon=True).start()

    # ─── Dynamic shift refresh (every 10 min) ───────────────────

    def _refresh_shift_info(self):
        """Keep local shift window synced with Shift Manager changes."""
        try:
            info = network.fetch_shift_info(self._config)
            if info:
                self.state.shift_start = info.get("shiftStart")
                self.state.shift_end = info.get("shiftEnd")
                self.state.shift_grace_min = int(
                    info.get("checkInGracePeriod", info.get("gracePeriod", 20))
                )
                self.state.shift_check_out_grace_min = int(
                    info.get("checkOutGracePeriod", info.get("gracePeriod", 20))
                )
                self.state.shift_crosses_midnight = info.get("crossesMidnight", False)
                log.info(
                    "Shift config refreshed: %s→%s (in_grace=%s, out_grace=%s)",
                    self.state.shift_start or "?",
                    self.state.shift_end or "?",
                    self.state.shift_grace_min,
                    self.state.shift_check_out_grace_min,
                )
        except Exception as e:
            log.warning("Shift refresh failed (non-fatal): %s", e)
        self._root.after(SHIFT_REFRESH_SEC * 1000, self._refresh_shift_info)

    # ─── Auto-clicker detection (every 60s) ─────────────────

    def _check_autoclicker(self):
        try:
            found = detect_autoclicker_processes(AUTOCLICKER_PROCESSES)
            if found and not self._autoclicker_detected:
                log.warning("AUTO-CLICKER DETECTED: %s", ", ".join(found))
                if not self._autoclicker_warned and self._is_within_shift():
                    self._show_cheat_warning()
                    self._autoclicker_warned = True
            elif not found and self._autoclicker_detected:
                log.info("Auto-clicker processes no longer running")
                self._autoclicker_warned = False
                self._dismiss_cheat_warning()
            self._autoclicker_detected = found
        except Exception as e:
            log.error("_check_autoclicker error: %s", e)
        self._root.after(AUTOCLICKER_CHECK_SEC * 1000, self._check_autoclicker)

    def _show_cheat_warning(self):
        """Professional warning popup when auto-clicker is detected."""
        if self._cheat_warning_top is not None:
            return
        try:
            top = tk.Toplevel(self._root)
            self._cheat_warning_top = top
            top.title("Suspicious Activity Detected")
            top.configure(bg="#000000")
            top.attributes("-topmost", True)
            top.resizable(False, False)

            W, H = 440, 360
            top.geometry(f"{W}x{H}")
            top.update_idletasks()
            x = (top.winfo_screenwidth() - W) // 2
            y = (top.winfo_screenheight() - H) // 2
            top.geometry(f"{W}x{H}+{x}+{y}")

            top.grid_rowconfigure(0, weight=1)
            top.grid_columnconfigure(0, weight=1)
            outer = tk.Frame(top, bg="#ef4444", padx=2, pady=2)
            outer.grid(row=0, column=0, sticky="nsew")
            card = tk.Frame(outer, bg="#0a0a0a", padx=2, pady=2)
            card.pack(fill="both", expand=True)

            header = tk.Frame(card, bg="#7f1d1d", height=72)
            header.pack(fill="x")
            header.pack_propagate(False)
            hc = tk.Frame(header, bg="#7f1d1d")
            hc.pack(expand=True, padx=24, pady=16)
            tk.Label(hc, text="\u26a0", font=("Segoe UI", 24), fg="#fca5a5", bg="#7f1d1d").pack(side="left", padx=(0, 14))
            tb = tk.Frame(hc, bg="#7f1d1d")
            tb.pack(side="left")
            tk.Label(tb, text="Suspicious Activity Detected", font=("Segoe UI", 14, "bold"),
                     fg="white", bg="#7f1d1d").pack(anchor="w")
            tk.Label(tb, text="Automated software detected", font=("Segoe UI", 10),
                     fg="#fca5a5", bg="#7f1d1d").pack(anchor="w")

            body = tk.Frame(card, bg="#0a0a0a", padx=28, pady=24)
            body.pack(fill="both", expand=True)

            msg = (
                "Automated clicking software has been detected on your system.\n\n"
                "This activity is not permitted. Your productivity score has been set to zero "
                "and HR has been notified.\n\n"
                "Please close the software immediately to resume normal tracking."
            )
            tk.Label(body, text=msg, font=("Segoe UI", 11),
                     fg="#cbd5e1", bg="#0a0a0a", wraplength=360, justify="left").pack(anchor="w", pady=(0, 20))

            btn = tk.Button(
                body, text="I Understand",
                font=("Segoe UI", 12, "bold"),
                bg="#22c55e", fg="#020617",
                activebackground="#16a34a", activeforeground="#020617",
                relief="flat", padx=28, pady=12, cursor="hand2",
                command=self._dismiss_cheat_warning, highlightthickness=0, bd=0,
            )
            btn.pack()
            btn.bind("<Enter>", lambda e: btn.config(bg="#16a34a"))
            btn.bind("<Leave>", lambda e: btn.config(bg="#22c55e"))

            top.protocol("WM_DELETE_WINDOW", self._dismiss_cheat_warning)
            log.info("Auto-clicker warning popup shown")
        except Exception as e:
            log.error("Failed to show cheat warning: %s", e)
            self._cheat_warning_top = None

    def _dismiss_cheat_warning(self):
        """Close the auto-clicker warning popup."""
        if self._cheat_warning_top is not None:
            try:
                self._cheat_warning_top.destroy()
            except Exception:
                pass
            self._cheat_warning_top = None

    # ─── Alive timestamp (every 30s) ─────────────────────────

    def _save_alive(self):
        try:
            network.save_alive_ts(self._config["empCode"])
        except Exception as e:
            log.error("_save_alive error: %s", e)
        self._root.after(ALIVE_SAVE_SEC * 1000, self._save_alive)

    # ─── Listener watchdog (every 30s) ───────────────────────

    def _check_listeners(self):
        try:
            self._listeners.check_and_restart()
        except Exception as e:
            log.error("Listener watchdog error: %s", e)
        self._root.after(30000, self._check_listeners)


# ─── Downtime recovery (called once at startup, before mainloop) ──

def recover_downtime(config, shift_info=None):
    """
    Check for a power-off/restart gap since last run.
    If the gap is significant, clip it to the shift window and persist
    alive state for future analytics/reporting hooks.
    """
    emp_code = config["empCode"]
    last_alive = network.get_last_alive_ts(emp_code)
    if last_alive is None:
        log.info("No previous alive timestamp — first run or reset")
        network.save_alive_ts(emp_code)
        return

    gap = time.time() - last_alive
    if gap < DOWNTIME_MIN_GAP_SEC:
        log.info("Downtime gap %.0fs (< %ds threshold) — normal restart", gap, DOWNTIME_MIN_GAP_SEC)
        network.save_alive_ts(emp_code)
        return

    log.warning("Detected %.0fs power-off gap (%.1f min)", gap, gap / 60)

    # Clip recovery to shift+grace window if shift info is available.
    effective_start = last_alive
    if shift_info:
        try:
            grace_out_min = int(
                shift_info.get(
                    "checkOutGracePeriod",
                    shift_info.get("gracePeriod", 20),
                )
            )
            grace_sec = grace_out_min * 60
            shift_end_str = shift_info.get("shiftEnd")      # "HH:MM"
            shift_start_str = shift_info.get("shiftStart")   # "HH:MM"
            crosses = shift_info.get("crossesMidnight", False)

            if shift_end_str and shift_start_str:
                alive_dt = datetime.fromtimestamp(last_alive, tz=_PKT)
                alive_date = alive_dt.date()

                sh, sm = map(int, shift_start_str.split(":"))
                eh, em = map(int, shift_end_str.split(":"))

                shift_start_dt = datetime(
                    alive_date.year, alive_date.month, alive_date.day,
                    sh, sm, tzinfo=_PKT,
                )

                if crosses:
                    next_day = alive_date + timedelta(days=1)
                    shift_end_dt = datetime(
                        next_day.year, next_day.month, next_day.day,
                        eh, em, tzinfo=_PKT,
                    )
                    # If last_alive is before midnight, shift_start is same day.
                    # If after midnight, shift started the previous day.
                    if alive_dt.hour < 12:
                        prev_day = alive_date - timedelta(days=1)
                        shift_start_dt = datetime(
                            prev_day.year, prev_day.month, prev_day.day,
                            sh, sm, tzinfo=_PKT,
                        )
                        shift_end_dt = datetime(
                            alive_date.year, alive_date.month, alive_date.day,
                            eh, em, tzinfo=_PKT,
                        )
                else:
                    shift_end_dt = datetime(
                        alive_date.year, alive_date.month, alive_date.day,
                        eh, em, tzinfo=_PKT,
                    )

                grace_end_ts = shift_end_dt.timestamp() + grace_sec
                shift_start_ts = shift_start_dt.timestamp()

                # Skip entirely if last_alive was already past grace end
                if last_alive >= grace_end_ts:
                    log.info(
                        "Power-off at %.0f was after shift grace end (%.0f) — no recovery action needed",
                        last_alive, grace_end_ts,
                    )
                    network.save_alive_ts(emp_code)
                    return

                if effective_start < shift_start_ts:
                    effective_start = shift_start_ts

                clipped_gap = grace_end_ts - effective_start
                log.info(
                    "Recovery clipped to shift window: %.1f min (was %.1f min raw)",
                    clipped_gap / 60, gap / 60,
                )
        except Exception as e:
            log.warning("Shift-clip calculation failed (using raw gap): %s", e)

    _ = effective_start  # reserved for future downtime analytics hooks
    network.save_alive_ts(emp_code)
