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

from utils.remote_storage import create_sync_manager
from utils.sync_manager import SyncError, SyncManager
from .models import SystemSetting

logger = logging.getLogger(__name__)

SYNC_RUNTIME_KEY = 'system_webdav_sync_runtime'
RUNNING_STALE_MINUTES = 180
STARTUP_SYNC_DELAY_MINUTES = 5


def _env_flag(name, default='true'):
    value = os.getenv(name, default)
    return str(value).lower() in {'1', 'true', 'yes', 'on'}


def _is_server_process():
    argv = [arg.lower() for arg in sys.argv]
    executable = Path(sys.argv[0]).name.lower() if sys.argv else ''

    if 'runserver' in argv:
        return os.environ.get('RUN_MAIN') == 'true'

    return any(name in executable for name in ('gunicorn', 'uwsgi', 'daphne', 'uvicorn'))


def get_scheduler_initial_delay_seconds():
    raw_value = os.getenv('ODOC_SCHEDULER_INITIAL_DELAY_SECONDS', '1')
    try:
        return max(0, float(raw_value))
    except (TypeError, ValueError):
        return 1


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
                'description': '自动同步运行时状态',
            }
        )
    except (OperationalError, ProgrammingError):
        return current

    return current


def _parse_runtime_datetime(value):
    if not value:
        return None

    if isinstance(value, str) and value.endswith('Z'):
        value = value[:-1] + '+00:00'

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


def should_pull_remote_before_push(runtime_state, remote_meta):
    """
    上传前只有在「确认远端被其他端更新过」时才先拉取。
    本机尚未对齐过该目的地，或远端快照比本机上次成功更旧时，直接以本地为准上传。
    """
    if not remote_meta:
        return False

    remote_snapshot_id = remote_meta.get('snapshot_id') or ''
    if not remote_snapshot_id:
        return False

    last_synced_snapshot_id = runtime_state.get('last_synced_snapshot_id') or ''
    if not last_synced_snapshot_id:
        return False

    if remote_snapshot_id == last_synced_snapshot_id:
        return False

    if SyncManager.is_remote_version_older(remote_meta.get('app_version')):
        return False

    remote_generated_at = _parse_runtime_datetime(remote_meta.get('generated_at'))
    local_anchor = (
        _parse_runtime_datetime(runtime_state.get('last_push_at'))
        or _parse_runtime_datetime(runtime_state.get('last_success_at'))
    )
    if remote_generated_at and local_anchor and remote_generated_at <= local_anchor:
        return False

    return True


def _local_scheduler_process_is_alive(runtime_state):
    """Return the local scheduler owner's liveness, or ``None`` when unknown."""
    if runtime_state.get('trigger') != 'scheduler':
        return None

    runner_id = str(runtime_state.get('runner_id') or '')
    host, separator, raw_pid = runner_id.rpartition(':')
    if not separator or host != socket.gethostname():
        return None

    try:
        pid = int(raw_pid)
    except (TypeError, ValueError):
        return None
    if pid <= 0:
        return None

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def is_sync_running(runtime_state=None):
    runtime_state = runtime_state if runtime_state is not None else get_runtime_state()
    if runtime_state.get('status') != 'running':
        return False

    if _local_scheduler_process_is_alive(runtime_state) is False:
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
        sync_progress=0,
        cancel_requested=False,
    )
    return True, state


def runner_owns_sync(runner_id):
    if not runner_id:
        return False
    return get_runtime_state().get('runner_id') == runner_id


def should_abort_sync(runner_id):
    """任务被接管或已收到终止请求时，让同步在下一个安全检查点退出。"""
    runtime_state = get_runtime_state()
    return (
        not runner_id
        or runtime_state.get('runner_id') != runner_id
        or bool(runtime_state.get('cancel_requested'))
    )


def cancel_running_sync(reason='同步已取消'):
    runtime_state = get_runtime_state()
    if runtime_state.get('status') != 'running':
        return False, runtime_state

    state = update_runtime_state(
        # 保持运行占用到实际同步线程退出并释放远端锁；否则用户可以立即启动
        # 第二个任务，造成“另一台设备正在同步”的假冲突，甚至并发写远端快照。
        status='running',
        last_error=reason,
        cancel_requested=True,
        last_summary=(list(runtime_state.get('last_summary') or []) + [reason])[-50:],
    )
    return True, state


def append_sync_message(message, max_items=50, runner_id='', progress=None):
    if not message:
        return
    if runner_id and not runner_owns_sync(runner_id):
        return

    runtime_state = get_runtime_state()
    summary = list(runtime_state.get('last_summary') or [])
    summary.append(message)
    patch = {'last_summary': summary[-max_items:]}
    if progress is not None:
        patch['sync_progress'] = max(0, min(100, int(progress)))
    update_runtime_state(**patch)


