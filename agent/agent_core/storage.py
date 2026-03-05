"""
Local NDJSON log store for activity events.
Offline resilience: append locally, sync on reconnect, purge on 200 OK.
"""
import json
import os
import sys


def _data_dir():
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data = os.path.join(base, "agent_data")
    os.makedirs(data, exist_ok=True)
    return data


def _log_path():
    return os.path.join(_data_dir(), "activity_log.ndjson")


def append_event(event: dict) -> None:
    path = _log_path()
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")


def read_all_events() -> list[dict]:
    path = _log_path()
    if not os.path.isfile(path):
        return []
    events = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))
    except (json.JSONDecodeError, OSError):
        pass
    return events


def purge_log() -> None:
    path = _log_path()
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass
