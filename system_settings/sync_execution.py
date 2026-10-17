"""本机同步任务存活凭证；文件锁由操作系统在进程退出时释放。"""
import fcntl
import threading
from pathlib import Path

from django.conf import settings

_guard = threading.Lock()
_handles = {}


def _lock_path() -> Path:
    return Path(settings.MEDIA_ROOT) / '.sync-v2-runtime' / 'active.lock'


def acquire_execution(runner_id: str) -> bool:
    path = _lock_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open('a+')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return False
    try:
        handle.seek(0)
        handle.truncate()
        handle.write(runner_id)
        handle.flush()
    except BaseException:
        handle.close()
        raise
    with _guard:
        _handles[runner_id] = handle
    return True


def release_execution(runner_id: str) -> None:
    with _guard:
        handle = _handles.pop(runner_id, None)
    if handle is not None:
        handle.close()


def execution_is_alive(runner_id: str) -> bool:
    path = _lock_path()
    if not path.exists():
        return False
    with path.open('r+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return handle.read() == runner_id
        # 能取得锁表示原执行者已退出，磁盘上的任务 ID 只是遗留文本。
        return False
