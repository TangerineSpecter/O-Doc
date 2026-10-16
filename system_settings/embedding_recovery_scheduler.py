"""Server-side scheduler for rebuilding local embedding indexes."""
import logging
import os
import socket
import threading
from datetime import timedelta

from django.db import OperationalError, ProgrammingError, close_old_connections, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .article_rag_scheduler import CONFIG_KEY as ARTICLE_RAG_CONFIG_KEY, ArticleRagScheduler, _local_now
from .embedding_recovery import (
    RUNTIME_KEY,
    check_embedding_recovery_readiness,
    recover_local_embedding_indexes,
)
from .models import SystemSetting
from .sync_scheduler import (
    _env_flag,
    _is_server_process,
    _local_scheduler_process_is_alive,
    get_scheduler_initial_delay_seconds,
)

logger = logging.getLogger(__name__)
LEASE_SECONDS = 15 * 60


def should_start_embedding_recovery_scheduler():
    if not _env_flag('ODOC_ENABLE_EMBEDDING_RECOVERY', 'true'):
        return False
    if _env_flag('ODOC_FORCE_EMBEDDING_RECOVERY', 'false'):
        return True
    return _is_server_process()


class EmbeddingRecoveryScheduler:
    def __init__(self):
        self._started = False
        self._thread = None
        self._start_lock = threading.Lock()
        self._stop_event = threading.Event()
        self.runner_id = f'{socket.gethostname()}:{os.getpid()}'

    @property
    def poll_seconds(self):
        try:
            return max(30, int(os.getenv('ODOC_EMBEDDING_RECOVERY_POLL_SECONDS', '60')))
        except (TypeError, ValueError):
            return 60

    def start(self):
        with self._start_lock:
            if self._started:
                return
            self._started = True
            self._thread = threading.Thread(
                target=self._run_loop,
                name='embedding-recovery-scheduler',
                daemon=True,
            )
            self._thread.start()
            logger.info('Embedding recovery scheduler started, poll=%ss', self.poll_seconds)

    def _run_loop(self):
        if self._stop_event.wait(get_scheduler_initial_delay_seconds()):
            return
        while not self._stop_event.is_set():
            try:
                close_old_connections()
                config_setting = SystemSetting.objects.filter(key=ARTICLE_RAG_CONFIG_KEY).first()
                config = (config_setting.value or {}) if config_setting else {}
                check_embedding_recovery_readiness()
                window = ArticleRagScheduler.resolve_window(_local_now(), config) if config.get('enabled') else None
                if window and self._claim_lease():
                    try:
                        recover_local_embedding_indexes(deadline=window[1])
                    finally:
                        self._release_lease()
            except (OperationalError, ProgrammingError):
                logger.debug('Embedding recovery scheduler waiting for database', exc_info=True)
            except Exception:
                logger.exception('Unexpected error in embedding recovery scheduler')
            finally:
                close_old_connections()
            self._stop_event.wait(self.poll_seconds)

    def _claim_lease(self):
        now = timezone.now()
        with transaction.atomic():
            SystemSetting.objects.get_or_create(
                key=RUNTIME_KEY,
                defaults={'value': {}, 'description': '本机向量索引自动恢复运行状态'},
            )
            setting = SystemSetting.objects.select_for_update().get(key=RUNTIME_KEY)
            runtime = dict(setting.value or {})
            lease_until = parse_datetime(str(runtime.get('lease_until') or ''))
            if lease_until and timezone.is_aware(lease_until) and lease_until > now:
                if _local_scheduler_process_is_alive(runtime) is not False:
                    return False
            runtime.update({
                'runner_id': self.runner_id,
                'lease_until': (now + timedelta(seconds=LEASE_SECONDS)).isoformat(),
                'updated_at': now.isoformat(),
            })
            setting.value = runtime
            setting.save(update_fields=['value'])
            return True

    def _release_lease(self):
        try:
            with transaction.atomic():
                setting = SystemSetting.objects.select_for_update().filter(key=RUNTIME_KEY).first()
                if not setting:
                    return
                runtime = dict(setting.value or {})
                if runtime.get('runner_id') != self.runner_id:
                    return
                runtime['lease_until'] = ''
                runtime['updated_at'] = timezone.now().isoformat()
                setting.value = runtime
                setting.save(update_fields=['value'])
        except (OperationalError, ProgrammingError):
            logger.debug('Could not release embedding recovery lease', exc_info=True)


_scheduler = EmbeddingRecoveryScheduler()


def start_embedding_recovery_scheduler():
    if should_start_embedding_recovery_scheduler():
        _scheduler.start()
