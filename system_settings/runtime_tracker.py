import atexit
import logging
import os
import socket
import threading
from datetime import timedelta

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from .models import SystemSetting
from .sync_scheduler import _env_flag, _is_server_process

logger = logging.getLogger(__name__)

RUNTIME_STATS_KEY = 'system_runtime_stats'


def _parse_datetime(value):
    if not value:
        return None

    try:
        return timezone.datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _default_runtime_state():
    now = timezone.now().isoformat()
    return {
        'total_uptime_seconds': 0,
        'first_started_at': now,
        'last_started_at': '',
        'last_stopped_at': '',
        'active_session_id': '',
        'active_session_started_at': '',
        'last_tick_at': '',
        'updated_at': now,
    }


def get_runtime_state():
    try:
        setting = SystemSetting.objects.filter(key=RUNTIME_STATS_KEY).first()
    except (OperationalError, ProgrammingError):
        return _default_runtime_state()

    state = _default_runtime_state()
    if setting and isinstance(setting.value, dict):
        state.update(setting.value)
    return state


def _save_runtime_state(state):
    state['updated_at'] = timezone.now().isoformat()
    SystemSetting.objects.update_or_create(
        key=RUNTIME_STATS_KEY,
        defaults={
            'value': state,
            'description': '系统累计运行时间统计',
        }
    )
    return state


def _active_session_is_stale(state, now, stale_seconds):
    last_tick_at = _parse_datetime(state.get('last_tick_at'))
    if not state.get('active_session_id') or last_tick_at is None:
        return True

    return now - last_tick_at > timedelta(seconds=stale_seconds)


def get_runtime_info():
    now = timezone.now()
    state = get_runtime_state()
    total_uptime_seconds = int(state.get('total_uptime_seconds') or 0)
    last_tick_at = _parse_datetime(state.get('last_tick_at'))

    if state.get('active_session_id') and last_tick_at:
        elapsed_seconds = max(0, int((now - last_tick_at).total_seconds()))
        total_uptime_seconds += elapsed_seconds

    return {
        'firstStartedAt': state.get('first_started_at') or '',
        'lastStartedAt': state.get('last_started_at') or '',
        'uptimeSeconds': total_uptime_seconds,
    }


class RuntimeTracker:
    def __init__(self):
        self._started = False
        self._thread = None
        self._stop_event = threading.Event()
        self.session_id = f"{socket.gethostname()}:{os.getpid()}"

    @property
    def tick_seconds(self):
        raw_value = os.getenv('ODOC_RUNTIME_TRACKER_TICK_SECONDS', '300')
        try:
            return max(10, int(raw_value))
        except (TypeError, ValueError):
            return 300

    @property
    def stale_seconds(self):
        return self.tick_seconds * 3

    def start(self):
        if self._started:
            return

        self._started = True
        self._claim_session()
        atexit.register(self.stop)

        self._thread = threading.Thread(
            target=self._run_loop,
            name='system-runtime-tracker',
            daemon=True,
        )
        self._thread.start()
        logger.info('Runtime tracker started, tick=%ss', self.tick_seconds)

    def stop(self):
        if not self._started:
            return

        self._stop_event.set()
        self._checkpoint(mark_stopped=True)
        self._started = False

    def _run_loop(self):
        while not self._stop_event.wait(self.tick_seconds):
            self._checkpoint()

    def _claim_session(self):
        try:
            close_old_connections()
            now = timezone.now()
            state = get_runtime_state()
            if state.get('active_session_id') and not _active_session_is_stale(state, now, self.stale_seconds):
                return

            state['active_session_id'] = self.session_id
            state['active_session_started_at'] = now.isoformat()
            state['last_started_at'] = now.isoformat()
            state['last_tick_at'] = now.isoformat()
            if not state.get('first_started_at'):
                state['first_started_at'] = now.isoformat()
            _save_runtime_state(state)
        except Exception:
            logger.exception('Failed to start runtime tracker session')
        finally:
            close_old_connections()

    def _checkpoint(self, mark_stopped=False):
        try:
            close_old_connections()
            now = timezone.now()
            state = get_runtime_state()
            if state.get('active_session_id') != self.session_id:
                if not mark_stopped and _active_session_is_stale(state, now, self.stale_seconds):
                    self._claim_session()
                return

            last_tick_at = _parse_datetime(state.get('last_tick_at')) or now
            elapsed_seconds = max(0, int((now - last_tick_at).total_seconds()))
            state['total_uptime_seconds'] = int(state.get('total_uptime_seconds') or 0) + elapsed_seconds
            state['last_tick_at'] = now.isoformat()

            if mark_stopped:
                state['last_stopped_at'] = now.isoformat()
                state['active_session_id'] = ''
                state['active_session_started_at'] = ''

            _save_runtime_state(state)
        except Exception:
            logger.exception('Failed to checkpoint runtime tracker')
        finally:
            close_old_connections()


_runtime_tracker = RuntimeTracker()


def should_start_runtime_tracker():
    if not _env_flag('ODOC_ENABLE_RUNTIME_TRACKER', 'true'):
        return False

    if _env_flag('ODOC_FORCE_RUNTIME_TRACKER', 'false'):
        return True

    return _is_server_process()


def start_runtime_tracker():
    if should_start_runtime_tracker():
        _runtime_tracker.start()
