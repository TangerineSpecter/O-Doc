"""Local-only full request snapshots, retained for the latest 30 calendar days."""
import base64
import json
import logging
import os
import re
import shutil
import tempfile
from datetime import date, datetime, timedelta, timezone as datetime_timezone
from pathlib import Path
from threading import Lock

from django.conf import settings
from django.utils import timezone

_ID_PATTERN = re.compile(r'^[a-fA-F0-9]{1,40}$')
_DAY_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_cleanup_lock = Lock()
_last_cleanup_day = None
logger = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(getattr(settings, 'TOKEN_USAGE_DETAILS_ENABLED', True))


def directory() -> Path:
    configured = str(getattr(settings, 'TOKEN_USAGE_DETAIL_DIR', '')).strip()
    if not configured:
        raise ValueError('TOKEN_USAGE_DETAIL_DIR must be a dedicated nonempty directory')
    unresolved = Path(configured).expanduser()
    if unresolved.is_symlink():
        raise ValueError('Token request detail directory must not be a symlink')
    root = unresolved.resolve()
    forbidden = {Path('/'), Path.home().resolve(), Path('/tmp').resolve()}
    base = Path(settings.BASE_DIR).resolve()
    forbidden.add(base)
    media = Path(settings.MEDIA_ROOT).resolve()
    if root in forbidden or root == media or media in root.parents:
        raise ValueError('Token request details must use a dedicated local directory outside media storage')
    return root


def jsonable(value):
    """Convert SDK response/request objects to JSON without dropping content."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, bytes):
        return {'base64': base64.b64encode(value).decode('ascii')}
    if isinstance(value, dict):
        return {str(key): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(item) for item in value]
    model_dump = getattr(value, 'model_dump', None)
    if callable(model_dump):
        try:
            return jsonable(model_dump(mode='json'))
        except TypeError:
            return jsonable(model_dump())
    if hasattr(value, '__dict__'):
        return {key: jsonable(item) for key, item in vars(value).items() if not key.startswith('_')}
    return str(value)


def _started_day(value) -> date:
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if isinstance(value, datetime):
        from system_settings.agent_world.life_time import local_time
        return local_time(value).date()
    if isinstance(value, date):
        return value
    raise ValueError('Token request start time is invalid')


def _path(request_id: str, started_at) -> Path:
    if not isinstance(request_id, str) or not _ID_PATTERN.fullmatch(request_id):
        raise ValueError('Token request ID is invalid')
    day = _started_day(started_at).isoformat()
    return directory() / day / f'{request_id}.json'


def _cleanup(root: Path, today: date) -> None:
    global _last_cleanup_day
    with _cleanup_lock:
        if _last_cleanup_day == today:
            return
        cutoff = today - timedelta(days=29)
        if root.exists():
            for candidate in root.iterdir():
                if candidate.is_symlink() or not candidate.is_dir() or not _DAY_PATTERN.fullmatch(candidate.name):
                    continue
                try:
                    folder_day = date.fromisoformat(candidate.name)
                except ValueError:
                    continue
                if folder_day < cutoff:
                    shutil.rmtree(candidate)
        _last_cleanup_day = today


def maintain() -> None:
    if not enabled():
        return
    try:
        root = directory()
        if root.exists():
            from system_settings.agent_world.life_time import local_time
            _cleanup(root, local_time().date())
    except (OSError, ValueError):
        logger.warning('Token request detail retention cleanup failed')


def write(entry: dict) -> None:
    if not enabled():
        return
    payload = jsonable(entry)
    path = _path(payload['id'], payload['started_at'])
    root = path.parent.parent
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.is_symlink() or path.parent.is_symlink():
        raise ValueError('Token request detail directory must not contain symlinks')
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    os.chmod(path.parent, 0o700)
    if path.is_symlink():
        raise ValueError('Token request detail file must not be a symlink')
    fd, temporary = tempfile.mkstemp(prefix=f'.{payload["id"]}.', suffix='.tmp', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(payload, stream, ensure_ascii=False, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    maintain()


def read_result(request_id: str, started_at) -> tuple[dict | None, str | None]:
    """保留可定位的读取原因，不将当天文件缺失误报为过期。"""
    if not enabled():
        return None, 'disabled'
    try:
        path = _path(request_id, started_at)
        candidates = [path]
        # 旧版按 ISO 字符串前十位保存；带 UTC 偏移的凌晨请求可能落在前一天。
        moment = datetime.fromisoformat(started_at) if isinstance(started_at, str) else started_at
        if isinstance(moment, datetime) and timezone.is_aware(moment):
            for day in (moment.date(), moment.astimezone(datetime_timezone.utc).date()):
                legacy = path.parent.parent / day.isoformat() / path.name
                if legacy not in candidates:
                    candidates.append(legacy)
        for candidate in candidates:
            if candidate.parent.is_symlink() or candidate.is_symlink():
                return None, 'unreadable'
            try:
                with candidate.open('r', encoding='utf-8') as stream:
                    payload = json.load(stream)
            except FileNotFoundError:
                continue
            if not isinstance(payload, dict) or payload.get('id') != request_id:
                return None, 'invalid'
            return payload, None
        from system_settings.agent_world.life_time import local_time
        reason = 'expired' if _started_day(started_at) < local_time().date() - timedelta(days=29) else 'not_found'
        return None, reason
    except OSError:
        return None, 'unreadable'
    except (ValueError, TypeError):
        return None, 'invalid'


def read(request_id: str, started_at) -> dict | None:
    return read_result(request_id, started_at)[0]
