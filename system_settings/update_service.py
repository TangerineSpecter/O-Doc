import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows 不支持网页更新。
    fcntl = None


VERSION_PATTERN = re.compile(r'^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$')
COMMIT_PATTERN = re.compile(r'^[0-9a-f]{40}$', re.IGNORECASE)
ACTIVE_STATES = {
    'queued',
    'pulling',
    'verifyingImage',
    'backingUp',
    'restarting',
    'healthCheck',
}
WORKER_HEARTBEAT_MAX_AGE_SECONDS = 20


class UpdateRequestError(Exception):
    pass


class UpdateBusyError(UpdateRequestError):
    pass


class UpdateUnsupportedError(UpdateRequestError):
    pass


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_version(value):
    match = VERSION_PATTERN.fullmatch(str(value or '').strip())
    if not match:
        raise UpdateRequestError('版本号格式无效，请使用 X.Y.Z 格式')
    return '.'.join(match.groups())


def parse_version(value):
    version = normalize_version(value)
    return tuple(int(part) for part in version.split('.'))


def normalize_commit(value):
    commit = str(value or '').strip().lower()
    if not COMMIT_PATTERN.fullmatch(commit):
        raise UpdateRequestError('构建 commit 必须是 40 位 Git SHA')
    return commit


def get_current_app_version():
    package_file = Path(settings.BASE_DIR) / 'frontend_react' / 'package.json'
    try:
        with package_file.open('r', encoding='utf-8') as file_obj:
            return normalize_version(json.load(file_obj).get('version'))
    except (OSError, ValueError, TypeError, json.JSONDecodeError, UpdateRequestError):
        return 'unknown'


def get_current_build_commit():
    value = str(os.getenv('ODOC_BUILD_COMMIT', '')).strip().lower()
    return value if COMMIT_PATTERN.fullmatch(value) else ''


def _update_dir():
    raw_path = str(os.getenv('ODOC_UPDATE_DIR', '')).strip()
    if not raw_path:
        return None
    return Path(raw_path).expanduser().resolve()


def _path_in_update_dir(filename):
    base_dir = _update_dir()
    if base_dir is None:
        raise UpdateUnsupportedError('当前部署未配置网页更新目录')
    path = (base_dir / filename).resolve()
    if path.parent != base_dir:
        raise UpdateUnsupportedError('更新状态路径无效')
    return path


def _read_json(path):
    try:
        with path.open('r', encoding='utf-8') as file_obj:
            value = json.load(file_obj)
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError, TypeError):
        return {}


def _atomic_write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as file_obj:
            json.dump(value, file_obj, ensure_ascii=False, separators=(',', ':'))
            file_obj.flush()
            os.fsync(file_obj.fileno())
        os.replace(temp_name, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def _worker_is_alive():
    if os.getenv('ODOC_AUTO_UPDATE', '').strip().lower() not in {'1', 'true', 'yes', 'on'}:
        return False
    try:
        heartbeat_path = _path_in_update_dir('heartbeat.json')
        age_seconds = datetime.now(timezone.utc).timestamp() - heartbeat_path.stat().st_mtime
        return age_seconds <= WORKER_HEARTBEAT_MAX_AGE_SECONDS
    except (OSError, UpdateUnsupportedError):
        return False


def _default_status():
    return {
        'state': 'idle',
        'target_version': '',
        'target_commit': '',
        'progress': 0,
        'message': '当前没有更新任务',
        'requested_at': '',
        'started_at': '',
        'finished_at': '',
        'backup_name': '',
        'rollback_succeeded': None,
    }


def get_public_update_status():
    status = _default_status()
    try:
        saved_status = _read_json(_path_in_update_dir('status.json'))
    except UpdateUnsupportedError:
        saved_status = {}

    for key in status:
        if key in saved_status:
            status[key] = saved_status[key]

    return {
        'current_version': get_current_app_version(),
        'current_commit': get_current_build_commit(),
        'auto_update_supported': _worker_is_alive(),
        **status,
    }


def create_update_request(target_version, target_commit):
    if not _worker_is_alive():
        raise UpdateUnsupportedError('网页更新服务未运行，请先在服务器执行一次 manager.sh update')

    version = normalize_version(target_version)
    commit = normalize_commit(target_commit)
    current_version = get_current_app_version()
    if current_version == 'unknown':
        raise UpdateRequestError('无法读取当前系统版本')

    target_parts = parse_version(version)
    current_parts = parse_version(current_version)
    if target_parts < current_parts:
        raise UpdateRequestError(f'目标版本 {version} 低于当前版本 {current_version}')
    if target_parts == current_parts:
        current_commit = get_current_build_commit()
        if not current_commit:
            raise UpdateRequestError('当前镜像缺少构建 commit，不能安全重装同版本')
        if current_commit == commit:
            raise UpdateRequestError('当前已经是目标版本和构建，无需重复更新')

    request_path = _path_in_update_dir('request.json')
    lock_path = _path_in_update_dir('request.lock')
    status_path = _path_in_update_dir('status.json')

    if fcntl is None:
        raise UpdateUnsupportedError('当前操作系统不支持网页更新')

    lock_descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(lock_descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        os.close(lock_descriptor)
        raise UpdateBusyError('另一个更新请求正在处理中') from exc

    try:
        current_status = _read_json(status_path)
        if request_path.exists() or current_status.get('state') in ACTIVE_STATES:
            raise UpdateBusyError('系统更新任务正在运行')

        requested_at = utc_now_iso()
        request_value = {
            'request_id': str(uuid.uuid4()),
            'target_version': version,
            'target_commit': commit,
        }
        status_value = {
            **_default_status(),
            'state': 'queued',
            'target_version': version,
            'target_commit': commit,
            'progress': 2,
            'message': '更新请求已提交，等待更新服务处理',
            'requested_at': requested_at,
        }
        _atomic_write_json(status_path, status_value)
        _atomic_write_json(request_path, request_value)
        return get_public_update_status()
    finally:
        fcntl.flock(lock_descriptor, fcntl.LOCK_UN)
        os.close(lock_descriptor)
