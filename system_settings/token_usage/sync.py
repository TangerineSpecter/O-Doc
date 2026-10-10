from django.utils import timezone
from .capture import is_active


def normalize_restored_usage(rows: list[dict]) -> None:
    """A restored request is history, never permission to resume generation."""
    for row in rows:
        if row.get('model') == 'system_settings.agenttokenusage':
            fields = row.get('fields', {})
            if fields.get('status') == 'running' and not is_active(str(row.get('pk'))):
                fields['status'] = 'interrupted'
                fields['usage_complete'] = False
                fields['ended_at'] = timezone.now().isoformat()


def merge_usage_fact(winner: dict, candidates: list[dict | None]) -> dict:
    """Restoring an unfinished snapshot cannot erase a confirmed final usage."""
    confirmed = [row for row in candidates if row and
                 row.get('fields', {}).get('usage_complete') is True and
                 row.get('fields', {}).get('status') in ('success', 'failed')]
    if not confirmed:
        return winner
    return max(confirmed, key=lambda row: str(row['fields'].get('updated_at') or ''))
