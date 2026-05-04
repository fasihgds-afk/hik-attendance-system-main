"""
Entry point and auto-restart wrapper.

SSL CA bundle fix happens in agent.py (before imports).
"""

import sys
import time

from .constants import AGENT_VERSION
from .config import log, safe_print, load_config
from . import http_client
from . import network
from .enrollment import gui_enroll
from .platform_win import ensure_single_instance, setup_autostart, is_autostart_enabled
from .app import AgentApp, recover_downtime
from .headless import run_headless


def main():
    """Primary agent entry point."""
    safe_print("Windows System Health Monitor v" + AGENT_VERSION)
    safe_print()

    # Allow one retry after 8s (handles race after crash restart)
    if not ensure_single_instance():
        log.info("Another instance detected — waiting 8s before retry...")
        time.sleep(8)
        if not ensure_single_instance():
            safe_print("Already running. Exiting.")
            sys.exit(0)

    config = load_config()

    if not config:
        config = gui_enroll()
        if not config:
            sys.exit(1)
        setup_autostart()
    else:
        log.info("Loaded config for %s (device: %s)",
                 config["empCode"], config["deviceId"][:8] + "...")
        if not is_autostart_enabled():
            setup_autostart()

    # ── Quick connectivity check (don't block startup when offline) ──
    server_url = config.get("serverUrl", "")
    online_at_start = bool(server_url) and network.is_online(server_url)
    if not online_at_start:
        log.info("Offline at startup — will use cached shift, buffer recovery, sync when online")

    # ── Fetch shift info from server (skip when offline, use always-on) ──
    shift_info = None
    if online_at_start:
        try:
            shift_info = network.fetch_shift_info(config)
        except Exception as e:
            log.warning("Shift info fetch failed: %s — using always-on mode", e)
    else:
        shift_info = network.load_cached_shift(config)

    # ── Recover from power-off / restart gap (run in thread when offline to avoid blocking) ──
    if online_at_start:
        try:
            recover_downtime(config, shift_info=shift_info)
        except Exception as e:
            log.warning("Downtime recovery failed: %s", e)
    else:
        import threading
        def _recover_async():
            try:
                recover_downtime(config, shift_info=shift_info)
            except Exception as e:
                log.warning("Downtime recovery failed (offline): %s", e)
        threading.Thread(target=_recover_async, daemon=True).start()

    # ── Flush any offline-buffered requests (skip when offline — will flush on reconnect) ──
    if online_at_start and network.has_buffered_requests():
        log.info("Flushing offline buffer from previous session...")
        try:
            network.flush_buffer()
        except Exception as e:
            log.warning("Buffer flush failed: %s", e)

    # ── Start the agent (Tk) or headless if Tcl/Tk fails ──
    try:
        app = AgentApp(config)
        if shift_info:
            app.state.shift_start = shift_info.get("shiftStart")
            app.state.shift_end = shift_info.get("shiftEnd")
            app.state.shift_grace_min = int(
                shift_info.get("checkInGracePeriod", shift_info.get("gracePeriod", 20))
            )
            app.state.shift_check_out_grace_min = int(
                shift_info.get("checkOutGracePeriod", shift_info.get("gracePeriod", 20))
            )
            app.state.shift_crosses_midnight = shift_info.get("crossesMidnight", False)
        app.run()
    except Exception as e:
        err_str = str(e)
        if "Tcl" in err_str or "init.tcl" in err_str or "tkinter" in err_str.lower():
            log.warning("Tkinter unavailable (%s) — running in headless mode (no popup)", e)
            run_headless(config, shift_info)
        else:
            raise


def run_with_auto_restart():
    """
    Wrapper that auto-restarts on crash. Never gives up.
    Crash counter resets if the agent ran for 2+ minutes (not a boot-loop).
    """
    crash_count = 0
    crash_window = 120
    max_rapid_crashes = 10

    while True:
        start_time = time.time()
        try:
            main()
            break
        except KeyboardInterrupt:
            safe_print("\nAgent stopped by user.")
            break
        except SystemExit as e:
            if str(e) == "0":
                break
            log.error("Agent SystemExit: %s", e)
        except Exception as e:
            elapsed = time.time() - start_time
            log.error("Agent crashed after %.0fs: %s", elapsed, e, exc_info=True)

            if elapsed > crash_window:
                crash_count = 0
            crash_count += 1

            if crash_count >= max_rapid_crashes:
                wait = 120
                log.warning("Many rapid crashes (%d). Waiting %ds...", crash_count, wait)
            else:
                wait = min(10 * crash_count, 60)

            log.info("Restarting in %ds (crash %d)...", wait, crash_count)
            time.sleep(wait)

            http_client.http = http_client.reset_session(http_client.http)
