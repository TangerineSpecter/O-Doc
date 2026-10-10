"""Device-local permission is required; synced rows alone never trigger AI."""
import logging
import os
import sys
import threading
import uuid
from datetime import timedelta
from django.db import close_old_connections, transaction
from django.utils import timezone
from learning.locking import domain_lock
from .models import Sprout, SproutJob
from .sprout_execution import generate, SproutCancelled

logger = logging.getLogger(__name__)
_started = False
_start_lock = threading.Lock()


def tick():
    with domain_lock(), transaction.atomic():
        expired = list(SproutJob.objects.filter(state='running', expires_at__lte=timezone.now()))
        for job in expired:
            job.state, job.error = 'failed', '执行中断或超时，请手动重试'
            job.token = ''
            job.save()
            interrupted = Sprout.objects.get(pk=job.pk)
            interrupted.status = 'failed'
            interrupted.save(update_fields=['status', 'updated_at'])
        job = SproutJob.objects.select_for_update().filter(state='pending', cancelled=False).first()
        if not job:
            return
        token = uuid.uuid4().hex
        if not SproutJob.objects.filter(pk=job.pk, state='pending').update(state='running', token=token, expires_at=timezone.now()+timedelta(minutes=5)):
            return
        sprout = Sprout.objects.get(pk=job.pk)
        sprout.status = 'running'
        sprout.save(update_fields=['status', 'updated_at'])
    try:
        result = generate(sprout, job, token)
        state, error = 'ready', ''
    except SproutCancelled:
        result, state, error = {}, 'cancelled', ''
    except Exception:
        logger.exception('Memo sprout failed: id=%s', sprout.pk)
        result, state, error = {}, 'failed', '生成未完成，请检查模型／调研工具配置后重试'
    with domain_lock(), transaction.atomic():
        current = SproutJob.objects.select_for_update().filter(pk=job.pk, token=token).first()
        if not current:
            return
        if current.cancelled:
            result, state = {}, 'cancelled'
        current.state, current.stage, current.error = state, '已完成' if state == 'ready' else '已结束', error
        current.token, current.expires_at = '', None
        current.save()
        row = Sprout.objects.get(pk=sprout.pk)
        row.result, row.status = result, state
        row.save(update_fields=['result', 'status', 'updated_at'])


def _loop():
    from django.apps import apps
    apps.ready_event.wait()
    while True:
        try:
            close_old_connections()
            tick()
        except Exception:
            logger.exception('Memo sprout worker tick failed')
        finally:
            close_old_connections()
        threading.Event().wait(1)


def start_worker():
    global _started
    if os.environ.get('ODOC_ENABLE_MEMO_SPROUT', 'true') == 'false' or any(arg in sys.argv for arg in ('test', 'migrate', 'makemigrations', 'check', 'collectstatic', 'shell')):
        return
    with _start_lock:
        if not _started:
            _started = True
            threading.Thread(target=_loop, name='memo-sprout', daemon=True).start()