class WebDavAutoSyncScheduler:
    def __init__(self):
        self._started = False
        self._thread = None
        self._start_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._run_lock = threading.Lock()
        self._boot_at = None
        self.runner_id = f"{socket.gethostname()}:{os.getpid()}"

    @property
    def poll_seconds(self):
        raw_value = os.getenv('ODOC_WEBDAV_SCHEDULER_POLL_SECONDS', '30')
        try:
            return max(10, int(raw_value))
        except (TypeError, ValueError):
            return 30

    def start(self):
        with self._start_lock:
            if self._started:
                return

            self._started = True
            self._boot_at = timezone.now()
            self._thread = threading.Thread(
                target=self._run_loop,
                name='webdav-auto-sync',
                daemon=True,
            )
            self._thread.start()
            logger.info('WebDAV auto sync scheduler started, poll=%ss', self.poll_seconds)

    def _run_loop(self):
        if self._stop_event.wait(get_scheduler_initial_delay_seconds()):
            return

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

        from utils.remote_storage import get_remote_path
        if not get_remote_path(config):
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

        if self._boot_at is not None:
            # 服务刚启动时先保留一段配置窗口，避免旧的内网备份地址立刻触发连接。
            if timezone.now() - self._boot_at < timedelta(minutes=STARTUP_SYNC_DELAY_MINUTES):
                return False

        last_success_at = self._parse_datetime(runtime_state.get('last_success_at'))
        last_started_at = self._parse_datetime(runtime_state.get('last_started_at'))
        anchor = last_success_at or last_started_at

        if anchor is None:
            return self._boot_at is not None

        return timezone.now() - anchor >= timedelta(minutes=interval_minutes)

    def _get_runtime_state(self):
        return get_runtime_state()

    def _save_runtime_state(self, **patch):
        update_runtime_state(**patch)

    def _build_sync_manager(self, config):
        return create_sync_manager(config)

    def _consume_stream(self, stream):
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
                append_sync_message(payload['msg'], runner_id=self.runner_id)
            if payload.get('step') == 'error':
                raise SyncError(payload.get('msg') or '自动同步失败')
        return messages

    def _sync_from_remote_snapshot(self, manager, remote_meta):
        messages = []
        data_count = manager.sync_data_download(
            remote_meta=remote_meta,
            should_abort=lambda: not runner_owns_sync(self.runner_id),
        )
        messages.append(f"数据快照已恢复，共对齐 {data_count} 条记录")
        append_sync_message(messages[-1], runner_id=self.runner_id)

        file_count = manager.sync_assets_download(
            should_abort=lambda: not runner_owns_sync(self.runner_id),
        )
        messages.append(f"媒体资源已对齐，共下载/覆盖 {file_count} 个文件")
        append_sync_message(messages[-1], runner_id=self.runner_id)

        if remote_meta and remote_meta.get('snapshot_id') and runner_owns_sync(self.runner_id):
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
            if not runner_owns_sync(self.runner_id):
                return

            manager = self._build_sync_manager(config)
            append_sync_message('自动同步正在创建本机安全快照并执行 v2 三方合并。', runner_id=self.runner_id)
            snapshot, summary, safety_backup = manager.sync_v2(
                source='scheduler', runner_id=self.runner_id,
                base_snapshot_id=runtime_state.get('last_synced_snapshot_id', ''),
                on_progress=lambda message, progress=None: append_sync_message(
                    message, runner_id=self.runner_id, progress=progress),
                should_abort=lambda: should_abort_sync(self.runner_id),
            )
            snapshot_meta = snapshot['meta']
            messages = [
                f"v2 合并：新增 {summary['created']}、更新 {summary['updated']}、删除 {summary['deleted']}、冲突 {summary['conflicts']}",
                f'本机安全快照：{safety_backup}',
            ]

            if not runner_owns_sync(self.runner_id):
                return

            self._save_runtime_state(
                status='success',
                trigger='scheduler',
                runner_id=self.runner_id,
                last_success_at=timezone.now().isoformat(),
                last_error='',
                last_uploaded_snapshot_id=snapshot_meta['snapshot_id'],
                last_synced_snapshot_id=snapshot_meta['snapshot_id'],
                last_base_snapshot_id=snapshot_meta.get('base_snapshot_id', ''),
                last_push_at=timezone.now().isoformat(),
                last_summary=messages[-20:],
                last_safety_backup=safety_backup,
                last_merge_summary=summary,
                sync_progress=100,
            )
            append_sync_message('自动同步快照已发布，远端 current 指针已更新。', runner_id=self.runner_id, progress=100)
            logger.info('WebDAV auto sync finished successfully')
        except Exception as exc:
            if not runner_owns_sync(self.runner_id):
                return
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
