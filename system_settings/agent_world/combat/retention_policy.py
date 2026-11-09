"""Local retention of verified ordinary combat rounds, independent of legacy archiving."""
import os
from datetime import datetime, timedelta

RETENTION_ENV = 'ODOC_COMBAT_ROUND_RETENTION_DAYS'


class InvalidRetentionWindow(ValueError):
    """Invalid configuration must suspend deletions, not statistics rebuilding."""


def retention_window(observed_at: datetime) -> tuple[int, datetime]:
    raw = os.environ.get(RETENTION_ENV, '7').strip()
    if not (raw.isascii() and raw.isdecimal() and len(raw) <= 3 and 1 <= int(raw) <= 365):
        raise InvalidRetentionWindow(f'{RETENTION_ENV} 须为 1–365 天的整数；已暂停回合清理')
    days = int(raw)
    return days, observed_at - timedelta(days=days)
