import json
import logging
import os
import socket
import sys
import threading
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from utils.sync_manager import SyncError, SyncManager
from utils.webdav import WebDavClient
from .models import SystemSetting

logger = logging.getLogger(__name__)

SYNC_RUNTIME_KEY = 'system_webdav_sync_runtime'
RUNNING_STALE_MINUTES = 180


def _env_flag(name, default='true'):
    value = os.getenv(name, default)
    return str(value).lower() in {'1', 'true', 'yes', 'on'}


def _is_server_process():
    argv = [arg.lower() for arg in sys.argv]
    executable = Path(sys.argv[0]).name.lower() if sys.argv else ''

    if 'runserver' in argv:
        return os.environ.get('RUN_MAIN') == 'true'

    return any(name in executable for name in ('gunicorn', 'uwsgi', 'daphne', 'uvicorn'))


def should_start_webdav_scheduler():
    if not _env_flag('ODOC_ENABLE_WEBDAV_SCHEDULER', 'true'):
        return False

    if _env_flag('ODOC_FORCE_WEBDAV_SCHEDULER', 'false'):
        return True

    return _is_server_process()


def get_runtime_state():
    try:
        setting = SystemSetting.objects.filter(key=SYNC_RUNTIME_KEY).first()
    except (OperationalError, ProgrammingError):
        return {}

    return (setting.value or {}) if setting else {}


def update_runtime_state(**patch):
    now = timezone.now().isoformat()
    current = get_runtime_state()
    current.update(patch)
    current['updated_at'] = now

    try:
        SystemSetting.objects.update_or_create(
            key=SYNC_RUNTIME_KEY,
            defaults={
                'value': current,
                'description': 'WebDAV 自动同步运行时状态',
            }
        )
    except (OperationalError, ProgrammingError):
        return current

    return current


def _parse_runtime_datetime(value):
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None

    now_is_aware = timezone.is_aware(timezone.now())
    parsed_is_aware = timezone.is_aware(parsed)

    if now_is_aware and not parsed_is_aware:
        # Django supports timezone, but parsed datetime is naive, make it aware
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    elif not now_is_aware and parsed_is_aware:
        # Django does not support timezone, but parsed datetime is aware, make it naive
        return timezone.make_naive(parsed, timezone.get_current_timezone())

    return parsed


def is_sync_running(runtime_state=None):
    runtime_state = runtime_state if runtime_state is not None else get_runtime_state()
    if runtime_state.get('status') != 'running':
        return False

    last_started_at = _parse_runtime_datetime(runtime_state.get('last_started_at'))
    if last_started_at is None:
        return True

    return timezone.now() - last_started_at < timedelta(minutes=RUNNING_STALE_MINUTES)


def mark_sync_started(*, trigger, runner_id, initial_message):
    runtime_state = get_runtime_state()
    if is_sync_running(runtime_state):
        return False, runtime_state

    started_at = timezone.now().isoformat()
    state = update_runtime_state(
        status='running',
        trigger=trigger,
        runner_id=runner_id,
        last_started_at=started_at,
        last_error='',
        last_summary=[initial_message],
    )
    return True, state


def append_sync_message(message, max_items=50):
    if not message:
        return

    runtime_state = get_runtime_state()
    summary = list(runtime_state.get('last_summary') or [])
    summary.append(message)
    update_runtime_state(last_summary=summary[-max_items:])


