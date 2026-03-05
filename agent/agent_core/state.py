from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class AgentState:
    status: str = "ACTIVE"
    suspicious_active: bool = False
    break_id: Optional[str] = None
    break_started_at: Optional[datetime] = None
    last_heartbeat_at: Optional[datetime] = None
    active_shift_date: Optional[str] = None
