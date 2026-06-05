import logging
import os
import socket
import threading

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from .agent_memory import safe_promote_due_short_term_memories
from .models import SystemSetting
from .sync_scheduler import _env_flag, _is_server_process, get_scheduler_initial_delay_seconds

logger = logging.getLogger(__name__)

RUNTIME_KEY = 'system_agent_memory_runtime'


def _local_now():
    now = timezone.now()
    if timezone.is_naive(now):
        return now
    return timezone.localtime(now)


def should_start_agent_memory_scheduler():
    if not _env_flag('ODOC_ENABLE_AGENT_MEMORY_SCHEDULER', 'true'):
        return False

    if _env_flag('ODOC_FORCE_AGENT_MEMORY_SCHEDULER', 'false'):
        return True

    return _is_server_process()


class AgentMemoryScheduler:
    def __init__(self):
        self._started = False
        self._thread = None
        self._start_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._run_lock = threading.Lock()
        self.runner_id = f"{socket.gethostname()}:{os.getpid()}"

    @property
    def poll_seconds(self):
        raw_value = os.getenv('ODOC_AGENT_MEMORY_SCHEDULER_POLL_SECONDS', '30')
        try:
            return max(10, int(raw_value))
        except (TypeError, ValueError):
            return 30

    @property
    def promotion_time(self):
        return os.getenv('ODOC_AGENT_MEMORY_PROMOTION_TIME', '03:00')

    def start(self):
        with self._start_lock:
            if self._started:
                return

            self._started = True
            self._thread = threading.Thread(
                target=self._run_loop,
                name='agent-memory-scheduler',
                daemon=True,
            )
            self._thread.start()
            logger.info('Agent memory scheduler started, poll=%ss', self.poll_seconds)

    def _run_loop(self):
        if self._stop_event.wait(get_scheduler_initial_delay_seconds()):
            return

        while not self._stop_event.is_set():
            try:
                close_old_connections()
                self._maybe_run()
            except Exception:
                logger.exception('Unexpected error in agent memory scheduler')
            finally:
                close_old_connections()

            self._stop_event.wait(self.poll_seconds)

    def _maybe_run(self):
        now = _local_now()
        run_time = self._parse_run_time(self.promotion_time)
        if not run_time:
            logger.warning('Agent memory scheduler skipped invalid run time=%s', self.promotion_time)
            return
        if (now.hour, now.minute) < run_time:
            return

        today = now.date().isoformat()
        runtime = self._get_runtime()
        if runtime.get('last_run_date') == today:
            return

        if not self._run_lock.acquire(blocking=False):
            return

        try:
            self._run(today)
        finally:
            self._run_lock.release()

    def _run(self, run_date=None):
        started_at = timezone.now()
        self._save_runtime(
            status='running',
            runner_id=self.runner_id,
            last_started_at=started_at.isoformat(),
            last_error='',
        )
        if run_date:
            self._save_runtime(last_run_date=run_date)

        result = safe_promote_due_short_term_memories()
        self._save_runtime(
            status='success',
            runner_id=self.runner_id,
            last_success_at=timezone.now().isoformat(),
            last_summary=[
                f"晋升长期记忆 {result.get('promoted_count', 0)} 条",
                f"清理过期短期记忆 {result.get('expired_count', 0)} 条",
            ],
        )

    @staticmethod
    def _parse_run_time(value):
        try:
            hour, minute = [int(part) for part in str(value).split(':')[:2]]
        except (TypeError, ValueError):
            return None
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        return hour, minute

    @staticmethod
    def _get_runtime():
        try:
            setting = SystemSetting.objects.filter(key=RUNTIME_KEY).first()
        except (OperationalError, ProgrammingError):
            return {}
        return (setting.value or {}) if setting else {}

    @staticmethod
    def _save_runtime(**patch):
        current = AgentMemoryScheduler._get_runtime()
        current.update(patch)
        current['updated_at'] = timezone.now().isoformat()
        try:
            SystemSetting.objects.update_or_create(
                key=RUNTIME_KEY,
                defaults={
                    'value': current,
                    'description': 'Agent 记忆晋升任务运行时状态',
                }
            )
        except (OperationalError, ProgrammingError):
            return current
        return current


_agent_memory_scheduler = AgentMemoryScheduler()


def start_agent_memory_scheduler():
    if should_start_agent_memory_scheduler():
        _agent_memory_scheduler.start()