class WebDavAutoSyncScheduler:
    def __init__(self):
        self._started = False
        self._thread = None
        self._stop_event = threading.Event()
        self._run_lock = threading.Lock()
        self.runner_id = f"{socket.gethostname()}:{os.getpid()}"

    @property
    def poll_seconds(self):
        raw_value = os.getenv('ODOC_WEBDAV_SCHEDULER_POLL_SECONDS', '30')
        try:
            return max(10, int(raw_value))
        except (TypeError, ValueError):
            return 30

    def start(self):
        if self._started:
            return

        self._thread = threading.Thread(
            target=self._run_loop,
            name='webdav-auto-sync',
            daemon=True,
        )
        self._thread.start()
        self._started = True
        logger.info('WebDAV auto sync scheduler started, poll=%ss', self.poll_seconds)

    def _run_loop(self):
        while not self._stop_event.is_set():
            try:
                close_old_connections()
                self._maybe_run_sync()
            except Exception:
                logger.exception('Unexpected error in WebDAV auto sync scheduler')
            finally:
                close_old_connections()

            self._stop_event.wait(self.poll_seconds)

    def _maybe_run_sync(self):
        try:
            config_setting = SystemSetting.objects.filter(key='system_webdav_config').first()
        except (OperationalError, ProgrammingError):
            return

        if not config_setting:
            return

        config = config_setting.value or {}
        if not config.get('enabled'):
            return

        interval_minutes = self._parse_interval_minutes(config.get('interval', 30))
        runtime_state = self._get_runtime_state()
        if not self._is_due(runtime_state, interval_minutes):
            return

        if not self._run_lock.acquire(blocking=False):
            return

        try:
            self._run_sync(config, runtime_state)
        finally:
            self._run_lock.release()

    @staticmethod
    def _parse_interval_minutes(raw_value):
        try:
            return max(5, int(raw_value))
        except (TypeError, ValueError):
            return 30

    @staticmethod
    def _parse_datetime(value):
        return _parse_runtime_datetime(value)

    def _is_due(self, runtime_state, interval_minutes):
        if is_sync_running(runtime_state):
            return False

        last_success_at = self._parse_datetime(runtime_state.get('last_success_at'))
        last_started_at = self._parse_datetime(runtime_state.get('last_started_at'))
        anchor = last_success_at or last_started_at

        if anchor is None:
            return True

        return timezone.now() - anchor >= timedelta(minutes=interval_minutes)

    def _get_runtime_state(self):
        return get_runtime_state()

    def _save_runtime_state(self, **patch):
        update_runtime_state(**patch)

    def _build_sync_manager(self, config):
        client = WebDavClient(config['url'], config['username'], config['password'])
        remote_path = config.get('remote_path') or config.get('remotePath') or '/o-doc-sync/'
        return SyncManager(client, remote_path)

    @staticmethod
    def _consume_stream(stream):
        messages = []
        for chunk in stream:
            if not chunk:
                continue
            try:
                payload = json.loads(chunk.strip())
            except json.JSONDecodeError:
                continue
            if payload.get('msg'):
                messages.append(payload['msg'])
                append_sync_message(payload['msg'])
            if payload.get('step') == 'error':
                raise SyncError(payload.get('msg') or '自动同步失败')
        return messages

    def _sync_from_remote_snapshot(self, manager, remote_meta):
        messages = []
        data_count = manager.sync_data_download()
        messages.append(f"数据快照已恢复，共对齐 {data_count} 条记录")
        append_sync_message(messages[-1])

        file_count = manager.sync_assets_download()
        messages.append(f"媒体资源已对齐，共下载/覆盖 {file_count} 个文件")
        append_sync_message(messages[-1])

        if remote_meta and remote_meta.get('snapshot_id'):
            snapshot_id = remote_meta['snapshot_id']
            now = timezone.now().isoformat()
            self._save_runtime_state(
                last_pulled_snapshot_id=snapshot_id,
                last_synced_snapshot_id=snapshot_id,
                last_pull_at=now,
            )

        return messages

    def _run_sync(self, config, runtime_state):
        acquired, _ = mark_sync_started(
            trigger='scheduler',
            runner_id=self.runner_id,
            initial_message='自动同步开始：准备检查远端快照与本地资源',
        )
        if not acquired:
            logger.info('WebDAV auto sync skipped because another sync is running')
            return

        try:
            manager = self._build_sync_manager(config)
            issues = manager.validate_upload_state()
            if issues:
                raise SyncError('；'.join(issues))

            remote_meta = manager.get_remote_snapshot_meta()
            manager.validate_remote_snapshot_version(remote_meta)
            remote_snapshot_id = (remote_meta or {}).get('snapshot_id')
            last_synced_snapshot_id = runtime_state.get('last_synced_snapshot_id')

            messages = []
            if remote_snapshot_id and remote_snapshot_id != last_synced_snapshot_id:
                messages.append('检测到远端快照已更新，自动同步先执行拉取对齐。')
                append_sync_message(messages[-1])
                messages.extend(self._sync_from_remote_snapshot(manager, remote_meta))

            messages.extend(self._consume_stream(manager.sync_assets_upload_stream()))
            messages.extend(self._consume_stream(manager.sync_data_upload_stream()))
            snapshot_meta = manager.write_snapshot_meta(
                source='scheduler',
                runner_id=self.runner_id,
            )

            self._save_runtime_state(
                status='success',
                trigger='scheduler',
                runner_id=self.runner_id,
                last_success_at=timezone.now().isoformat(),
                last_error='',
                last_uploaded_snapshot_id=snapshot_meta['snapshot_id'],
                last_synced_snapshot_id=snapshot_meta['snapshot_id'],
                last_push_at=timezone.now().isoformat(),
                last_summary=messages[-20:],
            )
            logger.info('WebDAV auto sync finished successfully')
        except Exception as exc:
            self._save_runtime_state(
                status='error',
                trigger='scheduler',
                runner_id=self.runner_id,
                last_error=str(exc),
            )
            logger.exception('WebDAV auto sync failed')


_scheduler = WebDavAutoSyncScheduler()


def start_webdav_scheduler():
    if should_start_webdav_scheduler():
        _scheduler.start()


def generate_runner_id(prefix='manual'):
    return f"{prefix}:{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
