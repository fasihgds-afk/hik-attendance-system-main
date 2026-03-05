import requests


class NetworkClient:
    def __init__(self, base_url: str, timeout: int = 8):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def request(self, method: str, path: str, *, headers=None, json=None, params=None):
        url = f"{self.base_url}{path}"
        response = requests.request(
            method=method,
            url=url,
            headers=headers or {},
            json=json,
            params=params,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def _raw_request(self, method: str, path: str, *, headers=None, json=None, params=None):
        url = f"{self.base_url}{path}"
        return requests.request(
            method=method,
            url=url,
            headers=headers or {"Content-Type": "application/json"},
            json=json,
            params=params,
            timeout=self.timeout,
        )

