from datetime import datetime, timezone
from .network import NetworkClient
from .constants import DEVICE_TOKEN


def _headers():
    return {"x-device-token": DEVICE_TOKEN, "Content-Type": "application/json"}


class AgentApi:
    def __init__(self, client: NetworkClient, emp_code: str, device_id: str, app_version: str):
        self.client = client
        self.emp_code = emp_code
        self.device_id = device_id
        self.app_version = app_version

    def heartbeat(self, status: str, suspicious_active: bool, host_name: str, os_name: str):
        payload = {
            "empCode": self.emp_code,
            "deviceId": self.device_id,
            "deviceToken": DEVICE_TOKEN,
            "status": status,
            "suspiciousActive": suspicious_active,
            "hostName": host_name,
            "os": os_name,
            "appVersion": self.app_version,
        }
        return self.client.request("POST", "/api/agent/heartbeat", json=payload)

    def open_break(self, category: str, reason: str):
        payload = {
            "empCode": self.emp_code,
            "deviceId": self.device_id,
            "category": category,
            "reason": reason,
            "atIso": datetime.now(timezone.utc).isoformat(),
        }
        return self.client.request("POST", "/api/agent/break-log", headers=_headers(), json=payload)

    def update_break_reason(self, break_id: str, category: str, reason: str):
        payload = {
            "empCode": self.emp_code,
            "deviceId": self.device_id,
            "breakId": break_id,
            "action": "update-reason",
            "category": category,
            "reason": reason,
        }
        return self.client.request("PATCH", "/api/agent/break-log", headers=_headers(), json=payload)

    def end_break(self, break_id: str, category: str, reason: str):
        payload = {
            "empCode": self.emp_code,
            "deviceId": self.device_id,
            "breakId": break_id,
            "action": "end-break",
            "category": category,
            "reason": reason,
            "atIso": datetime.now(timezone.utc).isoformat(),
        }
        return self.client.request("PATCH", "/api/agent/break-log", headers=_headers(), json=payload)

    def shift_info(self):
        return self.client.request(
            "GET",
            "/api/agent/shift-info",
            headers=_headers(),
            params={"empCode": self.emp_code, "deviceId": self.device_id},
        )

    def sync_log(self, events: list[dict]) -> tuple[bool, int]:
        """POST events to /api/attendance/sync. Returns (success, status_code)."""
        if not events:
            return True, 200
        try:
            r = self.client._raw_request(
                "POST",
                "/api/attendance/sync",
                json={
                    "employeeCode": self.emp_code,
                    "deviceId": self.device_id,
                    "events": events,
                },
            )
            return r.status_code == 200, r.status_code
        except Exception:
            return False, 0
