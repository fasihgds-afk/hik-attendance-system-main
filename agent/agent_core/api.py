"""
Server API calls — heartbeat only.

All functions are blocking (called from worker threads, never from the main thread).
"""

import requests

from .config import log
from .constants import API_TIMEOUT_HEARTBEAT
from . import http_client
from . import network


# ─── Heartbeat ───────────────────────────────────────────────────

def send_heartbeat(config, state_str, activity_score=None, autoclicker_detected=False):
    """Send ACTIVE/IDLE heartbeat. Returns True on success."""
    url = f"{config['serverUrl']}/api/agent/heartbeat"
    payload = {
        "deviceId": config["deviceId"],
        "deviceToken": config["deviceToken"],
        "empCode": config["empCode"],
        "state": state_str,
    }
    if activity_score is not None:
        payload["activityScore"] = activity_score
    payload["autoClickerDetected"] = autoclicker_detected

    try:
        resp = http_client.http.post(url, json=payload, timeout=API_TIMEOUT_HEARTBEAT)
        if resp.status_code == 200:
            data = resp.json()
            action = data.get("action", "unknown")
            score_str = f" | score={activity_score}" if activity_score is not None else ""
            log.info("Heartbeat OK | state=%s | action=%s%s", state_str, action, score_str)
            return True
        elif resp.status_code == 401:
            log.error("Heartbeat REJECTED (401) — device may be revoked")
            return False
        else:
            log.warning("Heartbeat failed: HTTP %d — %s", resp.status_code, resp.text[:200])
            return False
    except requests.RequestException as e:
        log.warning("Heartbeat network error: %s", e)
        network.buffer_request("POST", url, payload)
        return False
