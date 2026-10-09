"""Project timestamps are naive Asia/Shanghai (USE_TZ=False)."""
from datetime import datetime
from django.utils import timezone


def aware(value):
    return timezone.make_aware(value, timezone.get_default_timezone()) if timezone.is_naive(value) else value


def wire_dates(value):
    if isinstance(value, datetime):
        return aware(value).isoformat()
    if isinstance(value, list):
        return [wire_dates(v) for v in value]
    if isinstance(value, dict):
        return {k: wire_dates(v) for k, v in value.items()}
    return value
