import logging
import os
import sys
import threading
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from django.db import close_old_connections, transaction
from django.utils import timezone
from .locking import course_lock
from .time_utils import aware

logger = logging.getLogger(__name__)
_started = False
_start_lock = threading.Lock()


def schedule_tick(now=None):
    from .models import Runtime
    from .services import reserve_exercise
    now = now or timezone.now()
    for rt in Runtime.objects.filter(enabled=True).select_related('course__anthology'):
        if not rt.course.anthology.is_valid:
            continue
        local = aware(now).astimezone(ZoneInfo(rt.course.timezone))
        slot = datetime.combine(local.date(), datetime.strptime(rt.course.schedule_time, '%H:%M').time(), tzinfo=local.tzinfo)
        # No catch-up, including activation after today's scheduled time.
        if not slot <= local < slot + timedelta(minutes=2) or not rt.enabled_at or aware(rt.enabled_at) >= slot:
            continue
        try:
            reserve_exercise(rt.course, 'scheduled:' + slot.isoformat(), scheduled=True)
        except Exception:
            logger.exception('Learning schedule blocked course=%s', rt.course_id)


def claim_next():
    from .models import Attempt, Request, Runtime
    candidates = Request.objects.filter(status='pending', devicejob__isnull=False, course__anthology__is_valid=True).order_by('created_at')[:20]
    for candidate in candidates:
        with course_lock(candidate.course_id), transaction.atomic():
            rt, _ = Runtime.objects.get_or_create(course_id=candidate.course_id)
            if rt.owner:
                continue
            req = Request.objects.select_for_update().get(pk=candidate.pk)
            if req.status != 'pending':
                continue
            rt.owner, rt.claimed_at = uuid.uuid4().hex, timezone.now()
            rt.save(update_fields=['owner', 'claimed_at'])
            req.status = 'running'
            req.save(update_fields=['status', 'updated_at'])
            if req.kind in ('grade', 'review'):
                attempt = Attempt.objects.get(pk=req.target_id)
                attempt.status = 'running'
                attempt.save(update_fields=['status'])
            return req.id, rt.owner
    return None


def expire_jobs():
    from .models import Attempt, Exercise, Request, Runtime
    for rt in Runtime.objects.filter(claimed_at__lt=timezone.now() - timedelta(minutes=5)).exclude(owner=''):
        with course_lock(rt.course_id), transaction.atomic():
            rt.refresh_from_db()
            if not rt.claimed_at or rt.claimed_at >= timezone.now() - timedelta(minutes=5):
                continue
            for req in Request.objects.filter(course_id=rt.course_id, status='running'):
                req.status, req.error = 'failed', '执行中断，未自动重放；请手动重试'
                req.save(update_fields=['status', 'error', 'updated_at'])
                if req.kind == 'generate':
                    ex = Exercise.objects.get(pk=req.target_id)
                    ex.status = 'failed'
                    ex.save(update_fields=['status'])
                elif req.kind in ('grade', 'review'):
                    attempt = Attempt.objects.get(pk=req.target_id)
                    attempt.status = 'failed'
                    attempt.save(update_fields=['status'])
                    ex = attempt.exercise
                    ex.status = 'failed_grading'
                    ex.save(update_fields=['status'])
            rt.owner, rt.claimed_at = '', None
            rt.save(update_fields=['owner', 'claimed_at'])


def _loop():
    from .execution import run_request
    from .goals import claim_goal, run_goal, expire_goals
    from django.apps import apps
    if not apps.ready_event.wait(timeout=30):
        return
    while True:
        try:
            close_old_connections()
            expire_jobs()
            expire_goals()
            schedule_tick()
            claim = claim_next()
            if claim:
                run_request(*claim)
            else:
                goal_claim = claim_goal()
                if goal_claim:
                    run_goal(*goal_claim)
        except Exception:
            logger.exception('Learning worker tick failed')
        finally:
            close_old_connections()
        threading.Event().wait(3)


def start_worker():
    global _started
    from system_settings.sync_scheduler import _is_server_process
    if os.getenv('ODOC_ENABLE_LEARNING', 'true').lower() == 'false' or not (_is_server_process() or ('runserver' in sys.argv and '--noreload' in sys.argv)):
        return
    with _start_lock:
        if _started:
            return
        _started = True
        threading.Thread(target=_loop, name='learning-worker', daemon=True).start()
