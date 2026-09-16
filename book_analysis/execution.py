"""Local, permission-scoped execution history and liveness diagnostics."""
import logging
from datetime import timedelta

from django.utils import timezone

from .errors import AnalysisError
from .models import ExecutionEvent, WorkerLease

logger = logging.getLogger(__name__)
STRING_FIELDS = {'phase', 'chapter_title', 'provider_name', 'model_name', 'model_role', 'request_id', 'finish_reason', 'error_type', 'reason', 'summary', 'json_mode', 'thinking_mode', 'method'}
NUMBER_FIELDS = {'chapter_ordinal', 'segment', 'segments', 'attempt', 'chars', 'duration_ms', 'nodes', 'edges', 'timeout_seconds', 'sdk_retries', 'vectors', 'request_attempt', 'streaming', 'deadline_seconds', 'max_tokens', 'prompt_tokens', 'completion_tokens', 'split_depth', 'sources'}


def record_event(run, kind: str, title: str, level: str = 'info', details: dict | None = None, token: str = ''):
    if token and not WorkerLease.objects.filter(pk='book-analysis', owner=token, run_id=run.pk, expires_at__gt=timezone.now()).exists():
        raise AnalysisError('任务执行租约已失效', 409)
    safe = {}
    for key, value in (details or {}).items():
        if key in STRING_FIELDS and isinstance(value, str):
            safe[key] = value[:400]
        elif key in NUMBER_FIELDS and isinstance(value, (int, float)) and not isinstance(value, bool):
            safe[key] = max(0, int(value))
    event = ExecutionEvent.objects.create(run=run, kind=kind[:40], title=title[:255], level=level, details=safe)
    logger.info('Book execution: run=%s kind=%s phase=%s title=%s', run.pk, kind, safe.get('phase', ''), title[:255])
    return event


def event_data(event):
    return {'id': event.pk, 'kind': event.kind, 'title': event.title, 'level': event.level, 'details': event.details, 'created_at': event.created_at}


def execution_data(run):
    events = list(run.events.order_by('-id')[:80])
    events.reverse()
    lease = WorkerLease.objects.filter(pk='book-analysis', run_id=run.pk).first() if run.state == 'running' else None
    now = timezone.now()
    recovering = run.state == 'running' and (not lease or not lease.expires_at or lease.expires_at <= now)
    # An expiry in the future is only evidence of a recent lease heartbeat,
    # not proof that the model call or the worker is making progress.
    heartbeat_at = lease.expires_at - timedelta(seconds=180) if lease and lease.expires_at else None
    return {'events': [event_data(e) for e in events], 'events_truncated': bool(events and run.events.filter(id__lt=events[0].pk).exists()), 'updated_at': run.updated_at, 'server_time': now, 'heartbeat_at': heartbeat_at, 'lease_expires_at': lease.expires_at if lease else None, 'recovering': recovering}
